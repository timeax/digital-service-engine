// src/core/utils/fallback.ts
import type {ServiceProps, ServiceFallback, ServiceIdRef, NodeIdRef} from '../schema';
import type {DgpServiceMap} from '../schema/provider';
import type {FallbackSettings} from '../schema/validation';

export type FailedFallbackContext = {
    scope: 'node' | 'global';
    nodeId?: string;              // when scope='node'
    primary: ServiceIdRef;
    candidate: ServiceIdRef;
    tagContext?: string;          // tag.id when evaluating constraints
    reason: 'unknown_service' | 'no_primary' | 'rate_violation' | 'constraint_mismatch' | 'cycle' | 'no_tag_context';
    details?: Record<string, unknown>;
};

const DEFAULT_SETTINGS: Required<FallbackSettings> = {
    requireConstraintFit: true,
    ratePolicy: {kind: 'lte_primary'},
    selectionStrategy: 'priority',
    mode: 'strict',
};

export function resolveServiceFallback(params: {
    primary: ServiceIdRef;
    nodeId?: NodeIdRef;                 // prefer node-scoped first if provided
    tagId?: string;                     // constraints context (if known)
    services: DgpServiceMap;
    fallbacks?: ServiceFallback;
    settings?: FallbackSettings;
    props: ServiceProps;
}): ServiceIdRef | null {
    const s = {...DEFAULT_SETTINGS, ...(params.settings ?? {})};
    const {primary, nodeId, tagId, services} = params;
    const fb = params.fallbacks ?? {};
    const tried: ServiceIdRef[] = [];

    const lists: ServiceIdRef[][] = [];
    if (nodeId && fb.nodes?.[nodeId]) lists.push(fb.nodes[nodeId]);
    if (fb.global?.[primary]) lists.push(fb.global[primary]);

    const primaryRate = rateOf(services, primary);

    for (const list of lists) {
        for (const cand of list) {
            if (tried.includes(cand)) continue;
            tried.push(cand);

            const candCap = services[Number(cand)] ?? services[cand as any];
            if (!candCap) continue;

            if (!passesRate(s.ratePolicy, primaryRate, candCap.rate)) continue;
            if (s.requireConstraintFit && tagId) {
                const ok = satisfiesTagConstraints(tagId, params, candCap);
                if (!ok) continue;
            }
            return cand;
        }
    }
    return null;
}

export function collectFailedFallbacks(
    props: ServiceProps,
    services: DgpServiceMap,
    settings?: FallbackSettings
): FailedFallbackContext[] {
    const s = {...DEFAULT_SETTINGS, ...(settings ?? {})};
    const out: FailedFallbackContext[] = [];
    const fb = props.fallbacks ?? {};
    const primaryRate = (p: ServiceIdRef) => rateOf(services, p);

    // Node-scoped (tags or options)
    for (const [nodeId, list] of Object.entries(fb.nodes ?? {})) {
        const {primary, tagContexts} = primaryForNode(props, nodeId);
        if (!primary) {
            out.push({scope: 'node', nodeId, primary: '' as any, candidate: '' as any, reason: 'no_primary'});
            continue;
        }
        for (const cand of list) {
            const cap = getCap(services, cand);
            if (!cap) {
                out.push({scope: 'node', nodeId, primary, candidate: cand, reason: 'unknown_service'});
                continue;
            }
            if (String(cand) === String(primary)) {
                out.push({scope: 'node', nodeId, primary, candidate: cand, reason: 'cycle'});
                continue;
            }
            if (!passesRate(s.ratePolicy, primaryRate(primary), cap.rate)) {
                out.push({scope: 'node', nodeId, primary, candidate: cand, reason: 'rate_violation'});
                continue;
            }
            // Tag contexts
            if (tagContexts.length === 0) {
                out.push({scope: 'node', nodeId, primary, candidate: cand, reason: 'no_tag_context'});
                continue;
            }
            let anyPass = false;
            let anyFail = false;
            for (const tagId of tagContexts) {
                const ok = s.requireConstraintFit ? satisfiesTagConstraints(tagId, {services, props}, cap) : true;
                if (ok) anyPass = true; else {
                    anyFail = true;
                    out.push({
                        scope: 'node',
                        nodeId,
                        primary,
                        candidate: cand,
                        tagContext: tagId,
                        reason: 'constraint_mismatch'
                    });
                }
            }
            // If none passed, we already added per-context mismatches above
            void anyPass;
            void anyFail;
        }
    }

    // Global (soft; no tag context)
    for (const [primary, list] of Object.entries(fb.global ?? {})) {
        for (const cand of list) {
            const cap = getCap(services, cand);
            if (!cap) {
                out.push({scope: 'global', primary, candidate: cand, reason: 'unknown_service'});
                continue;
            }
            if (String(cand) === String(primary)) {
                out.push({scope: 'global', primary, candidate: cand, reason: 'cycle'});
                continue;
            }
            if (!passesRate(s.ratePolicy, primaryRate(primary), cap.rate)) {
                out.push({scope: 'global', primary, candidate: cand, reason: 'rate_violation'});
            }
        }
    }
    return out;
}

/* ───────────────────────── helpers ───────────────────────── */

function getCap(map: DgpServiceMap, id: ServiceIdRef) {
    return map[Number(id)] ?? map[id as any];
}

function rateOf(map: DgpServiceMap, id: ServiceIdRef | undefined): number | undefined {
    if (id === undefined || id === null) return undefined;
    const c = getCap(map, id);
    return c?.rate ?? undefined;
}

function passesRate(
    policy: Required<FallbackSettings>['ratePolicy'],
    primaryRate?: number,
    candRate?: number
): boolean {
    if (typeof candRate !== 'number' || !Number.isFinite(candRate)) return false;
    if (typeof primaryRate !== 'number' || !Number.isFinite(primaryRate)) return false;
    switch (policy.kind) {
        case 'lte_primary':
            return candRate <= primaryRate;
        case 'within_pct':
            return candRate <= primaryRate * (1 + policy.pct / 100);
        case 'at_least_pct_lower':
            return candRate <= primaryRate * (1 - policy.pct / 100);
    }
}

function satisfiesTagConstraints(
    tagId: string,
    ctx: { props: ServiceProps; services: DgpServiceMap },
    cap: { dripfeed?: boolean; refill?: boolean; cancel?: boolean }
): boolean {
    const tag = ctx.props.filters.find((t) => t.id === tagId);
    const eff = tag?.constraints; // effective constraints (should already be propagated)
    if (!eff) return true;
    // Only enforce flags explicitly set TRUE at the tag; false/undefined = no requirement
    if (eff.dripfeed === true && !cap.dripfeed) return false;
    if (eff.refill === true && !cap.refill) return false;
    return !(eff.cancel === true && !cap.cancel);

}

function primaryForNode(props: ServiceProps, nodeId: string): {
    primary?: ServiceIdRef;
    tagContexts: string[];
    reasonNoPrimary?: string
} {
    // Tag node?
    const tag = props.filters.find(t => t.id === nodeId);
    if (tag) {
        return {primary: tag.service_id as any, tagContexts: [tag.id]};
    }
    // Option node: locate its parent field
    const field = props.fields.find(f => Array.isArray(f.options) && f.options.some(o => o.id === nodeId));
    if (!field) return {tagContexts: [], reasonNoPrimary: 'no_parent_field'};
    const opt = field.options!.find(o => o.id === nodeId)!;
    const contexts = bindIdsToArray(field.bind_id);
    return {primary: opt.service_id as any, tagContexts: contexts};
}

function bindIdsToArray(bind: string | string[] | undefined): string[] {
    if (!bind) return [];
    return Array.isArray(bind) ? bind.slice() : [bind];
}