import type { Field } from "@/schema";
import type { BuildOrderSelection } from "./types";

export function buildNodeContexts(
    tagId: string,
    visibleFieldIds: string[],
    fieldById: Map<string, Field>,
    _selection: BuildOrderSelection,
    selectedOptionsByFieldId: Record<string, string[]>,
): Record<string, string | null> {
    const ctx: Record<string, string | null> = {};
    ctx[tagId] = tagId;

    for (const fid of visibleFieldIds) {
        const field = fieldById.get(fid);
        if (!field) continue;

        const binds = normalizeBindIds(field.bind_id);
        const applicable = binds.has(tagId);
        const selectedOptionIds = selectedOptionsByFieldId[fid] ?? [];
        for (const oid of selectedOptionIds) {
            ctx[oid] = applicable ? tagId : null;
        }
    }

    return ctx;
}

function normalizeBindIds(bind: string | string[] | undefined): Set<string> {
    const out = new Set<string>();
    if (!bind) return out;
    if (Array.isArray(bind)) {
        for (const b of bind) if (b) out.add(String(b));
    } else {
        out.add(String(bind));
    }
    return out;
}
