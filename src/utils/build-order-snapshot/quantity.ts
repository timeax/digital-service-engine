import type { Field, Tag } from "@/schema";
import type { OrderSnapshot, QuantityRule, Scalar } from "@/schema/order";
import type { BuildOrderSelection } from "./types";
import { buildSelectedNodeVisitOrder } from "./selection";

export function resolveQuantity(
    visibleFieldIds: string[],
    fieldById: Map<string, Field>,
    tagById: Map<string, Tag>,
    selection: BuildOrderSelection,
    tagId: string,
    hostDefault: number,
): { quantity: number; source: OrderSnapshot["quantitySource"] } {
    for (const fid of visibleFieldIds) {
        const field = fieldById.get(fid);
        if (!field) continue;
        const rule = readQuantityRule((field.meta as any)?.quantity);
        if (!rule) continue;

        const raw = selection.formValuesByFieldId[fid];
        const evaluated = evaluateQuantityRule(rule, raw);
        if (Number.isFinite(evaluated) && (evaluated as number) > 0) {
            return {
                quantity: evaluated as number,
                source: { kind: "field", id: field.id, rule },
            };
        }
        break;
    }

    const nodeDefault = resolveNodeDefaultQuantity(
        visibleFieldIds,
        fieldById,
        tagById,
        selection,
        tagId,
    );
    if (nodeDefault) return nodeDefault;

    return { quantity: hostDefault, source: { kind: "default", defaultedFromHost: true } };
}

export function resolveNodeDefaultQuantity(
    visibleFieldIds: string[],
    fieldById: Map<string, Field>,
    tagById: Map<string, Tag>,
    selection: BuildOrderSelection,
    tagId: string,
): { quantity: number; source: OrderSnapshot["quantitySource"] } | undefined {
    const visible = new Set(visibleFieldIds);
    const visits = buildSelectedNodeVisitOrder(selection, fieldById);

    for (const visit of visits) {
        if (visit.kind !== "option") continue;
        if (!visible.has(visit.fieldId)) continue;
        const field = fieldById.get(visit.fieldId);
        if (!field?.options?.length) continue;
        const option = field.options.find((item) => item.id === visit.optionId);
        const quantity = readPositiveFiniteNumber((option?.meta as any)?.quantityDefault);
        if (quantity !== undefined) {
            return { quantity, source: { kind: "option", id: option!.id } };
        }
    }

    for (const visit of visits) {
        if (!visible.has(visit.fieldId)) continue;
        const field = fieldById.get(visit.fieldId);
        if (!field) continue;
        const quantity = readPositiveFiniteNumber((field as any).quantityDefault);
        if (quantity !== undefined) {
            return { quantity, source: { kind: "field", id: field.id } };
        }
    }

    const tag = tagById.get(tagId);
    const tagQuantity = readPositiveFiniteNumber((tag?.meta as any)?.quantityDefault);
    if (tagQuantity !== undefined) {
        return { quantity: tagQuantity, source: { kind: "tag", id: tagId } };
    }
    return undefined;
}

function readQuantityRule(v: unknown): QuantityRule | undefined {
    if (!v || typeof v !== "object") return undefined;
    const src = v as QuantityRule;
    if (src.valueBy !== "value" && src.valueBy !== "length" && src.valueBy !== "eval") return undefined;

    const out: QuantityRule = { valueBy: src.valueBy };
    if (src.code && typeof src.code === "string") out.code = src.code;
    if (typeof src.multiply === "number" && Number.isFinite(src.multiply)) out.multiply = src.multiply;
    if (typeof src.fallback === "number" && Number.isFinite(src.fallback)) out.fallback = src.fallback;
    if (src.clamp && typeof src.clamp === "object") {
        const min =
            typeof src.clamp.min === "number" && Number.isFinite(src.clamp.min)
                ? src.clamp.min
                : undefined;
        const max =
            typeof src.clamp.max === "number" && Number.isFinite(src.clamp.max)
                ? src.clamp.max
                : undefined;
        if (min !== undefined || max !== undefined) {
            out.clamp = {
                ...(min !== undefined ? { min } : {}),
                ...(max !== undefined ? { max } : {}),
            };
        }
    }
    return out;
}

function evaluateQuantityRule(rule: QuantityRule, raw: Scalar | Scalar[] | undefined): number {
    const evaluated = evaluateRawQuantityRule(rule, raw);
    if (Number.isFinite(evaluated)) {
        const adjusted = applyQuantityTransforms(evaluated as number, rule);
        if (Number.isFinite(adjusted) && adjusted > 0) return adjusted;
    }
    if (typeof rule.fallback === "number" && Number.isFinite(rule.fallback)) {
        const fallback = applyClamp(rule.fallback, rule.clamp);
        if (Number.isFinite(fallback) && fallback > 0) return fallback;
    }
    return NaN;
}

function evaluateRawQuantityRule(rule: QuantityRule, raw: Scalar | Scalar[] | undefined): number {
    switch (rule.valueBy) {
        case "value": {
            const n = Number(Array.isArray(raw) ? (raw as Scalar[])[0] : raw);
            return Number.isFinite(n) ? n : NaN;
        }
        case "length": {
            if (Array.isArray(raw)) return raw.length;
            if (typeof raw === "string") return raw.length;
            return NaN;
        }
        case "eval": {
            try {
                if (!rule.code || typeof rule.code !== "string") return NaN;
                // eslint-disable-next-line no-new-func
                const fn = new Function(
                    "value",
                    "values",
                    `return (function(){ ${rule.code}\n})()`,
                );
                const single = Array.isArray(raw) ? (raw as Scalar[])[0] : raw;
                const values = Array.isArray(raw) ? (raw as Scalar[]) : raw !== undefined ? [raw] : [];
                const out = fn(single, values);
                const n = Number(out);
                return Number.isFinite(n) ? n : NaN;
            } catch {
                return NaN;
            }
        }
        default:
            return NaN;
    }
}

function applyQuantityTransforms(value: number, rule: QuantityRule): number {
    let next = value;
    if (typeof rule.multiply === "number" && Number.isFinite(rule.multiply)) {
        next *= rule.multiply;
    }
    return applyClamp(next, rule.clamp);
}

function applyClamp(value: number, clamp: QuantityRule["clamp"] | undefined): number {
    let next = value;
    if (clamp?.min !== undefined) next = Math.max(next, clamp.min);
    if (clamp?.max !== undefined) next = Math.min(next, clamp.max);
    return next;
}

function readPositiveFiniteNumber(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}
