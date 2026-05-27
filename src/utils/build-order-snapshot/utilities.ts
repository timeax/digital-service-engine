import type { Field, FieldOption } from "@/schema";
import type { Scalar, UtilityLineItem, UtilityMode } from "@/schema/order";
import type { BuildOrderSelection } from "./types";

type UtilityMarker = {
    mode: UtilityMode;
    rate: number;
    valueBy?: "value" | "length";
    percentBase?: "service_total" | "base_service" | "all";
    label?: string;
};

export function collectUtilityLineItems(
    visibleFieldIds: string[],
    fieldById: Map<string, Field>,
    selection: BuildOrderSelection,
    selectedOptionsByFieldId: Record<string, string[]>,
    quantity: number,
): UtilityLineItem[] {
    const items: UtilityLineItem[] = [];

    for (const fid of visibleFieldIds) {
        const field = fieldById.get(fid);
        if (!field) continue;

        const isUtilityField = (field.pricing_role ?? "base") === "utility";
        const marker = readUtilityMarker((field.meta as any)?.utility);
        if (isUtilityField && marker) {
            const value = selection.formValuesByFieldId[field.id];
            const item = buildUtilityItemFromMarker(field.id, marker, quantity, value);
            if (item) items.push(item);
        }

        if (Array.isArray(field.options) && field.options.length) {
            const selectedOptionIds = selectedOptionsByFieldId[field.id] ?? [];
            if (!selectedOptionIds.length) continue;

            const optById = new Map<string, FieldOption>(field.options.map((o) => [o.id, o]));
            for (const oid of selectedOptionIds) {
                const option = optById.get(oid);
                if (!option) continue;
                if ((option.pricing_role ?? "base") !== "utility") continue;
                const optionMarker = readUtilityMarker((option.meta as any)?.utility);
                if (!optionMarker) continue;
                const parentValue = selection.formValuesByFieldId[field.id];
                const item = buildUtilityItemFromMarker(
                    option.id,
                    optionMarker,
                    quantity,
                    parentValue,
                );
                if (item) items.push(item);
            }
        }
    }

    return items;
}

function readUtilityMarker(v: unknown): UtilityMarker | undefined {
    if (!v || typeof v !== "object") return undefined;
    const src = v as UtilityMarker;
    if (!src.mode || typeof src.rate !== "number" || !Number.isFinite(src.rate)) return undefined;
    if (src.mode !== "flat" && src.mode !== "per_quantity" && src.mode !== "per_value" && src.mode !== "percent") {
        return undefined;
    }
    const out: UtilityMarker = { mode: src.mode, rate: src.rate };
    if (src.valueBy === "value" || src.valueBy === "length") out.valueBy = src.valueBy;
    if (src.percentBase === "service_total" || src.percentBase === "base_service" || src.percentBase === "all") {
        out.percentBase = src.percentBase;
    }
    if (typeof src.label === "string" && src.label.trim()) out.label = src.label.trim();
    return out;
}

function buildUtilityItemFromMarker(
    nodeId: string,
    marker: UtilityMarker,
    quantity: number,
    value: Scalar | Scalar[] | undefined,
): UtilityLineItem | undefined {
    const base: UtilityLineItem = {
        nodeId,
        mode: marker.mode,
        rate: marker.rate,
        ...(marker.percentBase ? { percentBase: marker.percentBase } : {}),
        ...(marker.label ? { label: marker.label } : {}),
        inputs: { quantity },
    };
    if (marker.mode === "per_value") {
        base.inputs.valueBy = marker.valueBy ?? "value";
        if (marker.valueBy === "length") {
            base.inputs.value = Array.isArray(value)
                ? value.length
                : typeof value === "string"
                  ? value.length
                  : 0;
        } else {
            base.inputs.value = Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
        }
    }
    return base;
}
