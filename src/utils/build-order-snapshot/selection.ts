import type { Field } from "@/schema";
import { isMultiField } from "../index";
import type { BuildOrderSelection, SelectedNodeVisit } from "./types";

export function isOptionBased(f: Field): boolean {
    const hasOptions = Array.isArray(f.options) && f.options.length > 0;
    return hasOptions || isMultiField(f);
}

export function toSelectedOptionKeys(byField: Record<string, string[]>): string[] {
    const keys: string[] = [];
    for (const [fieldId, optionIds] of Object.entries(byField ?? {})) {
        for (const optionId of optionIds ?? []) {
            keys.push(`${fieldId}::${optionId}`);
        }
    }
    return keys;
}

export function getSelectedOptionsByFieldId(
    selection: BuildOrderSelection,
    fieldById: Map<string, Field>,
): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const visit of buildSelectedNodeVisitOrder(selection, fieldById)) {
        if (visit.kind !== "option") continue;
        if (!out[visit.fieldId]) out[visit.fieldId] = [];
        out[visit.fieldId].push(visit.optionId);
    }
    return out;
}

export function buildSelectedNodeVisitOrder(
    selection: BuildOrderSelection,
    fieldById: Map<string, Field>,
): SelectedNodeVisit[] {
    const out: SelectedNodeVisit[] = [];
    const seen = new Set<string>();

    function pushField(fieldId: string): void {
        const key = `field:${fieldId}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ kind: "field", fieldId });
    }

    function pushOption(fieldId: string, optionId: string): void {
        const key = `option:${fieldId}::${optionId}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ kind: "option", fieldId, optionId });
    }

    for (const item of selection.optionTraversalOrder ?? []) {
        pushOption(item.fieldId, item.optionId);
    }

    for (const rawKey of selection.selectedKeys ?? []) {
        const key = String(rawKey);
        if (key.includes("::")) {
            const [fieldId, optionId] = key.split("::", 2);
            if (fieldId && optionId) pushOption(fieldId, optionId);
            continue;
        }

        const field = fieldById.get(key);
        if (field) {
            pushField(field.id);
            continue;
        }

        const ownerField = findOptionOwnerField(key, fieldById);
        if (ownerField) pushOption(ownerField.id, key);
    }

    for (const [fieldId, optionIds] of Object.entries(
        selection.optionSelectionsByFieldId ?? {},
    )) {
        if (!fieldById.has(fieldId)) continue;
        for (const optionId of optionIds ?? []) {
            pushOption(fieldId, optionId);
        }
    }

    return out;
}

function findOptionOwnerField(
    optionId: string,
    fieldById: Map<string, Field>,
): Field | undefined {
    for (const field of fieldById.values()) {
        if (field.options?.some((option) => option.id === optionId)) return field;
    }
    return undefined;
}
