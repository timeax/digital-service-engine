import type {
    DgpServiceCapability,
    DgpServiceMap,
    ServiceIdRef,
} from "@/schema";
import type { FallbackSettings, RatePolicy } from "@/schema/validation";

/**
 * Safely convert unknown to a finite number. Returns NaN if not finite.
 */
export function toFiniteNumber(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
}

/**
 * Check if a candidate service satisfies the active tag constraints.
 * Only flags explicitly set to true are treated as required.
 */
export function constraintFitOk(
    svcMap: DgpServiceMap,
    candidate: ServiceIdRef,
    constraints: Partial<Record<"refill" | "cancel" | "dripfeed", boolean>>,
): boolean {
    const cap = getServiceCapability(svcMap, candidate);
    if (!cap) return false;

    if (constraints.dripfeed === true && !cap.dripfeed) return false;
    if (constraints.refill === true && !cap.refill) return false;
    return !(constraints.cancel === true && !cap.cancel);

}

export function getServiceCapability(
    svcMap: DgpServiceMap,
    candidate: ServiceIdRef | undefined,
): DgpServiceCapability | undefined {
    if (candidate === undefined || candidate === null) return undefined;

    const direct = (svcMap as any)[candidate] as DgpServiceCapability | undefined;
    if (direct) return direct;

    const byString = (svcMap as any)[String(candidate)] as
        | DgpServiceCapability
        | undefined;
    if (byString) return byString;

    if (typeof candidate === "string") {
        const maybeNumber = Number(candidate);
        if (Number.isFinite(maybeNumber)) {
            return (svcMap as any)[maybeNumber] as DgpServiceCapability | undefined;
        }
    }

    return undefined;
}

export function normalizeRatePolicy(policy: RatePolicy | undefined): RatePolicy {
    if (!policy) return { kind: "lte_primary", pct: 5 };
    if (policy.kind === "eq_primary") return policy;
    const pct = Math.max(0, Number(policy.pct ?? 0));
    return { ...policy, pct };
}

export function passesRatePolicy(
    policy: RatePolicy | undefined,
    primaryRate: number,
    candidateRate: number,
): boolean {
    if (!Number.isFinite(primaryRate) || !Number.isFinite(candidateRate)) {
        return false;
    }

    const rp = normalizeRatePolicy(policy);
    switch (rp.kind) {
        case "eq_primary":
            return candidateRate === primaryRate;
        case "lte_primary": {
            const floor = primaryRate * (1 - rp.pct / 100);
            return candidateRate <= primaryRate && candidateRate >= floor;
        }
        case "within_pct":
            return candidateRate <= primaryRate * (1 + rp.pct / 100);
        case "at_least_pct_lower":
            return candidateRate <= primaryRate * (1 - rp.pct / 100);
    }
}

/**
 * Evaluate candidate rate against primary according to the fallback rate policy.
 * If either service is missing or rates are not finite, returns false.
 */
export function rateOk(
    svcMap: DgpServiceMap,
    candidate: ServiceIdRef,
    primary: ServiceIdRef,
    policy: FallbackSettings,
): boolean {
    const cand = getServiceCapability(svcMap, candidate);
    const prim = getServiceCapability(svcMap, primary);
    if (!cand || !prim) return false;

    const cRate = toFiniteNumber(cand.rate);
    const pRate = toFiniteNumber(prim.rate);
    if (!Number.isFinite(cRate) || !Number.isFinite(pRate)) return false;

    return passesRatePolicy(policy.ratePolicy, pRate, cRate);
}
