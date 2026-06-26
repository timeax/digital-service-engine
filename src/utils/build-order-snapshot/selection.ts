import type { Field } from "@/schema";
import { isMultiField } from "../index";
import type { BuildOrderSelection, SelectedNodeVisit } from "./types";
import { fieldOptionIdSet, findFieldOption, findOptionOwnerField } from "@/core/options";

export function isOptionBased(f: Field): boolean {
    const hasOptions = fieldOptionIdSet(f).size > 0;
    return hasOptions || isMultiField(f);
}

export function toSelectedOptionKeys(byField: Record<string, string[]>): string[] {
    const keys: string[] = [];
    for (const optionIds of Object.values(byField ?? {})) {
        for (const optionId of optionIds ?? []) {
            keys.push(optionId);
        }
    }
    return keys;
}

export function getSelectedOptionsByFieldId(
    selection: BuildOrderSelection,
    fieldById: Map<string, Field>,
    mode: "prod" | "dev",
    visibleOptionsByFieldId?: Record<string, string[]>,
): Record<string, string[]> {
    const collected: Record<string, string[]> = {};
    for (const visit of buildSelectedNodeVisitOrder(selection, fieldById)) {
        if (visit.kind !== "option") continue;
        if (!collected[visit.fieldId]) collected[visit.fieldId] = [];
        collected[visit.fieldId].push(visit.optionId);
    }

    const out: Record<string, string[]> = {};
    for (const [fieldId, optionIds] of Object.entries(collected)) {
        const field = fieldById.get(fieldId);
        if (!field) continue;

        const validOptionIds = fieldOptionIdSet(field);
        const visibleOptionIds = visibleOptionsByFieldId?.[fieldId]
            ? new Set(visibleOptionsByFieldId[fieldId])
            : undefined;
        const dedupedValid: string[] = [];
        const seen = new Set<string>();
        for (const optionId of optionIds) {
            if (!validOptionIds.has(optionId)) continue;
            if (visibleOptionIds && !visibleOptionIds.has(optionId)) continue;
            if (seen.has(optionId)) continue;
            seen.add(optionId);
            dedupedValid.push(optionId);
        }

        const isMulti = field.meta?.multi === true;
        const normalized =
            mode === "prod" && !isMulti
                ? dedupedValid.length
                    ? [dedupedValid[dedupedValid.length - 1]!]
                    : []
                : dedupedValid;

        if (normalized.length) out[fieldId] = normalized;
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
        const key = `option:${optionId}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ kind: "option", fieldId, optionId });
    }

    for (const optionId of selection.optionTraversalOrder ?? []) {
        const ownerField = findOptionOwnerField(fieldById.values(), optionId);
        if (ownerField) pushOption(ownerField.id, optionId);
    }

    for (const rawKey of selection.selectedKeys ?? []) {
        const key = String(rawKey);

        const field = fieldById.get(key);
        if (field) {
            pushField(field.id);
            continue;
        }

        const ownerField = findOptionOwnerField(fieldById.values(), key);
        if (ownerField) pushOption(ownerField.id, key);
    }

    for (const [fieldId, optionIds] of Object.entries(
        selection.optionSelectionsByFieldId ?? {},
    )) {
        const hintedField = fieldById.get(fieldId);
        if (!hintedField) continue;
        for (const optionId of optionIds ?? []) {
            const ownerField = findOptionOwnerField(fieldById.values(), optionId);
            if (ownerField?.id === hintedField.id) {
                pushOption(ownerField.id, optionId);
            }
        }
    }

    return out;
}

export function findSelectedOption(
    field: Field | undefined,
    optionId: string,
) {
    return findFieldOption(field, optionId);
}
