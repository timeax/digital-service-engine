import type {
    Field,
    ServiceProps,
} from "@/schema";
import type {
    FallbackDiagnostics,
    OrderSnapshot,
    ServiceFallbacks,
} from "@/schema/order";
import type { DgpServiceMap } from "@/schema/provider";
import type { BuildOrderSelection } from "./types";
import { isOptionBased } from "./selection";

export function buildDevWarnings(
    props: ServiceProps,
    svcMap: DgpServiceMap,
    originalFallbacks: ServiceFallbacks | undefined,
    fieldById: Map<string, Field>,
    visibleFieldIds: string[],
    selection: BuildOrderSelection,
): OrderSnapshot["warnings"] | undefined {
    const out: OrderSnapshot["warnings"] = {};

    const maybeCollectFailed:
        | ((p: ServiceProps, sm: DgpServiceMap, s: { mode: "dev" }) => FallbackDiagnostics[])
        | undefined = (globalThis as any).collectFailedFallbacks;

    try {
        if (maybeCollectFailed && originalFallbacks) {
            const diags = maybeCollectFailed(
                { ...props, fallbacks: originalFallbacks } as ServiceProps,
                svcMap,
                { mode: "dev" },
            );
            if (diags?.length) out.fallbacks = diags;
        }
    } catch {
        // ignore diagnostics failures in dev
    }

    const utilityWarnings: Array<{ nodeId: string; reason: string }> = [];
    for (const fid of visibleFieldIds) {
        const field = fieldById.get(fid);
        if (!field) continue;
        const hasValue = selection.formValuesByFieldId[fid] !== undefined;
        if (hasValue && !field.name && !isOptionBased(field)) {
            utilityWarnings.push({
                nodeId: fid,
                reason: "missing_field_name_for_form_value",
            });
        }
    }
    if (utilityWarnings.length) (out as any).utility = utilityWarnings;

    if (!(out as any).fallbacks && !(out as any).utility) return undefined;
    return out;
}
