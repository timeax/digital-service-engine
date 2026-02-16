// src/react/inputs/wrapper.tsx
import * as React from "react";
import { useMemo } from "react"; // <-- adjust if your path differs
import type {
    Field,
    FieldOption,
    UtilityMark,
    WithQuantityDefault,
} from "@/schema";
import type { ButtonValue, OrderSnapshot, Scalar } from "@/schema/order";
import type { FallbackSettings } from "@/schema/validation";
import type { DgpServiceMap } from "@/schema/provider";

import {
    InputDescriptor,
    InputKind,
    InputVariant,
    resolveInputDescriptor,
    useInputs,
    useOrderFlowContext,
} from "@/react";
import { isMultiField } from "@/utils";

import { useOrderFlow } from "@/react/hooks/use-order-flow";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type WrapperRuntimeSnapshot = {
    field: Field;

    // order-flow state
    ready: boolean;
    activeTagId?: string;

    visibleFieldIds?: string[];
    visibleFields?: Field[];

    formValuesByFieldId: Record<string, Scalar | Scalar[]>;
    optionSelectionsByFieldId: Record<string, string[]>;

    quantityPreview: number;

    // currently active services (IDs) + the “map” explaining them
    services: Array<string | number>;
    serviceMap: Record<string, Array<string | number>>;

    // flow-level bounds (typically for quantity)
    min: number;
    max: number;

    // init + ctx (host runtime context)
    initMode?: "prod" | "dev";
    initServices?: DgpServiceMap;
    ctx: Record<string, unknown>;

    // policy
    fallbackPolicy: FallbackSettings;

    // convenience: this field’s current view
    fieldValue: Scalar | Scalar[] | undefined;
    fieldSelections: string[];

    // optional lazy snapshot getter (avoids extra cost unless needed)
    getOrderSnapshot: () => OrderSnapshot;
};

export type InputWrapperProps = {
    field: Field;
    disabled?: boolean;

    /**
     * Extra props to forward to the host input component (LOW priority).
     * Adapter wiring can still override value/onChange.
     */
    extraProps?: Record<string, unknown>;

    /**
     * Default true:
     * - resolves {path.to.value} placeholders inside any string prop
     *   coming from descriptor.defaultProps and extraProps
     */
    templateStrings?: boolean;

    /**
     * Optional additional ctx values scoped to this Wrapper call.
     * These override init.ctx values for templating & snapshot.
     */
    ctxOverrides?: Record<string, unknown>;
};

export type OnChangeValue = ButtonValue | ButtonValue[];

/* -------------------------------------------------------------------------- */
/* Kind / Variant helpers                                                     */
/* -------------------------------------------------------------------------- */

function toKind(field: Field): InputKind {
    return field.type as InputKind;
}

function toVariant(field: Field): InputVariant | undefined {
    const v = (field as any).meta?.variant;
    return typeof v === "string" && v.trim() ? (v as InputVariant) : undefined;
}

/* -------------------------------------------------------------------------- */
/* Safe templating (no eval)                                                  */
/* Supports:                                                                  */
/*  - {platform.name}                                                        */
/*  - {platform.name ?? "Social"}                                            */
/*  - {platform.name || "Social"}                                            */
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

    // fallback to ctx path
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

export function Wrapper({
    field,
    disabled,
    extraProps,
    templateStrings = true,
    ctxOverrides,
}: InputWrapperProps) {
    const { registry } = useInputs();
    const flowCtx = useOrderFlowContext();
    const form = flowCtx.formApi;
    const flow = useOrderFlow();

    const kind = toKind(field);
    const variant = toVariant(field);

    const descriptor: InputDescriptor | undefined = React.useMemo(
        () => resolveInputDescriptor(registry, kind, variant),
        [kind, registry, variant],
    );

    if (!descriptor) {
        // eslint-disable-next-line no-console
        console.warn("[InputWrapper] No descriptor for", {
            kind,
            variant,
            field,
        });
        return null;
    }

    const { Component, adapter, defaultProps: baseProps } = descriptor;

    const defaultProps = useMemo(() => {
        return { ...(baseProps ?? {}), ...(field.defaults ?? {}) };
    }, [field]);

    const valueProp = adapter?.valueProp ?? "value";
    const changeProp = adapter?.changeProp ?? "onChange";

    // Shape/intention
    const isOptionBased =
        Array.isArray(field.options) && field.options.length > 0;
    const multi = !!(isOptionBased && isMultiField(field));
    const isButton = field.button === true || isOptionBased;

    // keep latest form api without retriggering cleanup
    const formRef = React.useRef(form);
    React.useEffect(() => {
        formRef.current = form;
    }, [form]);

    React.useEffect(() => {
        if (!isButton) return;

        return () => {
            // run only on unmount (or if field.id / isButton changes)
            formRef.current?.removeSelectionToken(field.id);
        };
    }, [isButton, field.id]);

    // Option lookup
    const optionById = React.useMemo(() => {
        if (!isOptionBased) return new Map<string, FieldOption>();
        return new Map((field.options ?? []).map((o) => [o.id, o]));
    }, [isOptionBased, field.options]);

    const enrich = React.useCallback(
        (bv: ButtonValue): ButtonValue => {
            // Option-based → derive from option
            if (isOptionBased) {
                const opt = optionById.get(bv.id);
                if (opt) {
                    const role = (opt.pricing_role ?? "base") as
                        | "base"
                        | "utility";
                    const sid = (opt as any).service_id as number | undefined;

                    const meta = (opt.meta ?? field.meta) as
                        | (Record<string, unknown> &
                              UtilityMark &
                              WithQuantityDefault)
                        | undefined;

                    return {
                        ...bv,
                        pricing_role: role,
                        service_id: role === "utility" ? undefined : sid,
                        ...(meta ? { meta } : {}),
                    };
                }
                return bv;
            }

            // Option-less button → derive from field
            const role = (field.pricing_role ?? "base") as "base" | "utility";
            const sid = (field as any).service_id as number | undefined;

            const meta = field.meta as
                | (Record<string, unknown> & UtilityMark & WithQuantityDefault)
                | undefined;

            return {
                ...bv,
                pricing_role: role,
                service_id: role === "utility" ? undefined : sid,
                ...(meta ? { meta } : {}),
            };
        },
        [field, isOptionBased, optionById],
    );

    const normalizeToButtonValues = React.useCallback(
        (input: unknown): ButtonValue[] => {
            const coerceOne = (v: unknown): ButtonValue | null => {
                if (v && typeof v === "object" && "id" in (v as any)) {
                    const id = String((v as any).id);
                    const valueRaw = (v as any).value;
                    const value =
                        typeof valueRaw === "number" ||
                        typeof valueRaw === "string"
                            ? (valueRaw as number | string)
                            : 1;
                    return enrich({ id, value });
                }
                // Primitive -> treat as id; value defaults to 1
                if (typeof v === "string" || typeof v === "number") {
                    return enrich({ id: String(v), value: 1 });
                }
                return null;
            };

            if (Array.isArray(input)) {
                const arr: ButtonValue[] = [];
                for (const x of input) {
                    const one = coerceOne(x);
                    if (one) arr.push(one);
                }
                return arr;
            }

            const one = coerceOne(input);
            return one ? [one] : [];
        },
        [enrich],
    );

    // Current value bindings
    let current: Scalar | Scalar[] | undefined = undefined;
    let onChange: ((v: unknown) => void) | undefined = undefined;

    if (form) {
        if (isButton) {
            if (isOptionBased) {
                // option buttons: current is selected option ids (single or array)
                const selIds = form.getSelections(field.id);
                current = multi ? selIds : (selIds[0] ?? null);

                onChange = (next: unknown) => {
                    const normalized = adapter?.getValue
                        ? adapter.getValue(next, current)
                        : next;

                    const bvs = normalizeToButtonValues(normalized);
                    const ids = bvs.map((b) => b.id);

                    form.setSelections(field.id, Array.from(new Set(ids)));

                    // store values (if you need utility/quantity semantics)
                    form.set(field.id, normalized as any);
                };
            } else {
                // option-less button: keep scalar value and selection presence
                const val = form.get(field.id);
                current = val;

                onChange = (next: unknown) => {
                    const normalized = adapter?.getValue
                        ? adapter.getValue(next, current)
                        : next;

                    const active = Boolean(normalized);

                    console.log(normalized);

                    if (active) {
                        form.setSelections(field.id, [field.id]);
                        form.set(field.id, normalized as Scalar);
                    } else {
                        form.setSelections(field.id, []);
                        form.set(field.id, undefined as any); // instead of null
                    }
                };
            }
        } else {
            // plain input
            current = form.get(field.id);
            onChange = (next: unknown) => {
                const normalized = adapter?.getValue
                    ? adapter.getValue(next, current)
                    : (next as Scalar | Scalar[]);
                form.set(field.id, normalized as Scalar | Scalar[]);
            };
        }
    }

    // Build wrapper snapshot for host components
    const snapshot: WrapperRuntimeSnapshot = React.useMemo(() => {
        const ctxFromInit = (flow as any).init?.ctx ?? {}; // (per your note)
        const ctx =
            ctxOverrides && typeof ctxOverrides === "object"
                ? { ...(ctxFromInit as any), ...(ctxOverrides as any) }
                : (ctxFromInit as Record<string, unknown>);

        const fieldValue = flow.formValuesByFieldId[field.id];
        const fieldSelections = flow.optionSelectionsByFieldId[field.id] ?? [];

        return {
            field,

            ready: flow.ready,
            activeTagId: flow.activeTagId,

            visibleFieldIds: flow.visibleGroup?.fieldIds,
            visibleFields: flow.visibleGroup?.fields,

            formValuesByFieldId: flow.formValuesByFieldId,
            optionSelectionsByFieldId: flow.optionSelectionsByFieldId,

            quantityPreview: flow.quantityPreview,

            services: flow.services,
            serviceMap: flow.serviceMap,

            min: flow.min,
            max: flow.max,

            initMode: (flow as any).init?.mode,
            initServices: (flow as any).init?.services,
            ctx,

            fallbackPolicy: flow.fallbackPolicy,

            fieldValue,
            fieldSelections,

            getOrderSnapshot: flow.buildSnapshot,
        };
    }, [
        ctxOverrides,
        field,
        flow.activeTagId,
        flow.buildSnapshot,
        flow.fallbackPolicy,
        flow.formValuesByFieldId,
        flow.max,
        flow.min,
        flow.optionSelectionsByFieldId,
        flow.quantityPreview,
        flow.ready,
        flow.serviceMap,
        flow.services,
        flow.visibleGroup,
    ]);

    // Templating context (adds a few convenience bindings)
    const templateCtx = React.useMemo<Record<string, unknown>>(() => {
        return {
            ...snapshot.ctx,
            field,
            snapshot,
            // handy shortcuts (some people like these):
            min: snapshot.min,
            max: snapshot.max,
            services: snapshot.services,
            serviceMap: snapshot.serviceMap,
            quantity: snapshot.quantityPreview,
            // field-local shortcuts:
            value: snapshot.fieldValue,
            selections: snapshot.fieldSelections,
        };
    }, [field, snapshot]);

    const templatedDefaultProps = React.useMemo(() => {
        if (!templateStrings)
            return (defaultProps ?? {}) as Record<string, unknown>;
        return templateDeep((defaultProps ?? {}) as any, templateCtx) as Record<
            string,
            unknown
        >;
    }, [defaultProps, templateCtx, templateStrings]);

    const templatedExtraProps = React.useMemo(() => {
        if (!templateStrings)
            return (extraProps ?? {}) as Record<string, unknown>;
        return templateDeep((extraProps ?? {}) as any, templateCtx) as Record<
            string,
            unknown
        >;
    }, [extraProps, templateCtx, templateStrings]);

    // Host props passed to the input component
    const hostProps: Record<string, unknown> = {
        id: field.id,
        field,
        disabled: !!disabled,
        name: field.name,
        label: field.label,
        required: field.required,
        // NEW: give host inputs a rich runtime snapshot
        snapshot,

        ...(templatedDefaultProps ?? {}),
        ...(templatedExtraProps ?? {}),
        ...(isOptionBased ? { options: field.options as FieldOption[] } : {}),
    };

    if (form) {
        hostProps[valueProp] = current as unknown;
        hostProps[changeProp] = onChange as unknown;
    }

    return <Component {...hostProps} />;
}
