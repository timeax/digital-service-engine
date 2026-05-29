// src/react/hooks/use-order-flow.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ServiceProps, ServicePropsNotice } from "@/schema";
import type { OrderSnapshot, Scalar } from "@/schema/order";
import type { FallbackSettings } from "@/schema/validation";

import { buildOrderSnapshot } from "@/utils/build-order-snapshot";
import {
    type OrderFlowInitializeParams,
    useOrderFlowContext,
} from "./order-flow-provider";

import type {
    VisibleGroup,
    VisibleGroupResult,
} from "@/react/canvas/selection";
import { validateVisibleFields } from "@/react/hooks/evalute-field-validation";

const ROOT_TAG_ID = "t:root";

type NormalizeRateFn = (service: unknown) => number;

export type PricingPreview = {
    serviceId?: string | number;
    unitRate: number;
    base: number;
    utilities: number;
    total: number;
    utilityBreakdown: Array<{
        nodeId: string;
        mode: string;
        amount: number;
    }>;
};

export type UseOrderFlowReturn = {
    ready: boolean;
    initialize: (params: OrderFlowInitializeParams) => void;

    activeTagId?: string;

    /** raw service props */
    raw: ServiceProps;

    /** visibility is Selection-only */
    visibleGroup: VisibleGroup | null;

    /**
     * Values are from form-palette (values()) and are already "visible-only"
     * because your UI mounts only visible fields.
     */
    formValuesByFieldId: Record<string, Scalar | Scalar[]>;

    /**
     * Selections are Selection-only now.
     * We keep this for compatibility with buildOrderSnapshot signature,
     * but we do NOT read it from form anymore.
     */
    optionSelectionsByFieldId: Record<string, string[]>;

    quantityPreview: number;
    services: Array<string | number>;
    serviceMap: Record<string, Array<string | number>>;

    pricingPreview: PricingPreview;

    min: number;
    max: number;

    selectTag: (tagId: string) => void;
    toggleOption: (fieldId: string, optionId?: string) => void;
    setFieldOptions: (fieldId: string, optionIds: string[]) => void;

    /** programmatic value set (rare; wrapper/field hook should handle most) */
    setValue: (fieldId: string, value: Scalar | Scalar[]) => void;
    clearField: (fieldId: string) => void;

    reset: (opts?: { keepTag?: boolean }) => void;
    setSnapshot: (snap: OrderSnapshot, opts?: { clearFirst?: boolean }) => void;

    /** VALIDATES via form.submit() */
    buildSnapshot: () => OrderSnapshot | undefined;

    notices: ServicePropsNotice[];

    fallbackPolicy: FallbackSettings;
    setFallbackPolicy: (next: FallbackSettings) => void;
};

export function useOrderFlow(): UseOrderFlowReturn {
    const ctx = useOrderFlowContext();
    const ready = ctx.ready();

    const initialize = useCallback(
        (params: OrderFlowInitializeParams) => {
            ctx.initialize(params);
        },
        [ctx],
    );

    // keep propsRef updated (best-effort; only when ready)
    const propsRef = useRef<ServiceProps | null>(null);
    useEffect(() => {
        if (!ready) return;
        propsRef.current = ctx.ensureReady("propsRef").builder.getProps();
    }, [ctx, ready]);

    /**
     * Selection tick: Selection is external, so we force re-render.
     */
    const [selTick, setSelTick] = useState(0);
    useEffect(() => {
        if (!ready) return;
        const sel = ctx.selection;
        if (!sel?.onChange) return;
        return sel.onChange(() => setSelTick((x) => x + 1));
    }, [ready, ctx.selection]);

    /**
     * Form tick: form-palette bridge is pub/sub, so we subscribe.
     * On each tick we recompute form.values() or form.submit() where needed.
     */
    const [formTick, setFormTick] = useState(0);
    useEffect(() => {
        return ctx.formApi.subscribe(() => setFormTick((x) => x + 1));
    }, [ctx.formApi]);

    /**
     * Visibility is Selection-only. No form-based augmentation.
     */
    const visibleGroup: VisibleGroup | null = useMemo(() => {
        if (!ready) return null;

        const sel = ctx.selection;
        if (!sel) return null;

        const vg: VisibleGroupResult = sel.visibleGroup();
        if (vg.kind !== "single") return null;

        return vg.group ?? null;
    }, [ready, ctx.selection, selTick]);

    const activeTagId = useMemo(() => {
        if (!ready) return undefined;
        return ctx.selection?.currentTag?.() ?? ctx.activeTagId;
    }, [ready, ctx.selection, ctx.activeTagId, selTick]);

    /**
     * Preview values:
     * - NO validation
     * - driven by form.values() (core.values())
     * - already visible-only because only visible fields are mounted.
     */
    const formValuesByFieldId: Record<string, Scalar | Scalar[]> =
        useMemo(() => {
            const values = (ctx.formApi.snapshot?.() ?? {}) as Record<
                string,
                Scalar | Scalar[]
            >;

            return values;
        }, [ctx.formApi, formTick]);

    /**
     * Selections are Selection-only now.
     * Keep empty map for snapshot builder signature.
     */
    const optionSelectionsByFieldId = useMemo(
        () => ({}) as Record<string, string[]>,
        [],
    );

    /**
     * Preview snapshot uses form.values() (no validation) + Selection context.
     */
    const previewSnapshot: OrderSnapshot = useMemo(() => {
        if (!ready) {
            return {
                version: "1",
                mode: "prod",
                builtAt: new Date().toISOString(),
                selection: { tag: "unknown", fields: [], buttons: [] },
                inputs: { form: {}, selections: {} },
                quantity: 1,
                quantitySource: { kind: "default", defaultedFromHost: true },
                services: [],
                min: 1,
                max: 1,
                serviceMap: {},
                meta: {
                    schema_version: propsRef.current?.schema_version,
                    context: {
                        tag: "unknown",
                        constraints: {},
                        nodeContexts: {},
                        policy: {
                            ratePolicy: { kind: "lte_primary", pct: 5 },
                            requireConstraintFit: true,
                        },
                    },
                },
            };
        }

        const { builder, init, selection } = ctx.ensureReady("previewSnapshot");
        const mode: "prod" | "dev" = init.mode ?? "prod";
        const hostDefaultQuantity = Number(init.hostDefaultQuantity ?? 1) || 1;

        /// console.log(formValuesByFieldId)
        return buildOrderSnapshot(
            builder.getProps(),
            builder,
            {
                activeTagId: activeTagId ?? ROOT_TAG_ID,
                formValuesByFieldId,
                selectedKeys: selection.selectedButtons(),
                optionSelectionsByFieldId, // Selection-owned now
            },
            init.services,
            {
                mode,
                hostDefaultQuantity,
                fallback: ctx.fallbackPolicy,
            },
        );
    }, [
        ready,
        ctx,
        activeTagId,
        formValuesByFieldId,
        optionSelectionsByFieldId,
        selTick,
    ]);

    /**
     * Pricing preview unchanged (driven from previewSnapshot)
     */
    const pricingPreview: PricingPreview = useMemo(() => {
        const empty: PricingPreview = {
            unitRate: 0,
            base: 0,
            utilities: 0,
            total: 0,
            utilityBreakdown: [],
        };

        if (!ready) return empty;

        const { init } = ctx.ensureReady("pricingPreview");
        const normalizeRate: NormalizeRateFn =
            ((init as unknown as { normalizeRate?: NormalizeRateFn })
                .normalizeRate as NormalizeRateFn) ??
            ((s: any) => Number(s?.rate));

        const quantity = Number(previewSnapshot.quantity ?? 1) || 1;

        let bestId: string | number | undefined;
        let bestRate = 0;

        const selectedIds = (previewSnapshot.services ?? []) as Array<
            string | number
        >;
        const svcMap = (init as any).services as Record<
            string | number,
            unknown
        >;

        for (const id of selectedIds) {
            const svc = svcMap?.[id];
            if (!svc) continue;

            const r = Number(normalizeRate(svc));
            if (!Number.isFinite(r)) continue;

            if (r > bestRate) {
                bestRate = r;
                bestId = id;
            }
        }

        const base = bestRate * quantity;

        const breakdown: PricingPreview["utilityBreakdown"] = [];
        let utilitiesTotal = 0;

        const utils = ((previewSnapshot as any).utilities ?? []) as Array<any>;
        for (const u of utils) {
            const rate = Number(u?.rate);
            if (!Number.isFinite(rate)) continue;

            let amount = 0;
            const mode = String(u?.mode ?? "");

            switch (mode) {
                case "flat":
                    amount = rate;
                    break;
                case "per_quantity":
                    amount = rate * quantity;
                    break;
                case "percent":
                    amount = base * (rate / 100);
                    break;
                default:
                    amount = 0;
            }

            if (Number.isFinite(amount) && amount !== 0) {
                utilitiesTotal += amount;
                breakdown.push({
                    nodeId: String(u?.nodeId ?? ""),
                    mode,
                    amount,
                });
            }
        }

        return {
            serviceId: bestId,
            unitRate: bestRate,
            base,
            utilities: utilitiesTotal,
            total: base + utilitiesTotal,
            utilityBreakdown: breakdown,
        };
    }, [ready, ctx, previewSnapshot]);

    const selectTag = useCallback(
        (tagId: string) => {
            ctx.ensureReady("selectTag");
            ctx.selection?.replace?.(tagId);
            ctx.setActiveTag(tagId);
        },
        [ctx],
    );

    /**
     * Selection-only toggles.
     * (No form selections.)
     */
    const toggleOption = useCallback(
        (fieldId: string, optionId?: string) => {
            const token = optionId ?? fieldId;
            ctx.selection?.toggle?.(token);
        },
        [ctx],
    );

    const setFieldOptions = useCallback(
        (fieldId: string, optionIds: string[]) => {
            const { builder, selection, init } = ctx.ensureReady(
                "setFieldOptions",
            );

            const fields = builder.getProps().fields ?? [];
            const field = fields.find((f) => f.id === fieldId);
            if (!field) return;

            const validOptionIds = new Set(
                (field.options ?? []).map((option) => String(option.id)),
            );

            const dedupedValid: string[] = [];
            const seen = new Set<string>();
            for (const rawOptionId of optionIds ?? []) {
                const optionId = String(rawOptionId);
                if (!validOptionIds.has(optionId)) continue;
                if (seen.has(optionId)) continue;
                seen.add(optionId);
                dedupedValid.push(optionId);
            }

            const mode: "prod" | "dev" = init.mode ?? "prod";
            const isMulti = field.meta?.multi === true;
            const normalized =
                mode === "prod" && !isMulti
                    ? dedupedValid.length
                        ? [dedupedValid[dedupedValid.length - 1]!]
                        : []
                    : dedupedValid;

            const fieldById = new Map(fields.map((f) => [f.id, f]));
            const nodeMap = builder.getNodeMap();

            const resolveOptionOwnerFieldId = (
                token: string,
            ): string | undefined => {
                if (!token) return undefined;

                if (token.includes("::")) {
                    const [legacyFieldId, optionId] = token.split("::", 2);
                    if (!optionId) return undefined;
                    const optionRef = nodeMap.get(optionId) as
                        | { kind?: string; fieldId?: string }
                        | undefined;
                    if (
                        optionRef?.kind === "option" &&
                        typeof optionRef.fieldId === "string"
                    ) {
                        return optionRef.fieldId;
                    }
                    if (legacyFieldId && fieldById.has(legacyFieldId)) {
                        return legacyFieldId;
                    }
                    return undefined;
                }

                const optionRef = nodeMap.get(token) as
                    | { kind?: string; fieldId?: string }
                    | undefined;
                if (
                    optionRef?.kind === "option" &&
                    typeof optionRef.fieldId === "string"
                ) {
                    return optionRef.fieldId;
                }

                for (const f of fields) {
                    if (f.options?.some((option) => option.id === token)) {
                        return f.id;
                    }
                }

                return undefined;
            };

            const retained = Array.from(selection.all()).filter(
                (token) => resolveOptionOwnerFieldId(token) !== fieldId,
            );

            for (const optionId of normalized) {
                if (!retained.includes(optionId)) retained.push(optionId);
            }

            selection.many(retained, retained[retained.length - 1]);
        },
        [ctx],
    );

    const setValue = useCallback(
        (fieldId: string, value: Scalar | Scalar[]) => {
            // programmatic, goes into form memory (core bucket)
            ctx.formApi.set(fieldId, value);
        },
        [ctx],
    );

    const clearField = useCallback(
        (fieldId: string) => {
            ctx.formApi.set(fieldId, undefined);
            ctx.selection?.remove?.(fieldId);
        },
        [ctx],
    );

    const reset = useCallback(
        (opts?: { keepTag?: boolean }) => {
            ctx.ensureReady("reset");
            ctx.reset(opts);
        },
        [ctx],
    );

    const setSnapshot = useCallback(
        (snap: OrderSnapshot, opts?: { clearFirst?: boolean }) => {
            ctx.ensureReady("setSnapshot");
            ctx.setSnapshot(snap, opts);
        },
        [ctx],
    );

    /**
     * Build snapshot must VALIDATE.
     * This is where form.submit() belongs.
     */
    const buildSnapshot = useCallback((): OrderSnapshot | undefined => {
        const { builder, selection, init } = ctx.ensureReady("buildSnapshot");

        const tagId = selection.currentTag();
        const selectedKeys = selection.selectedButtons();
        if (!tagId) {
            throw new Error("OrderFlow: no active tag/context selected");
        }

        const mode: "prod" | "dev" = init.mode ?? "prod";
        const hostDefaultQuantity = Number(init.hostDefaultQuantity ?? 1) || 1;

        const submitted = ctx.formApi.submit();
        const values = submitted.values as Record<string, Scalar | Scalar[]>;

        if (!submitted.valid) return;

        const visibleFieldIds =
            builder.visibleFields?.(tagId, selectedKeys) ??
            builder
                .getProps()
                .fields.filter((f) => f.bind_id === tagId)
                .map((f) => f.id);

        const fieldById = new Map(
            builder.getProps().fields.map((field) => [field.id, field]),
        );

        const customIssues = validateVisibleFields(
            visibleFieldIds,
            fieldById,
            values,
        );

        if (customIssues.length > 0) {
            ctx.formApi.setErrors?.(
                Object.fromEntries(
                    customIssues.map((issue) => [issue.fieldId, issue.message]),
                ),
            );

            return;
        }

        return buildOrderSnapshot(
            builder.getProps(),
            builder,
            {
                activeTagId: tagId,
                formValuesByFieldId: values,
                selectedKeys,
                optionSelectionsByFieldId,
            },
            init.services,
            {
                mode,
                hostDefaultQuantity,
                fallback: ctx.fallbackPolicy,
            },
        );
    }, [ctx, optionSelectionsByFieldId]);

    const raw = useMemo(() => {
        if (!ready) return propsRef.current ?? ({} as ServiceProps);
        return ctx.ensureReady("raw").builder.getProps();
    }, [ctx, ready, selTick]);

    const notices = useMemo(() => raw.notices ?? [], [raw]);

    return {
        ready,
        initialize,

        activeTagId,
        raw,
        notices,

        visibleGroup,

        formValuesByFieldId,
        optionSelectionsByFieldId,

        quantityPreview: previewSnapshot.quantity,
        services: previewSnapshot.services,
        serviceMap: previewSnapshot.serviceMap,

        pricingPreview,

        min: previewSnapshot.min ?? 1,
        max: previewSnapshot.max ?? previewSnapshot.min ?? 1,

        selectTag,
        toggleOption,
        setFieldOptions,
        setValue,
        clearField,

        reset,
        setSnapshot,

        buildSnapshot,

        fallbackPolicy: ctx.fallbackPolicy,
        setFallbackPolicy: ctx.setFallbackPolicy,
    };
}
