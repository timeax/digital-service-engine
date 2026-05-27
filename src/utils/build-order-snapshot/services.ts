import type {
    DgpServiceCapability,
    Field,
    ServiceIdRef,
    Tag,
} from "@/schema";
import type { DgpServiceMap } from "@/schema/provider";
import type { BuildOrderSelection } from "./types";
import { buildSelectedNodeVisitOrder } from "./selection";

type ResolvedBaseService = {
    origin: string;
    sid: string | number;
    rate: number;
    index: number;
};

export function isServiceBased(field: Field): boolean {
    if (field.service_id !== undefined && field.service_id !== null) return true;
    return !!field.options?.some(
        (item) => item.service_id !== undefined && item.service_id !== null,
    );
}

export function resolveServices(
    tagId: string,
    visibleFieldIds: string[],
    selection: BuildOrderSelection,
    tagById: Map<string, Tag>,
    fieldById: Map<string, Field>,
    services: DgpServiceMap,
): {
    serviceMap: Record<string, Array<string | number>>;
    servicesList: Array<string | number>;
} {
    const serviceMap: Record<string, Array<string | number>> = {};
    const visible = new Set(visibleFieldIds);
    const selectedBaseServices: ResolvedBaseService[] = [];
    const visits = buildSelectedNodeVisitOrder(selection, fieldById);

    let index = 0;

    function addSelectedBaseService(origin: string, sid: string | number): void {
        pushService(serviceMap, origin, sid);
        selectedBaseServices.push({
            origin,
            sid,
            rate: readServiceRate(services, sid),
            index: index++,
        });
    }

    for (const visit of visits) {
        if (!visible.has(visit.fieldId)) continue;

        const field = fieldById.get(visit.fieldId);
        if (!field) continue;

        if (visit.kind === "field") {
            const role = (field.pricing_role ?? "base") as "base" | "utility" | string;
            if (role === "utility") continue;
            if (field.service_id !== undefined && field.service_id !== null) {
                addSelectedBaseService(field.id, field.service_id);
            }
            continue;
        }

        const option = field.options?.find((item) => item.id === visit.optionId);
        if (!option) continue;

        const role = (option.pricing_role ?? field.pricing_role ?? "base") as
            | "base"
            | "utility"
            | string;
        if (role === "utility") continue;

        if (option.service_id !== undefined && option.service_id !== null) {
            addSelectedBaseService(option.id, option.service_id);
        }
    }

    // Selected base services override tag default.
    // The primary is the selected service with the highest known rate.
    if (selectedBaseServices.length > 0) {
        const primary = pickHighestRatePrimary(selectedBaseServices);
        const ordered = [
            primary.sid,
            ...selectedBaseServices
                .filter((item) => item !== primary)
                .sort((a, b) => a.index - b.index)
                .map((item) => item.sid),
        ];
        return { serviceMap, servicesList: dedupeByString(ordered) };
    }

    // No selected service-bearing field/option: use tag default only as fallback.
    const tag = tagById.get(tagId);
    if (tag?.service_id !== undefined && tag.service_id !== null) {
        pushService(serviceMap, tagId, tag.service_id);
        return { serviceMap, servicesList: [tag.service_id] };
    }

    return { serviceMap, servicesList: [] };
}

function pickHighestRatePrimary(
    services: ResolvedBaseService[],
): ResolvedBaseService {
    let best = services[0]!;
    for (const item of services.slice(1)) {
        if (item.rate > best.rate) best = item;
    }
    return best;
}

function getCap(
    map: DgpServiceMap,
    id: ServiceIdRef,
): DgpServiceCapability | undefined {
    return (
        (map as Record<string | number, DgpServiceCapability | undefined>)?.[id] ??
        (map as Record<string, DgpServiceCapability | undefined>)?.[String(id)]
    );
}

function readServiceRate(services: DgpServiceMap, sid: string | number): number {
    const rate = Number(getCap(services, sid as ServiceIdRef)?.rate);
    return Number.isFinite(rate) ? rate : Number.NEGATIVE_INFINITY;
}

function pushService(
    map: Record<string, Array<string | number>>,
    nodeId: string,
    sid: string | number,
): void {
    if (!map[nodeId]) map[nodeId] = [];
    map[nodeId].push(sid);
}

function dedupeByString<T extends string | number>(arr: T[]): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const value of arr) {
        const key = String(value);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
}
