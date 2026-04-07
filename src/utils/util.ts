import type {
    DgpServiceCapability,
    DgpServiceMap,
    ServiceIdRef,
} from "@/schema";
import type { FallbackSettings, RatePolicy } from "@/schema/validation";

type ServiceCapabilityEntry = {
    key: string;
    capability: DgpServiceCapability;
};

/**
 * Safely convert unknown to a finite number. Returns NaN if not finite.
 */
export function toFiniteNumber(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
}

export function isValidServiceIdRef(value: unknown): value is ServiceIdRef {
    return (
        (typeof value === "number" && Number.isFinite(value)) ||
        (typeof value === "string" && value.trim().length > 0)
    );
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
    return getServiceCapabilityEntry(svcMap, candidate)?.capability;
}

export function getServiceCapabilityCanonicalRef(
    svcMap: DgpServiceMap,
    candidate: ServiceIdRef | undefined,
): ServiceIdRef | undefined {
    const entry = getServiceCapabilityEntry(svcMap, candidate);
    if (!entry) return undefined;

    return getCanonicalServiceRef(entry.key, entry.capability);
}

export function getServiceCapabilityAliases(
    svcMap: DgpServiceMap,
    candidate: ServiceIdRef | undefined,
): ServiceIdRef[] {
    const entry = getServiceCapabilityEntry(svcMap, candidate);
    if (!entry) return [];

    return collectServiceRefAliases(entry.key, entry.capability);
}

export function isSameServiceCapabilityRef(
    svcMap: DgpServiceMap,
    left: ServiceIdRef | undefined,
    right: ServiceIdRef | undefined,
): boolean {
    if (!isValidServiceIdRef(left) || !isValidServiceIdRef(right)) return false;

    const leftAliases = new Set(
        getServiceCapabilityAliases(svcMap, left).map((value) => String(value)),
    );
    if (!leftAliases.size) {
        leftAliases.add(String(left));
    }

    const rightAliases = getServiceCapabilityAliases(svcMap, right);
    if (!rightAliases.length) {
        return leftAliases.has(String(right));
    }

    return rightAliases.some((value) => leftAliases.has(String(value)));
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

function getServiceCapabilityEntry(
    svcMap: DgpServiceMap,
    candidate: ServiceIdRef | undefined,
): ServiceCapabilityEntry | undefined {
    if (candidate === undefined || candidate === null) return undefined;

    const direct = (svcMap as any)[candidate] as DgpServiceCapability | undefined;
    if (direct) {
        return { key: String(candidate), capability: direct };
    }

    const byString = (svcMap as any)[String(candidate)] as
        | DgpServiceCapability
        | undefined;
    if (byString) {
        return { key: String(candidate), capability: byString };
    }

    if (typeof candidate === "string") {
        const maybeNumber = Number(candidate);
        if (Number.isFinite(maybeNumber)) {
            const byNumber = (svcMap as any)[maybeNumber] as
                | DgpServiceCapability
                | undefined;
            if (byNumber) {
                return { key: String(maybeNumber), capability: byNumber };
            }
        }
    }

    const target = String(candidate);
    for (const [key, capability] of Object.entries(svcMap ?? {})) {
        if (
            collectServiceRefAliases(key, capability).some(
                (alias) => String(alias) === target,
            )
        ) {
            return { key, capability };
        }
    }

    return undefined;
}

function collectServiceRefAliases(
    key: string,
    capability: DgpServiceCapability,
): ServiceIdRef[] {
    const out: ServiceIdRef[] = [];
    const seen = new Set<string>();

    const push = (value: unknown) => {
        if (!isValidServiceIdRef(value)) return;
        const normalized = normalizeServiceRef(value);
        if (!normalized) return;
        const aliasKey = String(normalized);
        if (seen.has(aliasKey)) return;
        seen.add(aliasKey);
        out.push(normalized);
    };

    push(getCanonicalServiceRef(key, capability));
    push((capability as any).service);
    push((capability as any).key);
    push(capability.id);

    return out;
}

function getCanonicalServiceRef(
    key: string,
    capability: DgpServiceCapability,
): ServiceIdRef | undefined {
    const explicitRefs = [(capability as any).service, (capability as any).key, capability.id];

    for (const ref of explicitRefs) {
        if (!isValidServiceIdRef(ref)) continue;
        if (String(ref) === key) {
            return ref;
        }
    }

    return normalizeServiceRef(key);
}

function normalizeServiceRef(value: unknown): ServiceIdRef | undefined {
    if (!isValidServiceIdRef(value)) return undefined;
    if (typeof value === "number") return value;

    const trimmed = value.trim();
    if (!trimmed) return undefined;

    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && String(asNumber) === trimmed) {
        return asNumber;
    }

    return trimmed;
}
