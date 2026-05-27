import type { ServiceProps } from "@/schema";
import type { ServiceFallbacks } from "@/schema/order";
import type { DgpServiceMap } from "@/schema/provider";
import type { FallbackSettings } from "@/schema/validation";
import type { PruneResult } from "../prune-fallbacks";
import { pruneInvalidNodeFallbacks } from "../prune-fallbacks";
import { constraintFitOk, rateOk } from "../util";

type PruneEnv = {
    tagId: string;
    constraints?: Partial<Record<"refill" | "cancel" | "dripfeed", boolean>>;
    serviceMap: Record<string, Array<string | number>>;
    servicesList: Array<string | number>;
};

export function pruneFallbacksConservative(
    fallbacks: ServiceFallbacks | undefined,
    env: PruneEnv,
    svcMap: DgpServiceMap,
    policy: FallbackSettings,
): { pruned?: ServiceFallbacks; original?: ServiceFallbacks } {
    if (!fallbacks) return { pruned: undefined, original: undefined };

    try {
        const { props: prunedProps }: PruneResult = pruneInvalidNodeFallbacks(
            {
                filters: [],
                fields: [],
                schema_version: "1.0",
                fallbacks,
            } as unknown as ServiceProps,
            svcMap,
            policy,
        );
        return {
            pruned: prunedProps.fallbacks as ServiceFallbacks | undefined,
            original: fallbacks,
        };
    } catch {
        const out: ServiceFallbacks = {};
        const requireFit = policy.requireConstraintFit ?? true;

        if ((fallbacks as any).nodes) {
            const keptNodes: Record<string, Array<string | number>> = {};
            for (const [nodeId, candidates] of Object.entries(
                (fallbacks as any).nodes as Record<string, Array<string | number>>,
            )) {
                if (!env.serviceMap[nodeId]) continue;
                const primary = (env.serviceMap[nodeId] ?? [])[0];
                const kept: Array<string | number> = [];
                for (const cand of candidates ?? []) {
                    if (!rateOk(svcMap, cand, primary, policy)) continue;
                    if (requireFit && env.constraints && !constraintFitOk(svcMap, cand, env.constraints)) continue;
                    kept.push(cand);
                }
                if (kept.length) keptNodes[nodeId] = kept;
            }
            if (Object.keys(keptNodes).length) (out as any).nodes = keptNodes;
        }

        if ((fallbacks as any).global) {
            const keptGlobal: Record<string | number, Array<string | number>> = {};
            const present = new Set(env.servicesList.map((sid) => String(sid)));
            for (const [primary, cands] of Object.entries(
                (fallbacks as any).global as Record<string | number, Array<string | number>>,
            )) {
                if (!present.has(String(primary))) continue;
                const primId: string | number = isFiniteNumber(primary)
                    ? Number(primary)
                    : (primary as any);
                const kept: Array<string | number> = [];
                for (const cand of cands ?? []) {
                    if (!rateOk(svcMap, cand, primId, policy)) continue;
                    if (requireFit && env.constraints && !constraintFitOk(svcMap, cand, env.constraints)) continue;
                    kept.push(cand);
                }
                if (kept.length) keptGlobal[primId] = kept;
            }
            if (Object.keys(keptGlobal).length) (out as any).global = keptGlobal;
        }

        return {
            pruned: Object.keys(out).length ? out : undefined,
            original: fallbacks,
        };
    }
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}
