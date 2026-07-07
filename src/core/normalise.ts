// src/core/normalise.ts

import { cloneDeep } from "lodash-es";
import type {
    Field,
    FieldOption,
    FieldValidationRule,
    PricingRole,
    ServiceFallback,
    ServiceIdRef,
    ServiceProps,
    ServicePropsNotice,
    Tag,
} from "@/schema";

export type NormaliseOptions = {
    /** default pricing role for fields/options when missing */
    defaultPricingRole?: PricingRole; // default: 'base',
    constraints?: string[];
};

export function normalise(
    input: unknown,
    opts: NormaliseOptions = {},
): ServiceProps {
    const defRole: PricingRole = opts.defaultPricingRole ?? "base";
    const constraints = opts.constraints ?? ["refill", "cancel", "dripfeed"];
    const obj = toObject(input);

    // ── Canonical top-level keys only
    const rawFilters = Array.isArray((obj as any).filters)
        ? (obj as any).filters
        : [];
    const rawFields = Array.isArray((obj as any).fields)
        ? (obj as any).fields
        : [];

    const includes_for_buttons = toStringArrayMap(
        (obj as any).includes_for_buttons,
    );
    const excludes_for_buttons = toStringArrayMap(
        (obj as any).excludes_for_buttons,
    );
    const option_effects_for_buttons = toOptionEffectMap(
        (obj as any).option_effects_for_buttons,
    );
    const value_effects_for_triggers = toValueEffectMap(
        (obj as any).value_effects_for_triggers,
    );
    const notices = toNoticeArray((obj as any).notices);

    // Tags & fields
    let filters: Tag[] = rawFilters.map((t: any) => coerceTag(t, constraints));
    const fields: Field[] = rawFields.map((f: any) => coerceField(f, defRole));

    // ── Ensure a root tag exists (id: 't:root')
    if (!filters.some((t) => t.id === "t:root")) {
        filters = [{ id: "t:root", label: "Root" }, ...filters];
    }

    // Canonical fallbacks only
    const fallbacks = coerceFallbacks((obj as any).fallbacks);

    const out: ServiceProps = {
        filters,
        fields,
        order_for_tags: (obj as any).order_for_tags,
        ...(isNonEmpty(includes_for_buttons) && { includes_for_buttons }),
        ...(isNonEmpty(excludes_for_buttons) && { excludes_for_buttons }),
        ...(isNonEmpty(option_effects_for_buttons) && {
            option_effects_for_buttons,
        }),
        ...(isNonEmpty(value_effects_for_triggers) && {
            value_effects_for_triggers,
        }),
        ...(fallbacks &&
            (isNonEmpty(fallbacks.nodes) || isNonEmpty(fallbacks.global)) && {
                fallbacks,
            }),
        ...(notices.length > 0 && { notices }),
        schema_version:
            typeof (obj as any).schema_version === "string"
                ? (obj as any).schema_version
                : "1.0",
    };

    propagateConstraints(out, constraints);
    return out;
}

/* ───────────────────────── Constraint propagation ───────────────────────── */

/**
 * Propagate constraint flags down the tag tree:
 * - Any flag defined on an ancestor overrides the child's local value.
 * - Writes back the effective value to each tag.constraints.
 * - Records provenance in tag.constraints_origin[flag] = <originTagId>.
 * - Records child overrides in tag.constraints_overrides[flag] = { from, to, origin }.
 *
 * IMPORTANT: Children inherit the **effective** value from their parent,
 * not the parent's raw local. This ensures overridden values keep propagating.
 */
function propagateConstraints(props: ServiceProps, flagKeys: string[]): void {
    const tags = Array.isArray(props.filters) ? props.filters : [];
    if (!tags.length) return;

    const byId = new Map(tags.map((t) => [t.id, t]));
    const children = new Map<string, Tag[]>();

    for (const t of tags) {
        const pid = t.bind_id;
        if (!pid || !byId.has(pid)) continue;
        if (!children.has(pid)) children.set(pid, []);
        children.get(pid)!.push(t);
    }

    const roots = tags.filter((t) => !t.bind_id || !byId.has(t.bind_id));
    const starts = roots.length ? roots : tags;

    type Inherited = Partial<Record<string, { val: boolean; origin: string }>>;
    const visited = new Set<string>();

    const visit = (tag: Tag, inherited: Inherited) => {
        if (visited.has(tag.id)) return;
        visited.add(tag.id);

        // If the tag already has overrides, it means it was already normalised once.
        // We should use the 'from' value as our local baseline for this pass
        // so that we don't lose the original local intent.
        const local = cloneDeep(tag.constraints ?? {});
        if (tag.constraints_overrides) {
            for (const [k, over] of Object.entries(tag.constraints_overrides)) {
                if (over) local[k] = over.from;
            }
        }

        const next: Partial<Record<string, boolean>> = {};
        const origin: Partial<Record<string, string>> = {};
        const overrides: NonNullable<Tag["constraints_overrides"]> = {};

        for (const k of flagKeys) {
            const inh = inherited[k];
            const prev = local[k];

            if (inh) {
                if (prev === undefined || prev === inh.val) {
                    next[k] = inh.val;
                    origin[k] = inh.origin;
                } else {
                    next[k] = inh.val;
                    origin[k] = inh.origin;
                    overrides[k] = {
                        from: prev as boolean,
                        to: inh.val,
                        origin: inh.origin,
                    };
                }
            } else if (prev !== undefined) {
                next[k] = prev as boolean;
                origin[k] = tag.id;
            }
        }

        tag.constraints = Object.keys(next).length ? next : undefined;
        tag.constraints_origin = Object.keys(origin).length
            ? origin
            : undefined;
        tag.constraints_overrides = Object.keys(overrides).length
            ? overrides
            : undefined;

        const passDown: Inherited = { ...inherited };
        for (const k of flagKeys) {
            if (next[k] !== undefined && origin[k] !== undefined) {
                passDown[k] = { val: next[k] as boolean, origin: origin[k]! };
            }
        }
        for (const c of children.get(tag.id) ?? []) visit(c, passDown);
    };

    for (const r of starts) visit(r, {});
}

/* ───────────────────────────── coercers ───────────────────────────── */

function coerceTag(src: any, flagKeys: string[]): Tag {
    if (!src || typeof src !== "object") src = {};
    const id = str(src.id);
    const label = str(src.label);
    const bind_id = str(src.bind_id) || (id == "t:root" ? undefined : "t:root");
    const service_id = toServiceIdOrUndefined(src.service_id);

    const includes = toStringArray(src.includes);
    const excludes = toStringArray(src.excludes);

    let constraints: Record<string, boolean> | undefined = undefined;
    if (src.constraints && typeof src.constraints === "object") {
        constraints = {};
        for (const k of flagKeys) {
            const v = (src.constraints as any)[k];
            if (v !== undefined) {
                constraints[k] = bool(v)!;
            }
        }
        if (Object.keys(constraints).length === 0) {
            constraints = undefined;
        }
    }

    const constraints_overrides =
        src.constraints_overrides &&
        typeof src.constraints_overrides === "object"
            ? (src.constraints_overrides as Tag["constraints_overrides"])
            : undefined;

    const meta =
        src.meta && typeof src.meta === "object"
            ? (src.meta as Record<string, unknown>)
            : undefined;

    const tag: Tag = {
        id: "",
        label: "",
        ...(id && { id }),
        ...(label && { label }),
        ...(bind_id && { bind_id }),
        ...(service_id !== undefined && { service_id }),
        ...(constraints && { constraints }),
        ...(constraints_overrides && { constraints_overrides }),
        ...(includes.length && { includes: dedupe(includes) }),
        ...(excludes.length && { excludes: dedupe(excludes) }),
        ...(meta && { meta }),
    };
    return tag;
}
function coerceField(src: any, defRole: PricingRole): Field {
    if (!src || typeof src !== "object") src = {};

    const bind_id = normaliseBindId(src.bind_id);
    const type = str(src.type) || "text";
    const id = str(src.id);
    const name = typeof src.name === "string" ? src.name : undefined;

    // BaseFieldUI (trimmed)
    const label = str(src.label) || "";
    const required = !!src.required;

    // host-defined UI schema + defaults (pass-through if objects)
    const ui =
        src.ui && typeof src.ui === "object"
            ? (src.ui as Record<string, unknown>)
            : undefined;
    const defaults =
        src.defaults && typeof src.defaults === "object"
            ? (src.defaults as Record<string, unknown>)
            : undefined;
    const defaultValue = normalizeValue(src.defaultValue);

    // field-level role (used as default for options)
    const pricing_role: PricingRole =
        src.pricing_role === "utility" || src.pricing_role === "base"
            ? src.pricing_role
            : defRole;

    // options
    const srcHasOptions = Array.isArray(src.options) && src.options.length > 0;
    const options = srcHasOptions
        ? (src.options as any[]).map((o) => coerceOption(o, pricing_role))
        : undefined;

    // custom component (only for type === 'custom')
    const component =
        type === "custom" ? str(src.component) || undefined : undefined;

    // meta (pass-through)
    const meta =
        src.meta && typeof src.meta === "object"
            ? { ...(src.meta as any) }
            : undefined;

    // button rule:
    // - option-based fields are always buttons
    // - otherwise, respect explicit boolean true
    const button: boolean = srcHasOptions ? true : src.button === true;
    const validation = normalizeFieldValidation(src.validation);

    // field-level service_id is allowed only for *buttons* with base role
    const field_service_id_raw = toServiceIdOrUndefined(src.service_id);
    const field_service_id =
        button &&
        pricing_role !== "utility" &&
        field_service_id_raw !== undefined
            ? field_service_id_raw
            : undefined;

    const field: Field = {
        id,
        type,
        ...(bind_id !== undefined && { bind_id }),
        ...(name && { name }),
        ...(options && options.length && { options }),
        ...(component && { component }),
        pricing_role,
        label,
        required,
        ...(ui && { ui: ui as any }),
        ...(defaultValue !== undefined && { defaultValue }),
        ...(defaults && { defaults }),
        ...(meta && { meta }),
        ...(validation && { validation }),
        ...(button ? { button } : {}),
        ...(field_service_id !== undefined && { service_id: field_service_id }),
    };

    return field;
}

function coerceOption(src: any, inheritRole: PricingRole): FieldOption {
    if (!src || typeof src !== "object") src = {};
    const id = str(src.id);
    const label = str(src.label);
    const service_id = toServiceIdOrUndefined(src.service_id);
    const value =
        typeof src.value === "string" || typeof src.value === "number"
            ? (src.value as string | number)
            : undefined;

    const pricing_role: PricingRole =
        src.pricing_role === "utility" || src.pricing_role === "base"
            ? src.pricing_role
            : inheritRole;

    const meta =
        src.meta && typeof src.meta === "object"
            ? (src.meta as Record<string, unknown>)
            : undefined;

    const children = Array.isArray(src.children)
        ? (src.children as any[]).map((child) =>
              coerceOption(child, pricing_role),
          )
        : undefined;

    const option: FieldOption = {
        id: "",
        label: "",
        ...(id && { id }),
        ...(label && { label }),
        ...(value !== undefined && { value }),
        ...(service_id !== undefined && { service_id }),
        pricing_role,
        ...(meta && { meta }),
        ...(children && children.length && { children }),
    };
    return option;
}

/* ───────────────────────── fallbacks (canonical only) ───────────────────────── */

function coerceFallbacks(src: any): ServiceFallback | undefined {
    if (!src || typeof src !== "object") return undefined;

    const out: ServiceFallback = {};
    const g = (src as any).global;
    const n = (src as any).nodes;

    if (g && typeof g === "object") {
        const rg: Record<string, ServiceIdRef[]> = {};
        for (const [k, v] of Object.entries(g)) {
            const key = String(k);
            const arr = toServiceIdArray(v);
            const clean = dedupe(arr.filter((x) => String(x) !== key));
            if (clean.length) rg[key] = clean;
        }
        if (Object.keys(rg).length) out.global = rg;
    }

    if (n && typeof n === "object") {
        const rn: Record<string, ServiceIdRef[]> = {};
        for (const [nodeId, v] of Object.entries(n)) {
            const key = String(nodeId);
            const arr = toServiceIdArray(v);
            const clean = dedupe(arr.filter((x) => String(x) !== key));
            if (clean.length) rn[key] = clean;
        }
        if (Object.keys(rn).length) out.nodes = rn;
    }

    return out.nodes || out.global ? out : undefined;
}

/* ───────────────────────── utilities ───────────────────────── */

function toObject(input: unknown): Record<string, unknown> {
    if (input && typeof input === "object")
        return input as Record<string, unknown>;
    throw new TypeError("normalise(): expected an object payload");
}

function normaliseBindId(bind: unknown): string | string[] | undefined {
    if (typeof bind === "string" && bind.trim()) return bind.trim();
    if (Array.isArray(bind)) {
        const arr = dedupe(bind.map((b) => String(b).trim()).filter(Boolean));
        if (arr.length === 0) return undefined;
        if (arr.length === 1) return arr[0];
        return arr;
    }
    return undefined;
}

function toStringArrayMap(src: any): Record<string, string[]> | undefined {
    if (!src || typeof src !== "object") return undefined;
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(src)) {
        if (!k) continue;
        const arr = toStringArray(v);
        if (arr.length) out[k] = dedupe(arr);
    }
    return Object.keys(out).length ? out : undefined;
}

function toOptionEffectMap(
    src: any,
): ServiceProps["option_effects_for_buttons"] | undefined {
    if (!src || typeof src !== "object") return undefined;

    const out: NonNullable<ServiceProps["option_effects_for_buttons"]> = {};
    for (const [triggerId, rawTargets] of Object.entries(src)) {
        if (!triggerId || !rawTargets || typeof rawTargets !== "object") {
            continue;
        }

        const targets: Record<
            string,
            NonNullable<
                ServiceProps["option_effects_for_buttons"]
            >[string][string]
        > = {};

        for (const [fieldId, rawEffect] of Object.entries(rawTargets as any)) {
            if (!fieldId || !rawEffect || typeof rawEffect !== "object") {
                continue;
            }

            const effect = rawEffect as any;
            const include = toStringArray(effect.include);
            const exclude = toStringArray(effect.exclude);
            const next: NonNullable<
                ServiceProps["option_effects_for_buttons"]
            >[string][string] = {
                ...(effect.forceVisible === true ? { forceVisible: true } : {}),
                ...(include.length ? { include: dedupe(include) } : {}),
                ...(exclude.length ? { exclude: dedupe(exclude) } : {}),
            };

            if (
                next.forceVisible === true ||
                next.include?.length ||
                next.exclude?.length
            ) {
                targets[fieldId] = next;
            }
        }

        if (Object.keys(targets).length) out[triggerId] = targets;
    }

    return Object.keys(out).length ? out : undefined;
}

function toValueEffectMap(
    src: any,
): ServiceProps["value_effects_for_triggers"] | undefined {
    if (!src || typeof src !== "object") return undefined;

    const out: NonNullable<ServiceProps["value_effects_for_triggers"]> = {};
    for (const [triggerId, rawTargets] of Object.entries(src)) {
        if (!triggerId || !rawTargets || typeof rawTargets !== "object") {
            continue;
        }

        const targets: NonNullable<
            ServiceProps["value_effects_for_triggers"]
        >[string] = {};

        for (const [fieldId, rawEffect] of Object.entries(rawTargets as any)) {
            if (!fieldId || !rawEffect || typeof rawEffect !== "object") {
                continue;
            }

            const effect = rawEffect as any;
            const value = normalizeValue(effect.value);
            if (value === undefined) continue;

            const mode =
                effect.mode === "if_empty" || effect.mode === "always"
                    ? effect.mode
                    : undefined;

            targets[fieldId] = {
                value,
                ...(mode ? { mode } : {}),
                ...(effect.clearOnDeactivate === true
                    ? { clearOnDeactivate: true }
                    : {}),
            };
        }

        if (Object.keys(targets).length) out[triggerId] = targets;
    }

    return Object.keys(out).length ? out : undefined;
}

function normalizeValue(
    v: unknown,
): import("@/schema").Scalar | import("@/schema").Scalar[] | undefined {
    if (isScalar(v)) return v;
    if (Array.isArray(v)) {
        const out = v.filter(isScalar);
        return out.length ? out : undefined;
    }
    return undefined;
}

function isScalar(v: unknown): v is import("@/schema").Scalar {
    if (v === null) return true;
    const t = typeof v;
    return t === "string" || t === "number" || t === "boolean";
}

function toStringArray(v: any): string[] {
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x)).filter((s) => !!s && s.trim().length > 0);
}

function toNoticeArray(v: any): ServicePropsNotice[] {
    if (!Array.isArray(v)) return [];
    return v
        .filter((item) => item && typeof item === "object")
        .map((item) => cloneDeep(item as ServicePropsNotice));
}

function toServiceIdOrUndefined(v: any): ServiceIdRef | undefined {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "number") {
        return Number.isFinite(v) ? v : undefined;
    }
    if (typeof v === "string") {
        const trimmed = v.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    return undefined;
}

function str(v: any): string | undefined {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    return undefined;
}

function bool(v: any): boolean | undefined {
    if (v === undefined) return undefined;
    return !!v;
}

function dedupe<T>(arr: T[]): T[] {
    return Array.from(new Set(arr));
}

function isNonEmpty<T extends Record<string, any> | undefined>(
    obj: T,
): obj is NonNullable<T> {
    return !!obj && Object.keys(obj).length > 0;
}

function toServiceIdArray(v: any): ServiceIdRef[] {
    if (!Array.isArray(v)) return [];
    return v
        .map((x) =>
            typeof x === "number" || typeof x === "string" ? x : String(x),
        )
        .filter(
            (x) => x !== "" && x !== null && x !== undefined,
        ) as ServiceIdRef[];
}

function normalizeFieldValidationRule(
    input: unknown,
): FieldValidationRule | undefined {
    if (!input || typeof input !== "object") return undefined;
    const v = input as any;

    const op = v.op;
    if (
        op !== "eq" &&
        op !== "neq" &&
        op !== "gt" &&
        op !== "gte" &&
        op !== "lt" &&
        op !== "lte" &&
        op !== "between" &&
        op !== "in" &&
        op !== "nin" &&
        op !== "truthy" &&
        op !== "falsy" &&
        op !== "match"
    ) {
        return undefined;
    }

    const valueBy =
        v.valueBy === "value" || v.valueBy === "length" || v.valueBy === "eval"
            ? v.valueBy
            : undefined;

    const out: FieldValidationRule = {
        op,
        ...(valueBy ? { valueBy } : {}),
    };

    if ("value" in v) out.value = v.value;
    if (typeof v.min === "number" && Number.isFinite(v.min)) out.min = v.min;
    if (typeof v.max === "number" && Number.isFinite(v.max)) out.max = v.max;
    if (Array.isArray(v.values)) out.values = [...v.values];
    if (typeof v.pattern === "string" && v.pattern.trim())
        out.pattern = v.pattern;
    if (typeof v.flags === "string") out.flags = v.flags;
    if (typeof v.message === "string" && v.message.trim())
        out.message = v.message;

    if (valueBy === "eval" && typeof v.code === "string" && v.code.trim()) {
        out.code = v.code;
    }

    return out;
}

export function normalizeFieldValidation(
    input: unknown,
): FieldValidationRule[] | undefined {
    if (Array.isArray(input)) {
        const rules = input
            .map(normalizeFieldValidationRule)
            .filter(Boolean) as FieldValidationRule[];
        return rules.length ? rules : undefined;
    }

    const one = normalizeFieldValidationRule(input);
    return one ? [one] : undefined;
}
