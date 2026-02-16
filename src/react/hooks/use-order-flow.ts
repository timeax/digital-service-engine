// src/react/hooks/use-order-flow.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ServiceProps } from "@/schema";
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

const ROOT_TAG_ID = "t:root";

type NormalizeRateFn = (service: unknown) => number;

export type PricingPreview = {
    /** which service id won the "highest normalized rate" pick */
    serviceId?: string | number;

    /** normalized per-quantity rate */
    unitRate: number;

    /** base = unitRate * quantityPreview */
    base: number;

    /** derived from snapshot.utilities */
    utilities: number;

    /** base + utilities */
    total: number;

    utilityBreakdown: Array<{
        nodeId: string;
        mode: string;
        amount: number;
    }>;
};

export type UseOrderFlowReturn = {
    /** whether provider has been initialized */
    ready: boolean;

    /** initialize via hook (provider owns it; hook surfaces it) */
    initialize: (params: OrderFlowInitializeParams) => void;

    activeTagId?: string;

    /**
     * ✅ Canonical visibility snapshot from Selection.visibleGroup()
     * - parentTags is the breadcrumb path (may be empty)
     * - childrenTags are immediate children of the active parent context
     * - fields/fieldIds are already resolved for the current context + triggers
     */
    visibleGroup: VisibleGroup | null;

    /**
     * Effective (engine-facing) input maps:
     * Only include VISIBLE fields (so hidden stored values don’t affect pricing/snapshot).
     */
    formValuesByFieldId: Record<string, Scalar | Scalar[]>;
    optionSelectionsByFieldId: Record<string, string[]>;

    quantityPreview: number;
    services: Array<string | number>;
    serviceMap: Record<string, Array<string | number>>;

    /** NEW: pricing preview (highest-rate * qty + utilities) */
    pricingPreview: PricingPreview;

    min: number;
    max: number;

    selectTag: (tagId: string) => void;
    toggleOption: (fieldId: string, optionId?: string) => void;
    setValue: (fieldId: string, value: Scalar | Scalar[]) => void;
    clearField: (fieldId: string) => void;

    reset: (opts?: { keepTag?: boolean }) => void;
    setSnapshot: (snap: OrderSnapshot, opts?: { clearFirst?: boolean }) => void;

    buildSnapshot: () => OrderSnapshot;

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
     * Re-render tick for Selection changes.
     * Selection is canonical for visibility (visibleGroup).
     */
    const [selTick, setSelTick] = useState(0);
    useEffect(() => {
        if (!ready) return;
        const sel = ctx.selection;
        if (!sel?.onChange) return;
        return sel.onChange(() => setSelTick((x) => x + 1));
    }, [ready, ctx.selection]);

    /**
     * Re-render tick for Form changes.
     * Your FormApi uses manual publish/subscribe, so we must subscribe.
     */
    const [formTick, setFormTick] = useState(0);
    useEffect(() => {
        const unsub = ctx.formApi.subscribe(() => setFormTick((x) => x + 1));
        return unsub;
    }, [ctx.formApi]);

    /**
     * Canonical visible group snapshot from Selection.
     * IMPORTANT: we do NOT use builder.visibleFields here (trace rule).
     */
    const baseVisibleGroup: VisibleGroup | null = useMemo(() => {
        if (!ready) return null;

        const sel = ctx.selection;
        if (!sel) return null;

        const vg: VisibleGroupResult = sel.visibleGroup();
        if (vg.kind !== "single") return null;

        return vg.group ?? null;
    }, [ready, ctx.selection, selTick]);

    /**
     * Visible group augmented by includes_for_buttons based on Form selections.
     *
     * Why:
     * - Wrapper uses formApi.setSelections / setSelections, which updates formTick.
     * - Selection.visibleGroup() does not read FormApi selections for includes_for_buttons.
     * - So we layer includes_for_buttons on top here, using FormApi as the source of truth.
     *
     * Convention:
     * - A button field (keyed by fieldId) is considered ON when its selection array contains the fieldId itself.
     */
    const visibleGroup: VisibleGroup | null = useMemo(() => {
        if (!ready) return null;
        if (!baseVisibleGroup) return null;

        // best-effort props: use ref if available; else ask builder (ready-safe)
        const props =
            propsRef.current ??
            ctx.ensureReady("visibleGroup").builder.getProps();

        const includeMap = (props as any).includes_for_buttons as
            | Record<string, string[]>
            | undefined;

        if (!includeMap) return baseVisibleGroup;

        const extras = new Set<string>();

        for (const [buttonFieldId, includeIds] of Object.entries(includeMap)) {
            const selected = ctx.formApi.getSelections(buttonFieldId) ?? [];
            const isOn = selected.includes(buttonFieldId);

            if (!isOn) continue;

            for (const id of includeIds) extras.add(id);
        }

        if (extras.size === 0) return baseVisibleGroup;

        const mergedIds = (baseVisibleGroup.fieldIds ?? []).slice();
        for (const id of extras) {
            if (!mergedIds.includes(id)) mergedIds.push(id);
        }

        const fieldById = new Map<string, any>(
            ((props as any).fields ?? []).map((f: any) => [f.id, f]),
        );

        const mergedFields = mergedIds
            .map((id) => fieldById.get(id))
            .filter(Boolean);

        return {
            ...baseVisibleGroup,
            fieldIds: mergedIds,
            fields: mergedFields,
        };
    }, [ready, baseVisibleGroup, ctx, formTick]);

    /**
     * Active tag id:
     * Prefer Selection.currentTag() as the source of truth.
     * Fall back to provider state if needed.
     */
    const activeTagId = useMemo(() => {
        if (!ready) return undefined;
        return ctx.selection?.currentTag?.() ?? ctx.activeTagId;
    }, [ready, ctx.selection, ctx.activeTagId, selTick]);

    /**
     * Effective maps (visible-scoped).
     * We intentionally read ONLY visible field ids from FormApi.
     * This keeps stored (hidden) values, but prevents “ghost actives” from affecting snapshot.
     */
    const { formValuesByFieldId, optionSelectionsByFieldId } = useMemo(() => {
        const values: Record<string, Scalar | Scalar[]> = {};
        const selections: Record<string, string[]> = {};

        const ids = visibleGroup?.fieldIds ?? [];

        for (const fid of ids) {
            const v = ctx.formApi.get(fid);
            if (v !== undefined) values[fid] = v;

            const sel = ctx.formApi.getSelections(fid);
            if (sel && sel.length) selections[fid] = sel.slice();
        }

        return {
            formValuesByFieldId: values,
            optionSelectionsByFieldId: selections,
        };
    }, [ctx.formApi, visibleGroup, formTick]);

    const previewSnapshot: OrderSnapshot = useMemo(() => {
        if (!ready) {
            return {
                version: "1",
                mode: "prod",
                builtAt: new Date().toISOString(),
                selection: { tag: "unknown", fields: [] },
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
                            ratePolicy: { kind: "lte_primary" },
                            requireConstraintFit: true,
                        },
                    },
                },
            };
        }

        const { builder, init } = ctx.ensureReady("previewSnapshot");

        const mode: "prod" | "dev" = init.mode ?? "prod";
        const hostDefaultQuantity = Number(init.hostDefaultQuantity ?? 1) || 1;

        return buildOrderSnapshot(
            builder.getProps(),
            builder,
            {
                activeTagId: activeTagId ?? ROOT_TAG_ID,
                formValuesByFieldId,
                optionSelectionsByFieldId,
            },
            init.services,
            {
                mode,
                hostDefaultQuantity,
                fallback: ctx.fallbackPolicy,
            },
        );
    }, [
        activeTagId,
        ctx,
        formValuesByFieldId,
        optionSelectionsByFieldId,
        ready,
    ]);

    /**
     * NEW: pricing preview (highest rate * quantityPreview + utilities)
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

                case "per_value": {
                    const v = u?.inputs?.value;
                    const valueBy = u?.inputs?.valueBy;

                    let n = 0;

                    if (typeof v === "number") {
                        n = v;
                    } else if (typeof v === "string") {
                        if (valueBy === "length") n = v.length;
                        else {
                            const parsed = Number(v);
                            if (Number.isFinite(parsed)) n = parsed;
                        }
                    } else if (Array.isArray(v)) {
                        if (valueBy === "length") n = v.length;
                        else {
                            const sum = v.reduce(
                                (acc: number, x: unknown) =>
                                    acc +
                                    (typeof x === "number" && Number.isFinite(x)
                                        ? x
                                        : 0),
                                0,
                            );
                            n = sum;
                        }
                    }

                    amount = rate * n;
                    break;
                }

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

        const total = base + utilitiesTotal;

        return {
            serviceId: bestId,
            unitRate: bestRate,
            base,
            utilities: utilitiesTotal,
            total,
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

    const toggleOption = useCallback(
        (fieldId: string, optionId?: string) => {
            const token = optionId ?? fieldId;

            ctx.formApi.toggleSelection(fieldId, token);
            ctx.selection?.toggle?.(token);
        },
        [ctx],
    );

    const setValue = useCallback(
        (fieldId: string, value: Scalar | Scalar[]) => {
            ctx.ensureReady("setValue");
            ctx.formApi.set(fieldId, value);
        },
        [ctx],
    );

    const clearField = useCallback(
        (fieldId: string) => {
            ctx.ensureReady("clearField");

            ctx.formApi.set(fieldId, undefined as unknown as Scalar);

            ctx.formApi.removeSelectionToken(fieldId);

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

    const buildSnapshot = useCallback((): OrderSnapshot => {
        const { builder, selection, init } = ctx.ensureReady("buildSnapshot");

        const tagId = selection.currentTag();
        if (!tagId)
            throw new Error("OrderFlow: no active tag/context selected");

        const mode: "prod" | "dev" = init.mode ?? "prod";
        const hostDefaultQuantity = Number(init.hostDefaultQuantity ?? 1) || 1;

        return buildOrderSnapshot(
            builder.getProps(),
            builder,
            {
                activeTagId: tagId,
                formValuesByFieldId,
                optionSelectionsByFieldId,
            },
            init.services,
            {
                mode,
                hostDefaultQuantity,
                fallback: ctx.fallbackPolicy,
            },
        );
    }, [ctx, formValuesByFieldId, optionSelectionsByFieldId]);

    return {
        ready,
        initialize,

        activeTagId,

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
        setValue,
        clearField,

        reset,
        setSnapshot,

        buildSnapshot,

        fallbackPolicy: ctx.fallbackPolicy,
        setFallbackPolicy: ctx.setFallbackPolicy,
    };
}
