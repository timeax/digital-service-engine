import { normalizeFieldValidation } from "@/core";
import type { FieldValidationRule } from "@/schema";
import type { EditorModuleContext, QuantityRule } from "./editor-types";

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
                        if ((f as any).meta && Object.keys((f as any).meta).length === 0) {
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
        undo: () => ctx.api.undo(),
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
                if ((f as any).meta && Object.keys((f as any).meta).length === 0) {
                    delete (f as any).meta;
                }
            }),
        undo: () => ctx.api.undo(),
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
        undo: () => ctx.api.undo(),
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
        undo: () => ctx.api.undo(),
    });
}

export function normalizeQuantityRule(input: unknown): QuantityRule | undefined {
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
