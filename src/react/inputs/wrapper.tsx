// src/react/inputs/wrapper.tsx
import * as React from "react";
import { useMemo } from "react";

import { useField } from "@timeax/form-palette";

import type { Field, FieldOption } from "@/schema";
import type { Scalar } from "@/schema/order";

import type {
    Adapter,
    AdapterCtx,
    InputDescriptor,
    InputKind,
    InputVariant,
} from "@/react";
import { resolveInputDescriptor, useInputs } from "@/react";

import { useOrderFlow } from "@/react/hooks/use-order-flow";

function toKind(field: Field): InputKind {
    return field.type as InputKind;
}

function toVariant(field: Field): InputVariant | undefined {
    const v = (field as any).meta?.variant;
    return typeof v === "string" && v.trim() ? (v as InputVariant) : undefined;
}

/* -------------------------------------------------------------------------- */
/* Safe templating (no eval)                                                  */
/* -------------------------------------------------------------------------- */

function getPath(ctx: Record<string, unknown>, path: string): unknown {
    const parts = path
        .split(".")
        .map((p) => p.trim())
        .filter(Boolean);

    let cur: any = ctx;
    for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
    }
    return cur;
}

function parseLiteral(raw: string, ctx: Record<string, unknown>): unknown {
    const s = raw.trim();
    if (!s) return "";

    if (
        (s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))
    ) {
        return s.slice(1, -1);
    }

    if (s === "true") return true;
    if (s === "false") return false;

    const n = Number(s);
    if (!Number.isNaN(n) && s !== "") return n;

    return getPath(ctx, s);
}

function evalMiniExpr(exprRaw: string, ctx: Record<string, unknown>): string {
    const expr = exprRaw.trim();

    const idxNullish = expr.indexOf("??");
    const idxOr = expr.indexOf("||");

    const splitAt =
        idxNullish >= 0
            ? { idx: idxNullish, op: "??" as const }
            : idxOr >= 0
              ? { idx: idxOr, op: "||" as const }
              : null;

    const left = splitAt ? expr.slice(0, splitAt.idx).trim() : expr;
    const right = splitAt ? expr.slice(splitAt.idx + 2).trim() : "";

    const leftVal = getPath(ctx, left);

    const isTruthy = (v: unknown) => !!v;
    const isNullish = (v: unknown) => v === null || v === undefined;

    const chooseFallback =
        splitAt?.op === "??"
            ? isNullish(leftVal)
            : splitAt?.op === "||"
              ? !isTruthy(leftVal)
              : false;

    const chosen = chooseFallback ? parseLiteral(right, ctx) : leftVal;

    if (chosen === null || chosen === undefined) return "";
    if (
        typeof chosen === "string" ||
        typeof chosen === "number" ||
        typeof chosen === "boolean"
    ) {
        return String(chosen);
    }

    try {
        return JSON.stringify(chosen);
    } catch {
        return String(chosen);
    }
}

function templateString(str: string, ctx: Record<string, unknown>): string {
    return str.replace(/\{([^}]+)}/g, (_m, expr) =>
        evalMiniExpr(String(expr), ctx),
    );
}

function templateDeep<T>(value: T, ctx: Record<string, unknown>): T {
    if (typeof value === "string") return templateString(value, ctx) as any;
    if (Array.isArray(value))
        return value.map((v) => templateDeep(v, ctx)) as any;

    if (value && typeof value === "object") {
        const out: any = {};
        for (const [k, v] of Object.entries(value as any)) {
            out[k] = templateDeep(v, ctx);
        }
        return out;
    }

    return value;
}

/* -------------------------------------------------------------------------- */
/* Wrapper                                                                    */
/* -------------------------------------------------------------------------- */

export type InputWrapperProps = {
    field: Field;
    disabled?: boolean;

    extraProps?: Record<string, unknown>;
    templateStrings?: boolean;
    ctxOverrides?: Record<string, unknown>;
};

export function Wrapper({
    field,
    disabled,
    extraProps,
    templateStrings = true,
    ctxOverrides,
}: InputWrapperProps) {
    const { registry } = useInputs();
    const flow = useOrderFlow();

    const kind = toKind(field);
    const variant = toVariant(field);

    const descriptor: InputDescriptor | undefined = React.useMemo(
        () => resolveInputDescriptor(registry, kind, variant),
        [kind, registry, variant],
    );

    if (!descriptor) {
        // eslint-disable-next-line no-console
        console.warn("[Wrapper] No descriptor for", { kind, variant, field });
        return null;
    }

    const Component = descriptor.Component as any;
    const adapter = (descriptor.adapter ?? {}) as Adapter;
    const baseProps = (descriptor.defaultProps ?? {}) as Record<
        string,
        unknown
    >;

    const defaultProps = useMemo(() => {
        return { ...baseProps, ...(field.defaults ?? {}) };
    }, [baseProps, field.defaults]);

    const valueProp = adapter.valueProp ?? "value";
    const changeProp = adapter.changeProp ?? "onChange";

    const isOptionBased =
        Array.isArray(field.options) && field.options.length > 0;

    // action button = option-less button
    const isActionButton = field.button === true && !isOptionBased;

    // Register into form-palette:
    // ✅ name is ALWAYS field.id (only name)
    const fp = useField({
        name: field.id,
        required: !!field.required,
        variant: field.type as any,
        defaultValue: field.defaults?.value,
        disabled: !!disabled,
    });

    // Option ids allow-list (defensive)
    const optionIds = React.useMemo(() => {
        if (!isOptionBased) return new Set<string>();
        return new Set((field.options ?? []).map((o: FieldOption) => o.id));
    }, [isOptionBased, field.options]);

    // Selection syncing bookkeeping
    const prevSelectedRef = React.useRef<string[]>([]);
    React.useEffect(() => {
        prevSelectedRef.current = [];
    }, [field.id]);

    const adapterCtx = React.useMemo<AdapterCtx>(
        () => ({ field, props: flow.raw }),
        [field],
    );

    const onHostChange = React.useCallback(
        (next: unknown) => {
            const currentStored = (next as any)?.value;

            // 1) normalize into stored value
            const stored =
                adapter.getValue?.(next, currentStored, adapterCtx) ??
                currentStored ??
                next;

            // 2) write ONLY via form-palette's onChange
            fp.setValue(stored);

            // 3) sync visibility triggers to Selection (via order flow)
            if (isOptionBased) {
                if (!adapter.getSelectedOptions) {
                    throw new Error(
                        `[Wrapper] Adapter for "${field.id}" (${field.type}) must implement getSelectedOptions() because this field has options.`,
                    );
                }

                const rawIds = adapter.getSelectedOptions(
                    next,
                    stored,
                    adapterCtx,
                );

                const nextIds = Array.from(
                    new Set(
                        (rawIds ?? [])
                            .map(String)
                            .filter((id) => optionIds.has(id)),
                    ),
                );

                const prev = prevSelectedRef.current;
                prevSelectedRef.current = nextIds;

                const prevSet = new Set(prev);
                const nextSet = new Set(nextIds);

                // toggle ON
                for (const id of nextIds) {
                    if (!prevSet.has(id)) flow.toggleOption(field.id, id);
                }

                // toggle OFF
                for (const id of prev) {
                    if (!nextSet.has(id)) flow.toggleOption(field.id, id);
                }

                return;
            }

            if (isActionButton) {
                const isActive =
                    adapter.isActive?.(stored, adapterCtx) ?? Boolean(stored);
                if (isActive) flow.toggleOption(field.id);
                else flow.clearField(field.id);
            }
        },
        [
            adapter,
            adapterCtx,
            field.id,
            field.type,
            flow,
            fp,
            isActionButton,
            isOptionBased,
            optionIds,
        ],
    );

    // Template context (keep your current behavior)
    const templateCtx = React.useMemo<Record<string, unknown>>(() => {
        const ctxFromInit = (flow as any).init?.ctx ?? {};
        const ctx =
            ctxOverrides && typeof ctxOverrides === "object"
                ? { ...(ctxFromInit as any), ...(ctxOverrides as any) }
                : (ctxFromInit as Record<string, unknown>);

        return {
            ...ctx,
            field,
            flow,
            value: fp.value,
            error: fp.error,
        };
    }, [ctxOverrides, field, flow, fp.error, fp.value]);

    const templatedDefaultProps = React.useMemo(() => {
        if (!templateStrings) return defaultProps;
        return templateDeep(defaultProps as any, templateCtx);
    }, [defaultProps, templateCtx, templateStrings]);

    const templatedExtraProps = React.useMemo(() => {
        if (!templateStrings)
            return (extraProps ?? {}) as Record<string, unknown>;
        return templateDeep((extraProps ?? {}) as any, templateCtx);
    }, [extraProps, templateCtx, templateStrings]);

    const fieldProps =
        adapter?.getInputPropsFromField?.({ field, props: flow.raw }) ?? {};
    // Build host props
    const hostProps: Record<string, unknown> = {
        id: field.id,
        field,
        disabled: !!disabled || !!fp.disabled,

        // DO NOT pass `name` to InputField/entries
        fieldKey: field.id,

        ...(fieldProps ?? {}),
        // error channel
        error: fp.error,

        ...(templatedDefaultProps ?? {}),
        ...(templatedExtraProps ?? {}),
    };

    // value + change wiring
    hostProps[valueProp] = (fp.value ?? null) as Scalar | Scalar[] | null;
    hostProps[changeProp] = onHostChange;

    return <Component {...hostProps} />;
}
