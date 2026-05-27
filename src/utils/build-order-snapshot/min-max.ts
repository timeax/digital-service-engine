import type { DgpServiceCapability, ServiceIdRef } from "@/schema";
import type { DgpServiceMap } from "@/schema/provider";

function getCap(
    map: DgpServiceMap,
    id: ServiceIdRef,
): DgpServiceCapability | undefined {
    return (
        (map as Record<string | number, DgpServiceCapability | undefined>)?.[id] ??
        (map as Record<string, DgpServiceCapability | undefined>)?.[String(id)]
    );
}

export function resolveMinMax(
    servicesList: Array<string | number>,
    services: DgpServiceMap,
): { min: number; max?: number } {
    let min: number | undefined;
    let max: number | undefined;

    for (const sid of servicesList) {
        const cap = getCap(services, sid as ServiceIdRef);
        if (!cap) continue;
        if (typeof cap.min === "number" && Number.isFinite(cap.min)) {
            min = min === undefined ? cap.min : Math.min(min, cap.min);
        }
        if (typeof cap.max === "number" && Number.isFinite(cap.max)) {
            max = max === undefined ? cap.max : Math.max(max, cap.max);
        }
    }

    return { min: min ?? 1, ...(max !== undefined ? { max } : {}) };
}
