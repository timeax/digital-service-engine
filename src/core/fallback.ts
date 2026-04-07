import type {
    Field,
    FieldOption,
    FallbackEligibleSource,
    NodeIdRef,
    OrderSnapshot,
    ServiceFallback,
    ServiceIdRef,
    ServiceProps,
} from "@/schema";
import type { DgpServiceCapability, DgpServiceMap } from "@/schema/provider";
import type { FallbackSettings } from "@/schema/validation";
import {
    getServiceCapability,
    getServiceCapabilityAliases,
    getServiceCapabilityCanonicalRef,
    isSameServiceCapabilityRef,
    isValidServiceIdRef,
    normalizeRatePolicy,
    passesRatePolicy,
} from "@/utils/util";

export type FailedFallbackContext = {
    scope: "node" | "global";
    nodeId?: string;
    primary: ServiceIdRef;
    candidate: ServiceIdRef;
    tagContext?: string;
    reason:
        | "unknown_service"
        | "no_primary"
        | "rate_violation"
        | "constraint_mismatch"
        | "cycle"
        | "no_tag_context";
    details?: Record<string, unknown>;
};

const DEFAULT_SETTINGS: Required<FallbackSettings> = {
    requireConstraintFit: true,
    ratePolicy: { kind: "lte_primary", pct: 5 },
    selectionStrategy: "priority",
    mode: "strict",
};

export function resolveServiceFallback(params: {
    primary: ServiceIdRef;
    nodeId?: NodeIdRef;
    tagId?: string;
    services: DgpServiceMap;
    fallbacks?: ServiceFallback;
    settings?: FallbackSettings;
    props: ServiceProps;
}): ServiceIdRef | null {
    const s = { ...DEFAULT_SETTINGS, ...(params.settings ?? {}) };
    const { primary, nodeId, tagId, services } = params;
    const fallbackLists = listRegisteredFallbackCandidates(
        params.fallbacks ?? {},
        primary,
        nodeId,
        services,
    );
    const tried = new Set<string>();
    const primaryRate = rateOf(services, primary);

    for (const list of fallbackLists) {
        for (const candidate of list) {
            const candidateIdentity = getComparableServiceRefKey(
                services,
                candidate,
            );
            if (tried.has(candidateIdentity)) continue;
            tried.add(candidateIdentity);

            const capability = getCap(services, candidate);
            if (!capability) continue;
            if (isSameServiceCapabilityRef(services, candidate, primary)) {
                continue;
            }

            if (!passesRate(s.ratePolicy, primaryRate, capability.rate)) {
                continue;
            }
            if (s.requireConstraintFit && tagId) {
                const fitsConstraints = satisfiesTagConstraints(
                    tagId,
                    params,
                    capability,
                );
                if (!fitsConstraints) continue;
            }

            return candidate;
        }
    }

    return null;
}

export function collectFailedFallbacks(
    props: ServiceProps,
    services: DgpServiceMap,
    settings?: FallbackSettings,
): FailedFallbackContext[] {
    const s = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
    const out: FailedFallbackContext[] = [];
    const fb = props.fallbacks ?? {};
    const primaryRate = (primary: ServiceIdRef) => rateOf(services, primary);

    for (const [nodeId, list] of Object.entries(fb.nodes ?? {})) {
        const { primary, tagContexts } = primaryForNode(props, nodeId);
        if (!primary) {
            out.push({
                scope: "node",
                nodeId,
                primary: "" as any,
                candidate: "" as any,
                reason: "no_primary",
            });
            continue;
        }

        for (const candidate of list) {
            const capability = getCap(services, candidate);
            if (!capability) {
                out.push({
                    scope: "node",
                    nodeId,
                    primary,
                    candidate,
                    reason: "unknown_service",
                });
                continue;
            }
            if (isSameServiceCapabilityRef(services, candidate, primary)) {
                out.push({
                    scope: "node",
                    nodeId,
                    primary,
                    candidate,
                    reason: "cycle",
                });
                continue;
            }
            if (!passesRate(s.ratePolicy, primaryRate(primary), capability.rate)) {
                out.push({
                    scope: "node",
                    nodeId,
                    primary,
                    candidate,
                    reason: "rate_violation",
                });
                continue;
            }
            if (tagContexts.length === 0) {
                out.push({
                    scope: "node",
                    nodeId,
                    primary,
                    candidate,
                    reason: "no_tag_context",
                });
                continue;
            }

            for (const tagId of tagContexts) {
                const fitsConstraints = s.requireConstraintFit
                    ? satisfiesTagConstraints(
                          tagId,
                          { services, props },
                          capability,
                      )
                    : true;
                if (fitsConstraints) continue;

                out.push({
                    scope: "node",
                    nodeId,
                    primary,
                    candidate,
                    tagContext: tagId,
                    reason: "constraint_mismatch",
                });
            }
        }
    }

    for (const [primary, list] of Object.entries(fb.global ?? {})) {
        for (const candidate of list) {
            const capability = getCap(services, candidate);
            if (!capability) {
                out.push({
                    scope: "global",
                    primary,
                    candidate,
                    reason: "unknown_service",
                });
                continue;
            }
            if (isSameServiceCapabilityRef(services, candidate, primary)) {
                out.push({
                    scope: "global",
                    primary,
                    candidate,
                    reason: "cycle",
                });
                continue;
            }
            if (!passesRate(s.ratePolicy, primaryRate(primary), capability.rate)) {
                out.push({
                    scope: "global",
                    primary,
                    candidate,
                    reason: "rate_violation",
                });
            }
        }
    }

    return out;
}

function rateOf(
    map: DgpServiceMap,
    id: ServiceIdRef | undefined,
): number | undefined {
    if (id === undefined || id === null) return undefined;
    return getCap(map, id)?.rate ?? undefined;
}

function passesRate(
    policy: Required<FallbackSettings>["ratePolicy"],
    primaryRate?: number,
    candidateRate?: number,
): boolean {
    if (typeof candidateRate !== "number" || !Number.isFinite(candidateRate)) {
        return false;
    }
    if (typeof primaryRate !== "number" || !Number.isFinite(primaryRate)) {
        return false;
    }
    return passesRatePolicy(
        normalizeRatePolicy(policy),
        primaryRate,
        candidateRate,
    );
}

function getCap(
    map: DgpServiceMap,
    id: ServiceIdRef,
): DgpServiceCapability | undefined {
    return getServiceCapability(map, id);
}

function isCapFlagEnabled(capability: DgpServiceCapability, flagId: string): boolean {
    const fromFlags = capability.flags?.[flagId]?.enabled;
    if (fromFlags === true) return true;
    if (fromFlags === false) return false;

    const legacy = (capability as any)[flagId];
    return legacy === true;
}

function satisfiesTagConstraints(
    tagId: string,
    ctx: Readonly<{ props: ServiceProps; services: DgpServiceMap }>,
    capability: DgpServiceCapability,
): boolean {
    const tag = ctx.props.filters.find((item) => item.id === tagId);
    const effectiveConstraints = tag?.constraints as Record<string, unknown> | undefined;
    if (!effectiveConstraints) return true;

    for (const [key, value] of Object.entries(effectiveConstraints)) {
        if (value === true && !isCapFlagEnabled(capability, key)) {
            return false;
        }
    }

    return true;
}

function primaryForNode(
    props: ServiceProps,
    nodeId: string,
): {
    primary?: ServiceIdRef;
    tagContexts: string[];
    reasonNoPrimary?: string;
} {
    const tag = props.filters.find((item) => item.id === nodeId);
    if (tag) {
        return { primary: tag.service_id as any, tagContexts: [tag.id] };
    }

    const field = props.fields.find(
        (item) =>
            Array.isArray(item.options) &&
            item.options.some((option) => option.id === nodeId),
    );
    if (!field) {
        return { tagContexts: [], reasonNoPrimary: "no_parent_field" };
    }

    const option = field.options!.find((item) => item.id === nodeId)!;
    return {
        primary: option.service_id as any,
        tagContexts: bindIdsToArray(field.bind_id),
    };
}

function bindIdsToArray(bind: string | string[] | undefined): string[] {
    if (!bind) return [];
    return Array.isArray(bind) ? bind.slice() : [bind];
}

export function getEligibleFallbacks(params: {
    primary: ServiceIdRef;
    nodeId?: NodeIdRef;
    tagId?: string;
    services: DgpServiceMap;
    fallbacks?: ServiceFallback;
    settings?: FallbackSettings;
    props: ServiceProps;
    exclude?: Array<ServiceIdRef>;
    unique?: boolean;
    limit?: number;
    source?: FallbackEligibleSource;
}): ServiceIdRef[] {
    const s = { ...DEFAULT_SETTINGS, ...(params.settings ?? {}) };
    const { primary, nodeId, tagId, services } = params;
    const excludes = new Set<string>();
    for (const ref of params.exclude ?? []) {
        addComparableServiceRef(excludes, services, ref);
    }
    addComparableServiceRef(excludes, services, primary);

    const source = params.source ?? "registered";
    const candidateLists =
        source === "all_services"
            ? [listServicePoolCandidates(services)]
            : listRegisteredFallbackCandidates(
                  params.fallbacks ?? {},
                  primary,
                  nodeId,
                  services,
              );

    if (!candidateLists.length) return [];

    const primaryRate = rateOf(services, primary);
    const seen = new Set<string>();
    const eligible: ServiceIdRef[] = [];

    for (const list of candidateLists) {
        for (const candidate of list) {
            if (hasComparableServiceRef(excludes, services, candidate)) continue;

            const capability = getCap(services, candidate);
            if (!capability) continue;
            const candidateId = getServiceCapabilityCanonicalRef(services, candidate)
                ?? candidate;
            const candidateIdentity = getComparableServiceRefKey(
                services,
                candidateId,
            );
            if ((params.unique ?? true) && seen.has(candidateIdentity)) continue;
            seen.add(candidateIdentity);

            if (!passesRate(s.ratePolicy, primaryRate, capability.rate)) {
                continue;
            }
            if (s.requireConstraintFit && tagId) {
                const fitsConstraints = satisfiesTagConstraints(
                    tagId,
                    { props: params.props, services },
                    capability,
                );
                if (!fitsConstraints) continue;
            }

            eligible.push(candidateId);
        }
    }

    if (s.selectionStrategy === "cheapest") {
        eligible.sort((left, right) => {
            const leftRate = rateOf(services, left) ?? Infinity;
            const rightRate = rateOf(services, right) ?? Infinity;
            return leftRate - rightRate;
        });
    }

    if (typeof params.limit === "number" && params.limit >= 0) {
        return eligible.slice(0, params.limit);
    }

    return eligible;
}

export function getAssignedServiceIds(params: {
    props?: ServiceProps;
    snapshot?: OrderSnapshot;
}): ServiceIdRef[] {
    const seen = new Set<string>();
    const out: ServiceIdRef[] = [];

    const push = (value: unknown) => {
        if (!isValidServiceIdRef(value)) return;
        const key = String(value);
        if (seen.has(key)) return;
        seen.add(key);
        out.push(value);
    };

    const props = params.props;
    if (props) {
        for (const tag of props.filters ?? []) {
            push(tag.service_id);
        }

        for (const field of props.fields ?? []) {
            const fieldService = (field as Field & { service_id?: ServiceIdRef })
                .service_id;
            if ((field as any).button === true) {
                push(fieldService);
            }

            for (const option of field.options ?? []) {
                if ((option as FieldOption).pricing_role === "utility") continue;
                push((option as FieldOption).service_id);
            }
        }
    }

    const snapshot = params.snapshot;
    if (snapshot) {
        for (const serviceId of snapshot.services ?? []) {
            push(serviceId);
        }
        for (const list of Object.values(snapshot.serviceMap ?? {})) {
            for (const serviceId of list ?? []) {
                push(serviceId);
            }
        }
    }

    return out;
}

export function getFallbackRegistrationInfo(
    props: ServiceProps,
    nodeId: NodeIdRef,
): {
    primary?: ServiceIdRef;
    tagContexts: string[];
} {
    const { primary, tagContexts } = primaryForNode(props, nodeId);
    return { primary, tagContexts };
}

function listRegisteredFallbackCandidates(
    fallbacks: ServiceFallback,
    primary: ServiceIdRef,
    nodeId?: NodeIdRef,
    services?: DgpServiceMap,
): ServiceIdRef[][] {
    const lists: ServiceIdRef[][] = [];
    if (nodeId && fallbacks.nodes?.[nodeId]) {
        lists.push(fallbacks.nodes[nodeId]);
    }

    for (const [registeredPrimary, list] of Object.entries(fallbacks.global ?? {})) {
        if (!isMatchingServiceRef(services, registeredPrimary, primary)) continue;
        lists.push(list);
    }

    return lists;
}

function listServicePoolCandidates(services: DgpServiceMap): ServiceIdRef[] {
    const seen = new Set<string>();
    const out: ServiceIdRef[] = [];

    for (const [key, capability] of Object.entries(services ?? {})) {
        const candidate = getServicePoolCandidateId(key, capability);
        if (!isValidServiceIdRef(candidate)) continue;

        const identity = getComparableServiceRefKey(services, candidate);
        if (seen.has(identity)) continue;
        seen.add(identity);
        out.push(candidate);
    }

    return out;
}

function getServicePoolCandidateId(
    key: string,
    capability: DgpServiceCapability,
): ServiceIdRef | undefined {
    return getServiceCapabilityCanonicalRef({ [key]: capability }, key) ?? key;
}

function addComparableServiceRef(
    target: Set<string>,
    services: DgpServiceMap,
    value: ServiceIdRef | undefined,
): void {
    for (const ref of getComparableServiceRefs(services, value)) {
        target.add(ref);
    }
}

function hasComparableServiceRef(
    target: Set<string>,
    services: DgpServiceMap,
    value: ServiceIdRef | undefined,
): boolean {
    return getComparableServiceRefs(services, value).some((ref) => target.has(ref));
}

function getComparableServiceRefKey(
    services: DgpServiceMap,
    value: ServiceIdRef | undefined,
): string {
    if (!isValidServiceIdRef(value)) return "";

    const canonical = getServiceCapabilityCanonicalRef(services, value);
    return String(canonical ?? value);
}

function getComparableServiceRefs(
    services: DgpServiceMap,
    value: ServiceIdRef | undefined,
): string[] {
    if (!isValidServiceIdRef(value)) return [];

    const aliases = getServiceCapabilityAliases(services, value);
    if (!aliases.length) {
        return [String(value)];
    }

    return aliases.map((ref) => String(ref));
}

function isMatchingServiceRef(
    services: DgpServiceMap | undefined,
    left: ServiceIdRef,
    right: ServiceIdRef,
): boolean {
    if (!services) return String(left) === String(right);
    return isSameServiceCapabilityRef(services, left, right);
}
