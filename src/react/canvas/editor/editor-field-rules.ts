import { normalizeFieldValidation } from "@/core";
import { fieldOptionIdSet } from "@/core/options";
import type { Field, FieldValidationRule, Scalar } from "@/schema";
import type { EditorModuleContext, QuantityRule } from "./editor-types";

export type FieldDefaultValue = Scalar | Scalar[];

function isDefaultScalar(value: unknown): value is Scalar {
    if (value === null) return true;
    const type = typeof value;
    return type === "string" || type === "number" || type === "boolean";
}

function dedupe(values: readonly string[]): string[] {
    const out: string[] = [];
    for (const value of values) {
        const id = String(value);
        if (!id || out.includes(id)) continue;
        out.push(id);
    }
    return out;
}

export function normalizeFieldDefaultValue(
    field: Field,
    value: unknown,
): FieldDefaultValue | undefined {
    if (Array.isArray(field.options) && field.options.length > 0) {
        const valid = fieldOptionIdSet(field);
        const raw = Array.isArray(value) ? value : [value];
        const ids = dedupe(
            raw
                .filter((item) => isDefaultScalar(item))
                .map((item) => String(item))
                .filter((id) => valid.has(id)),
        );
        if (!ids.length) return undefined;
        return field.meta?.multi === true ? ids : ids[ids.length - 1];
    }

    if (isDefaultScalar(value)) return value;
    if (Array.isArray(value)) {
        const values = value.filter(isDefaultScalar);
        return values.length ? values : undefined;
    }
    return undefined;
}

export function getFieldDefaultValue(
    ctx: EditorModuleContext,
    id: string,
): FieldDefaultValue | undefined {
    const props = ctx.getProps();
    const f = (props.fields ?? []).find((x) => x.id === id);
    if (!f) return undefined;
    return normalizeFieldDefaultValue(f, (f as any).defaultValue);
}

export function setFieldDefaultValue(
    ctx: EditorModuleContext,
    id: string,
    value: unknown,
): void {
    ctx.exec({
        name: "setFieldDefaultValue",
        do: () =>
            ctx.patchProps((p) => {
                const f = (p.fields ?? []).find((x) => x.id === id);
                if (!f) return;

                const normalized = normalizeFieldDefaultValue(f, value);
                if (normalized === undefined) {
                    if ("defaultValue" in f) delete (f as any).defaultValue;
                    return;
                }

                (f as any).defaultValue = normalized;
            }),
        undo: () => ctx.undo(),
    });
}

export function clearFieldDefaultValue(
    ctx: EditorModuleContext,
    id: string,
): void {
    ctx.exec({
        name: "clearFieldDefaultValue",
        do: () =>
            ctx.patchProps((p) => {
                const f = (p.fields ?? []).find((x) => x.id === id);
                if (!f || !("defaultValue" in f)) return;
                delete (f as any).defaultValue;
            }),
        undo: () => ctx.undo(),
    });
}

export function clearFieldDefaultValuesMany(
    ctx: EditorModuleContext,
    ids: readonly string[],
): void {
    const ordered = Array.from(new Set((ids ?? []).map((id) => String(id))));
    if (!ordered.length) return;

    ctx.exec({
        name: "clearFieldDefaultValuesMany",
        do: () =>
            ctx.patchProps((p) => {
                for (const id of ordered) {
                    const f = (p.fields ?? []).find((x) => x.id === id);
                    if (f && "defaultValue" in f)
                        delete (f as any).defaultValue;
                }
            }),
        undo: () => ctx.undo(),
    });
}

export function getFieldQuantityRule(
    ctx: EditorModuleContext,
    id: string,
): QuantityRule | undefined {
    const props = ctx.getProps();
    const f = (props.fields ?? []).find((x) => x.id === id);
    if (!f) return undefined;
    return normalizeQuantityRule((f as any).meta?.quantity);
}

export function setFieldQuantityRule(
    ctx: EditorModuleContext,
    id: string,
    rule: unknown,
): void {
    ctx.exec({
        name: "setFieldQuantityRule",
        do: () =>
            ctx.patchProps((p) => {
                const f = (p.fields ?? []).find((x) => x.id === id);
                if (!f) return;

                const normalized = normalizeQuantityRule(rule);

                if (!normalized) {
                    if ((f as any).meta?.quantity !== undefined) {
                        delete (f as any).meta.quantity;
                        if (
                            (f as any).meta &&
                            Object.keys((f as any).meta).length === 0
                        ) {
                            delete (f as any).meta;
                        }
                    }
                    return;
                }

                (f as any).meta = {
                    ...(f as any).meta,
                    quantity: normalized,
                };
            }),
        undo: () => ctx.undo(),
    });
}

export function clearFieldQuantityRule(
    ctx: EditorModuleContext,
    id: string,
): void {
    ctx.exec({
        name: "clearFieldQuantityRule",
        do: () =>
            ctx.patchProps((p) => {
                const f = (p.fields ?? []).find((x) => x.id === id);
                if (!f || !(f as any).meta?.quantity) return;
                delete (f as any).meta.quantity;
                if (
                    (f as any).meta &&
                    Object.keys((f as any).meta).length === 0
                ) {
                    delete (f as any).meta;
                }
            }),
        undo: () => ctx.undo(),
    });
}

export function getFieldValidation(
    ctx: EditorModuleContext,
    id: string,
): FieldValidationRule[] | undefined {
    const props = ctx.getProps();
    const f = (props.fields ?? []).find((x) => x.id === id);
    if (!f) return undefined;
    return normalizeFieldValidation((f as any).validation);
}

export function setFieldValidation(
    ctx: EditorModuleContext,
    id: string,
    rules: unknown,
): void {
    ctx.exec({
        name: "setFieldValidation",
        do: () =>
            ctx.patchProps((p) => {
                const f = (p.fields ?? []).find((x) => x.id === id);
                if (!f) return;

                const normalized = normalizeFieldValidation(rules);

                if (!normalized) {
                    if ("validation" in f) delete (f as any).validation;
                    return;
                }

                (f as any).validation = normalized;
            }),
        undo: () => ctx.undo(),
    });
}

export function clearFieldValidation(
    ctx: EditorModuleContext,
    id: string,
): void {
    ctx.exec({
        name: "clearFieldValidation",
        do: () =>
            ctx.patchProps((p) => {
                const f = (p.fields ?? []).find((x) => x.id === id);
                if (!f || !(f as any).validation) return;
                delete (f as any).validation;
            }),
        undo: () => ctx.undo(),
    });
}

export function normalizeQuantityRule(
    input: unknown,
): QuantityRule | undefined {
    if (!input || typeof input !== "object") return undefined;
    const v = input as any;
    const vb = v.valueBy;
    if (vb !== "value" && vb !== "length" && vb !== "eval") return undefined;

    const out: QuantityRule = { valueBy: vb };
    if (vb === "eval" && typeof v.code === "string" && v.code.trim()) {
        out.code = v.code;
    }
    if (typeof v.multiply === "number" && Number.isFinite(v.multiply)) {
        out.multiply = v.multiply;
    }
    if (typeof v.fallback === "number" && Number.isFinite(v.fallback)) {
        out.fallback = v.fallback;
    }
    if (v.clamp && typeof v.clamp === "object") {
        const min =
            typeof v.clamp.min === "number" && Number.isFinite(v.clamp.min)
                ? v.clamp.min
                : undefined;
        const max =
            typeof v.clamp.max === "number" && Number.isFinite(v.clamp.max)
                ? v.clamp.max
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
