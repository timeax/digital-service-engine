// src/utils/build-order-snapshot.ts

import type {
    FallbackDiagnostics,
    OrderSnapshot,
    QuantityRule,
    Scalar,
    ServiceFallbacks,
    UtilityLineItem,
    UtilityMode,
} from "@/schema/order";
import type {
    DgpServiceCapability,
    Field,
    FieldOption,
    ServiceIdRef,
    ServiceProps,
    Tag,
} from "@/schema";
import type { Builder } from "@/core";
import type { DgpServiceMap } from "@/schema/provider";
import { isMultiField } from "./index";
import type { PruneResult } from "./prune-fallbacks";
import { pruneInvalidNodeFallbacks } from "./prune-fallbacks";
import type { FallbackSettings } from "@/schema/validation";
import {
    constraintFitOk,
    getServiceCapability,
    normalizeRatePolicy,
    rateOk,
} from "./util";

/* ───────────────────────── Public types ───────────────────────── */

export type BuildOrderSnapshotSettings = {
    mode?: "prod" | "dev";
    hostDefaultQuantity?: number;
    /** Full fallback policy */
    fallback?: FallbackSettings;
    workspaceId?: string;
    builderCommit?: string;
};

export type BuildOrderSelection = {
    /** Single active context (one tag) coming from Selection */
    activeTagId: string;
    /** Non-option inputs, keyed by fieldId (will be remapped to field.name in the payload) */
    formValuesByFieldId: Record<string, Scalar | Scalar[]>;
    /** Option selections, keyed by fieldId → optionId[] */
    optionSelectionsByFieldId: Record<string, string[]>;
    selectedKeys?: string[];
    /**
     * Selection visit order for options (optional, improves "first option wins primary" determinism).
     * If omitted, iteration order falls back to Object.entries(optionSelectionsByFieldId).
     */
    optionTraversalOrder?: Array<{ fieldId: string; optionId: string }>;
};

/* ───────────────────────── Entry point ───────────────────────── */

export function buildOrderSnapshot(
    props: ServiceProps,
    builder: Builder,
    selection: BuildOrderSelection,
    services: DgpServiceMap,
    settings: BuildOrderSnapshotSettings = {},
): OrderSnapshot {
    const mode: "prod" | "dev" = settings.mode ?? "prod";
    const hostDefaultQty: number = Number.isFinite(
        settings.hostDefaultQuantity ?? 1,
    )
        ? (settings.hostDefaultQuantity as number)
        : 1;

    // Default fallback policy (strict in prod; diagnostics in dev)
    const fbSettings: FallbackSettings = {
        requireConstraintFit: true,
        ratePolicy: { kind: "lte_primary", pct: 5 },
        selectionStrategy: "priority",
        mode: mode === "dev" ? "dev" : "strict",
        ...(settings.fallback ?? {}),
    };

    const builtAt: string = new Date().toISOString();
    const tagId: string = selection.activeTagId;

    // 1) Resolve visible fields for the single context
    const selectedButtonKeys: string[] =
        selection.selectedKeys ??
        toSelectedOptionKeys(selection.optionSelectionsByFieldId);
    const visibleFieldIds: string[] = builder.visibleFields(
        tagId,
        selectedButtonKeys,
    );

    // Indexes
    const tagById: Map<string, Tag> = new Map(
        (props.filters ?? []).map((t) => [t.id, t]),
    );
    const fieldById: Map<string, Field> = new Map(
        (props.fields ?? []).map((f) => [f.id, f]),
    );
    const tagConstraints:
        | Partial<Record<"refill" | "cancel" | "dripfeed", boolean>>
        | undefined = tagById.get(tagId)?.constraints ?? undefined;

    // 2) Selection.fields (id, type, selectedOptions?)
    const selectionFields = visibleFieldIds
        .map((fid) => fieldById.get(fid))
        .filter((f): f is Field => !!f)
        .map((f) => {
            const optIds: string[] | undefined = isOptionBased(f)
                ? (selection.optionSelectionsByFieldId[f.id] ?? [])
                : undefined;
            return {
                id: f.id,
                type: String(f.type),
                ...(optIds && optIds.length ? { selectedOptions: optIds } : {}),
            };
        });

    // 3) Inputs (form by field.name, selections by fieldId)
    const { formValues, selections } = buildInputs(
        visibleFieldIds,
        fieldById,
        selection,
    );

    // 4) Quantity
    const qtyRes = resolveQuantity(
        visibleFieldIds,
        fieldById,
        tagById,
        selection,
        tagId,
        hostDefaultQty,
    );
    const quantity: number = qtyRes.quantity;
    const quantitySource = qtyRes.source;

    // 5) Services and serviceMap (UPDATED behavior: tag default is default; any option with service_id is included; first becomes primary)
    const { serviceMap, servicesList } = resolveServices(
        tagId,
        visibleFieldIds,
        selection,
        tagById,
        fieldById,
    );

    const { min, max } = resolveMinMax(servicesList, services);

    // 6) Fallbacks — client-side conservative prune (keeps only relevant-to-selection)
    const prunedFallbacks = pruneFallbacksConservative(
        props.fallbacks as unknown as ServiceFallbacks | undefined,
        { tagId, constraints: tagConstraints, serviceMap, servicesList },
        services,
        fbSettings,
    );

    // 7) Utilities — line items derived from utility fields/options
    const utilities = collectUtilityLineItems(
        visibleFieldIds,
        fieldById,
        selection,
        quantity,
    );

    // 8) Dev warnings (fallback diagnostics + form/utility hints)
    const warnings: OrderSnapshot["warnings"] | undefined =
        mode === "dev"
            ? buildDevWarnings(
                  props,
                  services,
                  tagId,
                  serviceMap,
                  prunedFallbacks.original,
                  prunedFallbacks.pruned,
                  fieldById,
                  visibleFieldIds,
                  selection,
              )
            : undefined;

    // 9) Meta.context (single-tag effective constraints + nodeContexts)
    const snapshotPolicy = toSnapshotPolicy(fbSettings);
    const meta = {
        schema_version: props.schema_version,
        workspaceId: settings.workspaceId,
        builder: settings.builderCommit
            ? { commit: settings.builderCommit }
            : undefined,
        context: {
            tag: tagId,
            constraints: (tagConstraints ?? {}) as Record<
                "refill" | "cancel" | "dripfeed",
                boolean | undefined
            >,
            nodeContexts: buildNodeContexts(
                tagId,
                visibleFieldIds,
                fieldById,
                selection,
            ),
            policy: snapshotPolicy,
        },
    };

    const snapshot: OrderSnapshot = {
        version: "1",
        mode,
        builtAt,
        selection: {
            tag: tagId,
            buttons: selectedButtonKeys,
            fields: selectionFields,
        },
        inputs: {
            form: formValues,
            selections,
        },

        min,
        max: max ?? min,

        quantity,
        quantitySource,
        services: servicesList,
        serviceMap,
        ...(prunedFallbacks.pruned
            ? { fallbacks: prunedFallbacks.pruned }
            : {}),
        ...(utilities.length ? { utilities } : {}),
        ...(warnings ? { warnings } : {}),
        meta,
    };

    return snapshot;
}

/* ───────────────────────── Helpers ───────────────────────── */

function isOptionBased(f: Field): boolean {
    const hasOptions: boolean =
        Array.isArray(f.options) && f.options.length > 0;
    return hasOptions || isMultiField(f);
}

function toSelectedOptionKeys(byField: Record<string, string[]>): string[] {
    const keys: string[] = [];
    for (const [fieldId, optionIds] of Object.entries(byField ?? {})) {
        for (const optId of optionIds ?? []) {
            keys.push(`${fieldId}::${optId}`);
        }
    }
    return keys;
}

function isServicedBased(field: Field) {
    if (field.service_id) return true;
    return !!(field.options && field.options.some((item) => item.service_id));
}

function buildInputs(
    visibleFieldIds: string[],
    fieldById: Map<string, Field>,
    selection: BuildOrderSelection,
): {
    formValues: Record<string, Scalar | Scalar[]>;
    selections: Record<string, string[]>;
} {
    const formValues: Record<string, Scalar | Scalar[]> = {};
    const selections: Record<string, string[]> = {};

    for (const fid of visibleFieldIds) {
        const f: Field | undefined = fieldById.get(fid);
        if (!f) continue;

        const selOptIds: string[] | undefined =
            selection.optionSelectionsByFieldId[fid];
        if (selOptIds && selOptIds.length) {
            selections[fid] = [...selOptIds];
        }

        // Only non-option fields contribute to form values; key by field.name
        if (!isServicedBased(f)) {
            const name: string | undefined = f.name;
            const val: Scalar | Scalar[] | undefined =
                selection.formValuesByFieldId[fid];
            if (!name || val === undefined) continue;
            formValues[name] = val;
        }
    }

    return { formValues, selections };
}

/* ───────────────── Quantity ───────────────── */

function resolveQuantity(
    visibleFieldIds: string[],
    fieldById: Map<string, Field>,
    tagById: Map<string, Tag>,
    selection: BuildOrderSelection,
    tagId: string,
    hostDefault: number,
): { quantity: number; source: OrderSnapshot["quantitySource"] } {
    // Precedence:
    // 1) First visible field with a valid quantity rule -> evaluate
    // 2) Selected option defaults, then visible button-style field defaults, then active tag default
    // 3) Host default
    for (const fid of visibleFieldIds) {
        const f: Field | undefined = fieldById.get(fid);
        if (!f) continue;
        const rule: QuantityRule | undefined = readQuantityRule(
            (f.meta as any)?.quantity,
        );
        if (!rule) continue;

        const raw: Scalar | Scalar[] | undefined =
            selection.formValuesByFieldId[fid];
        const evaluated = evaluateQuantityRule(rule, raw);
        if (Number.isFinite(evaluated) && (evaluated as number) > 0) {
            return {
                quantity: evaluated as number,
                source: { kind: "field", id: f.id, rule },
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

    return {
        quantity: hostDefault,
        source: { kind: "default", defaultedFromHost: true },
    };
}

function readQuantityRule(v: unknown): QuantityRule | undefined {
    if (!v || typeof v !== "object") return undefined;
    const src = v as QuantityRule;
    if (
        src.valueBy !== "value" &&
        src.valueBy !== "length" &&
        src.valueBy !== "eval"
    )
        return undefined;
    const out: QuantityRule = { valueBy: src.valueBy };
    if (src.code && typeof src.code === "string") out.code = src.code;
    if (typeof src.multiply === "number" && Number.isFinite(src.multiply)) {
        out.multiply = src.multiply;
    }
    if (typeof src.fallback === "number" && Number.isFinite(src.fallback)) {
        out.fallback = src.fallback;
    }
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

function evaluateQuantityRule(
    rule: QuantityRule,
    raw: Scalar | Scalar[] | undefined,
): number {
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

function evaluateRawQuantityRule(
    rule: QuantityRule,
    raw: Scalar | Scalar[] | undefined,
): number {
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
                const values = Array.isArray(raw)
                    ? (raw as Scalar[])
                    : raw !== undefined
                      ? [raw]
                      : [];
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

function applyClamp(
    value: number,
    clamp: QuantityRule["clamp"] | undefined,
): number {
    let next = value;
    if (clamp?.min !== undefined) next = Math.max(next, clamp.min);
    if (clamp?.max !== undefined) next = Math.min(next, clamp.max);
    return next;
}

function resolveNodeDefaultQuantity(
    visibleFieldIds: string[],
    fieldById: Map<string, Field>,
    tagById: Map<string, Tag>,
    selection: BuildOrderSelection,
    tagId: string,
): { quantity: number; source: OrderSnapshot["quantitySource"] } | undefined {
    const optionVisit = buildOptionVisitOrder(selection, fieldById);
    for (const { fieldId, optionId } of optionVisit) {
        if (!visibleFieldIds.includes(fieldId)) continue;
        const field = fieldById.get(fieldId);
        const option = field?.options?.find((item) => item.id === optionId);
        const quantityDefault = readQuantityDefault(
            (option?.meta as any)?.quantityDefault,
        );
        if (quantityDefault !== undefined) {
            return {
                quantity: quantityDefault,
                source: { kind: "option", id: optionId },
            };
        }
    }

    for (const fieldId of visibleFieldIds) {
        const field = fieldById.get(fieldId);
        if (!field) continue;
        const isButtonStyle =
            field.button === true ||
            (Array.isArray(field.options) && field.options.length > 0);
        if (!isButtonStyle) continue;
        const quantityDefault = readQuantityDefault(
            (field as any).quantityDefault,
        );
        if (quantityDefault !== undefined) {
            return {
                quantity: quantityDefault,
                source: { kind: "field", id: field.id },
            };
        }
    }

    const tagQuantityDefault = readQuantityDefault(
        (tagById.get(tagId)?.meta as any)?.quantityDefault,
    );
    if (tagQuantityDefault !== undefined) {
        return {
            quantity: tagQuantityDefault,
            source: { kind: "tag", id: tagId },
        };
    }

    return undefined;
}

function readQuantityDefault(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? value
        : undefined;
}

/* ───────────────── Services (UPDATED) ───────────────── */

function resolveServices(
    tagId: string,
    visibleFieldIds: string[],
    selection: BuildOrderSelection,
    tagById: Map<string, Tag>,
    fieldById: Map<string, Field>,
): {
    serviceMap: Record<string, Array<string | number>>;
    servicesList: Array<string | number>;
} {
    const serviceMap: Record<string, Array<string | number>> = {};
    const ordered: Array<string | number> = [];

    // 1) Tentative primary from tag default (if any) — default only.
    const tag = tagById.get(tagId);
    let primary: string | number | undefined;
    let primaryOrigin: "tag" | "option" | undefined;

    if (tag?.service_id !== undefined) {
        primary = tag.service_id;
        primaryOrigin = "tag";
        // We'll only record it in lists if it survives override.
    }

    // 2) Walk option selections in a deterministic order
    const optionVisit = buildOptionVisitOrder(selection, fieldById);

    for (const { fieldId, optionId } of optionVisit) {
        // only consider options whose field is visible in this group
        if (!visibleFieldIds.includes(fieldId)) continue;

        const f = fieldById.get(fieldId);
        if (!f || !Array.isArray(f.options)) continue;

        const opt = f.options.find((o) => o.id === optionId);
        if (!opt) continue;

        const role = (opt.pricing_role ?? "base") as
            | "base"
            | "utility"
            | string;
        const sid = opt.service_id;

        // Defensive: ignore if a (misconfigured) utility has service_id.
        if (role === "utility") continue;

        if (sid !== undefined) {
            // First option with service_id overrides tag default primary.
            if (primary === undefined || primaryOrigin === "tag") {
                primary = sid;
                primaryOrigin = "option";
                // Since primary owns index 0, push it first
                ordered.length = 0; // clear any tentative tag default
                ordered.push(primary);
            } else {
                // Additional option services append
                ordered.push(sid);
            }
            // Map origin node → sid
            pushService(serviceMap, optionId, sid);
        }
    }

    // 3) If no option established a primary, use tag default (if present)
    if (primaryOrigin !== "option" && primary !== undefined) {
        ordered.unshift(primary);
        pushService(serviceMap, tagId, primary);
    } else {
        // If overridden, we do NOT record tagId→default in serviceMap
    }

    const servicesList = dedupeByString(ordered);
    return { serviceMap, servicesList };
}

function buildOptionVisitOrder(
    selection: BuildOrderSelection,
    fieldById: Map<string, Field>,
): Array<{ fieldId: string; optionId: string }> {
    if (
        selection.optionTraversalOrder &&
        selection.optionTraversalOrder.length
    ) {
        return selection.optionTraversalOrder.slice();
    }
    // fallback: expand optionSelectionsByFieldId in insertion-ish order
    const out: Array<{ fieldId: string; optionId: string }> = [];
    for (const [fid, optIds] of Object.entries(
        selection.optionSelectionsByFieldId ?? {},
    )) {
        const f = fieldById.get(fid);
        if (!f) continue;
        for (const oid of optIds ?? [])
            out.push({ fieldId: fid, optionId: oid });
    }
    return out;
}

function pushService(
    map: Record<string, Array<string | number>>,
    nodeId: string,
    sid: string | number,
): void {
    if (!map[nodeId]) map[nodeId] = [];
    map[nodeId].push(sid);
}

function dedupeByString<T extends string | number>(arr: T[]): T[] {
    const s = new Set<string>();
    const out: T[] = [];
    for (const v of arr) {
        const key = String(v);
        if (s.has(key)) continue;
        s.add(key);
        out.push(v);
    }
    return out;
}

/* ───────────── Fallback pruning (client-conservative) ───────────── */

type PruneEnv = {
    tagId: string;
    constraints?: Partial<Record<"refill" | "cancel" | "dripfeed", boolean>>;
    serviceMap: Record<string, Array<string | number>>;
    servicesList: Array<string | number>;
};

function pruneFallbacksConservative(
    fallbacks: ServiceFallbacks | undefined,
    env: PruneEnv,
    svcMap: DgpServiceMap,
    policy: FallbackSettings,
): { pruned?: ServiceFallbacks; original?: ServiceFallbacks } {
    if (!fallbacks) return { pruned: undefined, original: undefined };

    // Prefer shared helper (keeps behavior consistent with tests)
    try {
        const { props: prunedProps }: PruneResult = pruneInvalidNodeFallbacks(
            {
                filters: [],
                fields: [],
                schema_version: "1.0",
                fallbacks,
            } as unknown as ServiceProps,
            svcMap,
            policy,
        );
        return {
            pruned: prunedProps.fallbacks as unknown as
                | ServiceFallbacks
                | undefined,
            original: fallbacks,
        };
    } catch {
        // Minimal inline conservative prune (selection-aware)
        const out: ServiceFallbacks = {};
        const requireFit: boolean = policy.requireConstraintFit ?? true;

        // Nodes: keep only for nodes present in env.serviceMap; apply rate & (optional) constraints against tag
        if ((fallbacks as any).nodes) {
            const keptNodes: Record<string, Array<string | number>> = {};
            for (const [nodeId, candidates] of Object.entries(
                (fallbacks as any).nodes as Record<
                    string,
                    Array<string | number>
                >,
            )) {
                if (!env.serviceMap[nodeId]) continue;
                const primary = (env.serviceMap[nodeId] ?? [])[0];
                const kept: Array<string | number> = [];
                for (const cand of candidates ?? []) {
                    if (!rateOk(svcMap, cand, primary, policy)) continue;
                    if (
                        requireFit &&
                        env.constraints &&
                        !constraintFitOk(svcMap, cand, env.constraints)
                    )
                        continue;
                    kept.push(cand);
                }
                if (kept.length) keptNodes[nodeId] = kept;
            }
            if (Object.keys(keptNodes).length) (out as any).nodes = keptNodes;
        }

        // Global: keep only primaries that are present in selection; apply rate & (optional) constraints
        if ((fallbacks as any).global) {
            const keptGlobal: Record<
                string | number,
                Array<string | number>
            > = {};
            const present = new Set(env.servicesList.map((sid) => String(sid)));
            for (const [primary, cands] of Object.entries(
                (fallbacks as any).global as Record<
                    string | number,
                    Array<string | number>
                >,
            )) {
                if (!present.has(String(primary))) continue;
                const primId: string | number = isFiniteNumber(primary)
                    ? Number(primary)
                    : (primary as any);
                const kept: Array<string | number> = [];
                for (const cand of cands ?? []) {
                    if (!rateOk(svcMap, cand, primId, policy)) continue;
                    if (
                        requireFit &&
                        env.constraints &&
                        !constraintFitOk(svcMap, cand, env.constraints)
                    )
                        continue;
                    kept.push(cand);
                }
                if (kept.length) keptGlobal[primId] = kept;
            }
            if (Object.keys(keptGlobal).length)
                (out as any).global = keptGlobal;
        }

        return {
            pruned: Object.keys(out).length ? out : undefined,
            original: fallbacks,
        };
    }
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}

/* ───────────────── Utilities collection ───────────────── */

type UtilityMarker = {
    mode: UtilityMode;
    rate: number;
    valueBy?: "value" | "length";
    percentBase?: "service_total" | "base_service" | "all";
    label?: string;
};

function collectUtilityLineItems(
    visibleFieldIds: string[],
    fieldById: Map<string, Field>,
    selection: BuildOrderSelection,
    quantity: number,
): UtilityLineItem[] {
    const items: UtilityLineItem[] = [];

    for (const fid of visibleFieldIds) {
        const f = fieldById.get(fid);
        if (!f) continue;

        const isUtilityField = (f.pricing_role ?? "base") === "utility";
        const marker = readUtilityMarker((f.meta as any)?.utility);

        // Field-based utility
        if (isUtilityField && marker) {
            const val: Scalar | Scalar[] | undefined =
                selection.formValuesByFieldId[f.id];
            const item = buildUtilityItemFromMarker(
                f.id,
                marker,
                quantity,
                val,
            );
            if (item) items.push(item);
        }

        // Option-based utility (only if selected)
        if (Array.isArray(f.options) && f.options.length) {
            const selectedOptIds =
                selection.optionSelectionsByFieldId[f.id] ?? [];
            if (selectedOptIds.length) {
                const optById = new Map<string, FieldOption>(
                    f.options.map((o) => [o.id, o]),
                );
                for (const oid of selectedOptIds) {
                    const opt = optById.get(oid);
                    if (!opt) continue;
                    if ((opt.pricing_role ?? "base") !== "utility") continue;
                    const om = readUtilityMarker((opt.meta as any)?.utility);
                    if (!om) continue;
                    // For per_value on options, we use the parent field's value as the base value
                    const parentVal: Scalar | Scalar[] | undefined =
                        selection.formValuesByFieldId[f.id];
                    const item = buildUtilityItemFromMarker(
                        opt.id,
                        om,
                        quantity,
                        parentVal,
                    );
                    if (item) items.push(item);
                }
            }
        }
    }

    return items;
}

function readUtilityMarker(v: unknown): UtilityMarker | undefined {
    if (!v || typeof v !== "object") return undefined;
    const src = v as UtilityMarker;
    if (!src.mode || typeof src.rate !== "number" || !Number.isFinite(src.rate))
        return undefined;
    if (
        src.mode !== "flat" &&
        src.mode !== "per_quantity" &&
        src.mode !== "per_value" &&
        src.mode !== "percent"
    )
        return undefined;
    const out: UtilityMarker = { mode: src.mode, rate: src.rate };
    if (src.valueBy === "value" || src.valueBy === "length")
        out.valueBy = src.valueBy;
    if (
        src.percentBase === "service_total" ||
        src.percentBase === "base_service" ||
        src.percentBase === "all"
    ) {
        out.percentBase = src.percentBase;
    }
    if (typeof src.label === "string" && src.label.trim()) {
        out.label = src.label.trim();
    }
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
            base.inputs.value = Array.isArray(value)
                ? (value[0] ?? null)
                : (value ?? null);
        }
    }
    return base;
}

/* ───────────────── meta.context helpers ──────────────── */

function buildNodeContexts(
    tagId: string,
    visibleFieldIds: string[],
    fieldById: Map<string, Field>,
    selection: BuildOrderSelection,
): Record<string, string | null> {
    const ctx: Record<string, string | null> = {};
    ctx[tagId] = tagId; // tag maps to itself

    for (const fid of visibleFieldIds) {
        const f = fieldById.get(fid);
        if (!f) continue;

        const binds = normalizeBindIds(f.bind_id);
        const applicable = binds.has(tagId);

        const selectedOptIds = selection.optionSelectionsByFieldId[fid] ?? [];
        for (const oid of selectedOptIds) {
            ctx[oid] = applicable ? tagId : null;
        }
    }

    return ctx;
}

function normalizeBindIds(bind: string | string[] | undefined): Set<string> {
    const out = new Set<string>();
    if (!bind) return out;
    if (Array.isArray(bind)) {
        for (const b of bind) if (b) out.add(String(b));
    } else {
        out.add(String(bind));
    }
    return out;
}

/* ───────────────── Dev warnings ───────────────── */

function buildDevWarnings(
    props: ServiceProps,
    svcMap: DgpServiceMap,
    _tagId: string,
    _snapshotServiceMap: Record<string, Array<string | number>>,
    originalFallbacks: ServiceFallbacks | undefined,
    _prunedFallbacks: ServiceFallbacks | undefined,
    fieldById: Map<string, Field>,
    visibleFieldIds: string[],
    selection: BuildOrderSelection,
): OrderSnapshot["warnings"] | undefined {
    const out: OrderSnapshot["warnings"] = {};

    // Fallback diagnostics (non-fatal). Call only if a global helper is present at runtime.
    const maybeCollectFailed:
        | ((
              p: ServiceProps,
              sm: DgpServiceMap,
              s: { mode: "dev" },
          ) => FallbackDiagnostics[])
        | undefined = (globalThis as any).collectFailedFallbacks;

    try {
        if (maybeCollectFailed && originalFallbacks) {
            const diags = maybeCollectFailed(
                {
                    ...props,
                    fallbacks: originalFallbacks,
                } as ServiceProps,
                svcMap,
                { mode: "dev" },
            );
            if (diags && diags.length) {
                out.fallbacks = diags;
            }
        }
    } catch {
        // ignore diagnostics failures in dev
    }

    // Utility/Form warnings: missing field.name while value present (only for non-option fields)
    const utilityWarnings: Array<{ nodeId: string; reason: string }> = [];
    for (const fid of visibleFieldIds) {
        const f = fieldById.get(fid);
        if (!f) continue;
        const hasVal = selection.formValuesByFieldId[fid] !== undefined;
        if (hasVal && !f.name && !isOptionBased(f)) {
            utilityWarnings.push({
                nodeId: fid,
                reason: "missing_field_name_for_form_value",
            });
        }
    }
    if (utilityWarnings.length) {
        (out as any).utility = utilityWarnings;
    }

    if (!(out as any).fallbacks && !(out as any).utility) return undefined;
    return out;
}

/* ───────────────── Mapping: internal settings → SnapshotContext.policy ───────────────── */

function toSnapshotPolicy(settings: FallbackSettings): {
    ratePolicy:
        | { kind: "eq_primary" }
        | { kind: "lte_primary"; pct: number }
        | { kind: "within_pct"; pct: number }
        | { kind: "at_least_pct_lower"; pct: number };
    requireConstraintFit: boolean;
} {
    const requireConstraintFit = settings.requireConstraintFit ?? true;
    const rp = normalizeRatePolicy(settings.ratePolicy);
    return { ratePolicy: rp, requireConstraintFit };
}

function getCap(
    map: DgpServiceMap,
    id: ServiceIdRef,
): DgpServiceCapability | undefined {
    return getServiceCapability(map, id);
}

function resolveMinMax(
    servicesList: Array<string | number>,
    services: DgpServiceMap,
): { min: number; max?: number } {
    let min: number | undefined = undefined;
    let max: number | undefined = undefined;

    for (const sid of servicesList) {
        const cap = getCap(services, sid);
        if (!cap) continue;

        if (typeof cap.min === "number" && Number.isFinite(cap.min)) {
            min = min === undefined ? cap.min : Math.min(min, cap.min);
        }
        if (typeof cap.max === "number" && Number.isFinite(cap.max)) {
            max = max === undefined ? cap.max : Math.max(max, cap.max);
        }
    }

    return { min: min ?? 1, ...(max !== undefined ? { max } : {}) };
}
