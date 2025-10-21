// src/core/normalise.ts
// noinspection UnnecessaryLocalVariableJS

import type {
    ServiceProps,
    Tag,
    Field,
    FieldOption,
    PricingRole,
    ServiceFallback, ServiceIdRef
} from '../schema';

export type NormaliseOptions = {
    /** default pricing role for fields/options when missing */
    defaultPricingRole?: PricingRole; // default: 'base'
};

/**
 * Coerce an arbitrary (possibly legacy) payload into the canonical ServiceProps shape.
 * - snake_case keys (bind_id, service_id, includes_for_options, excludes_for_options)
 * - injects a root tag if missing
 * - migrates legacy rootIncludes/rootExcludes -> root.includes/excludes
 * - normalises bind_id (string for single, string[] for multi)
 * - sets pricing_role default ('base') on fields & options
 */
export function normalise(input: unknown, opts: NormaliseOptions = {}): ServiceProps {
    const defRole: PricingRole = opts.defaultPricingRole ?? 'base';

    const obj = toObject(input);

    // pull top-level props (accept a few legacy aliases just in case)
    const legacyFilters = (obj as any).filters ?? (obj as any).tags ?? [];
    const legacyFields = (obj as any).fields ?? [];
    const legacyIncForOpts =
        (obj as any).includes_for_options ??
        (obj as any).includesForOptions ??
        undefined;
    const legacyExcForOpts =
        (obj as any).excludes_for_options ??
        (obj as any).excludeForOptions ??
        undefined;

    // 1) Tags
    let tags: Tag[] = Array.isArray(legacyFilters)
        ? legacyFilters.map(coerceTag)
        : [];

    // 2) Fields
    let fields: Field[] = Array.isArray(legacyFields)
        ? legacyFields.map((f) => coerceField(f, defRole))
        : [];

    // 3) Ensure root tag exists
    const hasRoot = tags.some((t) => t?.id === 'root');
    if (!hasRoot) {
        tags = [
            {
                id: 'root',
                label: 'Root',
                // service_id intentionally undefined here; author-time validator enforces if required
            },
            ...tags,
        ];
    }

    // 4) Migrate legacy rootIncludes/rootExcludes into root tag
    const rootIncludes: string[] = Array.isArray((obj as any).rootIncludes)
        ? (obj as any).rootIncludes.slice()
        : [];
    const rootExcludes: string[] = Array.isArray((obj as any).rootExcludes)
        ? (obj as any).rootExcludes.slice()
        : [];

    if (rootIncludes.length || rootExcludes.length) {
        tags = tags.map((t) => {
            if (t.id !== 'root') return t;
            const includes = dedupe([...(t.includes ?? []), ...rootIncludes]);
            const excludes = dedupe([...(t.excludes ?? []), ...rootExcludes]);

            // normaliser favors excludes over includes if the same id appears in both
            const exclSet = new Set(excludes);
            const filteredIncludes = includes.filter((id) => !exclSet.has(id));

            return {...t, includes: filteredIncludes, excludes};
        });
    }

    // 5) Option-level maps → snake_case
    const includes_for_options = toStringArrayMap(legacyIncForOpts);
    const excludes_for_options = toStringArrayMap(legacyExcForOpts);

    // 6) Return canonical payload (drop unknown top-level keys)
    const out: ServiceProps = {
        filters: tags,
        fields,
        ...(isNonEmpty(includes_for_options) && {includes_for_options}),
        ...(isNonEmpty(excludes_for_options) && {excludes_for_options}),
        schema_version: typeof (obj as any).schema_version === 'string' ? (obj as any).schema_version : '1.0',
    };

    // 6b) Fallbacks: accept legacy shapes and coerce to { nodes, global }
    const fallbacks = coerceFallbacks(obj?.fallbacks);
    if (fallbacks && (isNonEmpty(fallbacks.nodes) || isNonEmpty(fallbacks.global))) {
        out.fallbacks = fallbacks;
    }

    propagateConstraints(out);

    return out;
}

// ───────────────────────── Constraint propagation ─────────────────────────

const FLAG_KEYS = ['refill', 'cancel', 'dripfeed'] as const;
type FlagKey = typeof FLAG_KEYS[number];

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
function propagateConstraints(props: ServiceProps): void {
    const tags = Array.isArray(props.filters) ? props.filters : [];
    if (!tags.length) return;

    // Index + children map
    const byId = new Map(tags.map(t => [t.id, t]));
    const children = new Map<string, Tag[]>();
    for (const t of tags) {
        const pid = t.bind_id;
        if (!pid || !byId.has(pid)) continue; // missing/invalid parent → treat as root
        if (!children.has(pid)) children.set(pid, []);
        children.get(pid)!.push(t);
    }

    // Roots (fallback: if none due to a cycle, start from all tags)
    const roots = tags.filter(t => !t.bind_id || !byId.has(t.bind_id));
    const starts = roots.length ? roots : tags;

    type Inherited = Partial<Record<FlagKey, { val: boolean; origin: string }>>;
    const visited = new Set<string>();

    const visit = (tag: Tag, inherited: Inherited) => {
        if (visited.has(tag.id)) return;
        visited.add(tag.id);

        const local = tag.constraints ?? {};
        const next: Partial<Record<FlagKey, boolean>> = {};
        const origin: Partial<Record<FlagKey, string>> = {};
        const overrides: NonNullable<Tag['constraints_overrides']> = {};

        for (const k of FLAG_KEYS) {
            const inh = inherited[k];
            const prev = local[k];

            if (inh) {
                // Inherited exists
                if (prev === undefined) {
                    // No local → fully inherit (keep ancestor origin)
                    next[k] = inh.val;
                    origin[k] = inh.origin;
                } else if (prev === inh.val) {
                    // Local equals inherited → effective same, but nearest origin is the CHILD
                    next[k] = inh.val;
                    origin[k] = tag.id;
                } else {
                    // Local contradicts inherited → ancestor overrides child; record override
                    next[k] = inh.val;
                    origin[k] = inh.origin;
                    overrides[k] = {from: prev as boolean, to: inh.val, origin: inh.origin};
                }
            } else if (prev !== undefined) {
                // No inherited; local explicit becomes effective and its own origin
                next[k] = prev as boolean;
                origin[k] = tag.id;
            }
            // else: neither inherited nor local → leave undefined
        }

        // Persist only defined keys (keep JSON lean)
        const definedConstraints: Partial<Record<FlagKey, boolean>> = {};
        const definedOrigin: Partial<Record<FlagKey, string>> = {};
        const definedOverrides: NonNullable<Tag['constraints_overrides']> = {};

        for (const k of FLAG_KEYS) {
            if (next[k] !== undefined) definedConstraints[k] = next[k] as boolean;
            if (origin[k] !== undefined) definedOrigin[k] = origin[k] as string;
            if (overrides[k] !== undefined) definedOverrides[k] = overrides[k]!;
        }

        tag.constraints = Object.keys(definedConstraints).length ? definedConstraints : undefined;
        tag.constraints_origin = Object.keys(definedOrigin).length ? definedOrigin : undefined;
        tag.constraints_overrides = Object.keys(definedOverrides).length ? definedOverrides : undefined;

        // Children inherit the **effective** values (and nearest origin) from this tag
        const passDown: Inherited = {...inherited};
        for (const k of FLAG_KEYS) {
            if (next[k] !== undefined && origin[k] !== undefined) {
                passDown[k] = {val: next[k] as boolean, origin: origin[k]!};
            }
        }

        for (const c of children.get(tag.id) ?? []) visit(c, passDown);
    };

    for (const r of starts) visit(r, {});
}

/* ───────────────────────────── helpers ───────────────────────────── */

function toObject(input: unknown): Record<string, unknown> {
    if (input && typeof input === 'object') return input as Record<string, unknown>;
    throw new TypeError('normalise(): expected an object payload');
}

function coerceTag(src: any): Tag {
    if (!src || typeof src !== 'object') src = {};
    const id = str(src.id);
    const label = str(src.label);

    // legacy → snake_case
    const bind_id =
        str(src.bind_id) ||
        str(src.bindId) ||
        undefined;

    const service_id =
        toNumberOrUndefined(src.service_id ?? src.serviceId);

    const includes = toStringArray(src.includes);
    const excludes = toStringArray(src.excludes);

    const constraints =
        src.constraints && typeof src.constraints === 'object'
            ? {
                refill: bool((src.constraints as any).refill),
                cancel: bool((src.constraints as any).cancel),
                dripfeed: bool((src.constraints as any).dripfeed),
            }
            : undefined;

    const meta =
        src.meta && typeof src.meta === 'object' ? (src.meta as Record<string, unknown>) : undefined;

    // noinspection UnnecessaryLocalVariableJS
    const tag: Tag = {
        id: "", label: "",
        ...(id && {id}),
        ...(label && {label}),
        ...(bind_id && {bind_id}),
        ...(service_id !== undefined && {service_id}),
        ...(constraints && {constraints}),
        ...(includes.length && {includes: dedupe(includes)}),
        ...(excludes.length && {excludes: dedupe(excludes)}),
        ...(meta && {meta})
    };

    return tag;
}

function coerceField(src: any, defRole: PricingRole): Field {
    if (!src || typeof src !== 'object') src = {};

    // legacy → snake_case
    const bindRaw = src.bind_id ?? src.bind ?? undefined;
    const bind_id = normaliseBindId(bindRaw);

    const type = str(src.type) || 'text'; // generic safe default
    const id = str(src.id);
    const name = typeof src.name === 'string' ? src.name : undefined;

    // Base UI props (carry through; provide safe defaults)
    const label = str(src.label) || '';
    const placeholder = typeof src.placeholder === 'string' ? src.placeholder : '';
    const helperText = typeof src.helperText === 'string' ? src.helperText : '';
    const helperTextPos = 'bottom' as const;
    const labelClassName = typeof src.labelClassName === 'string' ? src.labelClassName : '';
    const required = !!src.required;
    const axis = src.axis === 'x' || src.axis === 'y' ? src.axis : 'y';
    const labelAxis = src.labelAxis === 'x' || src.labelAxis === 'y' ? src.labelAxis : 'x';
    const extra = 'extra' in src ? src.extra : undefined;

    const pricing_role: PricingRole =
        src.pricing_role === 'utility' || src.pricing_role === 'base'
            ? src.pricing_role
            : defRole;

    // options: convert serviceId -> service_id, set pricing_role default from field
    const options = Array.isArray(src.options)
        ? (src.options as any[]).map((o) => coerceOption(o, pricing_role))
        : undefined;

    const component = type === 'custom' ? str(src.component) || undefined : undefined;

    const meta = (src.meta && typeof src.meta === 'object') ? {...(src.meta as any)} : undefined;
    if (meta && 'multi' in meta) meta.multi = !!meta.multi; // normalize to boolean

    const field: Field = {
        id,
        type,
        ...(bind_id !== undefined && {bind_id}),
        ...(name && {name}),
        ...(options && options.length && {options}),
        ...(component && {component}),
        pricing_role,
        label,
        placeholder,
        helperText,
        helperTextPos,
        labelClassName,
        required,
        axis,
        labelAxis,
        ...(extra !== undefined && {extra}),
        ...(meta && {meta}),
    };

    return field;
}

function coerceOption(src: any, inheritRole: PricingRole): FieldOption {
    if (!src || typeof src !== 'object') src = {};
    const id = str(src.id);
    const label = str(src.label);

    const service_id = toNumberOrUndefined(src.service_id ?? src.serviceId);
    const value =
        typeof src.value === 'string' || typeof src.value === 'number'
            ? (src.value as string | number)
            : undefined;

    const pricing_role: PricingRole =
        src.pricing_role === 'utility' || src.pricing_role === 'base'
            ? src.pricing_role
            : inheritRole;

    const meta =
        src.meta && typeof src.meta === 'object' ? (src.meta as Record<string, unknown>) : undefined;

    const option: FieldOption = {
        id: "", label: "",
        ...(id && {id}),
        ...(label && {label}),
        ...(value !== undefined && {value}),
        ...(service_id !== undefined && {service_id}),
        pricing_role,
        ...(meta && {meta})
    };
    return option;
}

function normaliseBindId(bind: unknown): string | string[] | undefined {
    if (typeof bind === 'string' && bind.trim()) return bind.trim();
    if (Array.isArray(bind)) {
        const arr = dedupe(bind.map((b) => String(b).trim()).filter(Boolean));
        if (arr.length === 0) return undefined;
        if (arr.length === 1) return arr[0];
        return arr;
    }
    return undefined;
}

function toStringArrayMap(src: any): Record<string, string[]> | undefined {
    if (!src || typeof src !== 'object') return undefined;
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(src)) {
        if (!k) continue;
        const arr = toStringArray(v);
        if (arr.length) out[k] = dedupe(arr);
    }
    return Object.keys(out).length ? out : undefined;
}

function toStringArray(v: any): string[] {
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x)).filter((s) => !!s && s.trim().length > 0);
}

function toNumberOrUndefined(v: any): number | undefined {
    if (v === null || v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}

function str(v: any): string | undefined {
    if (typeof v === 'string' && v.trim().length > 0) return v;
    return undefined;
}

function bool(v: any): boolean | undefined {
    if (v === undefined) return undefined;
    return !!v;
}

function dedupe<T>(arr: T[]): T[] {
    return Array.from(new Set(arr));
}

function isNonEmpty(obj: Record<string, any> | undefined): obj is Record<string, any> {
    return !!obj && Object.keys(obj).length > 0;
}


/* ───────────────────────── fallbacks normaliser ───────────────────────── */
function coerceFallbacks(src: any): ServiceFallback | undefined {
    if (!src || typeof src !== 'object') return undefined;

    // Legacy sample shape: { [node_id:number]: Array<string|number>, global: { [service_id]: Array<string|number> } }
    // Canonical: { nodes?: Record<string, ServiceIdRef[]>, global?: Record<ServiceIdRef, ServiceIdRef[]> }
    const out: ServiceFallback = {};

    // Global
    const g = (src as any).global;
    if (g && typeof g === 'object') {
        const rg: Record<string, ServiceIdRef[]> = {};
        for (const [k, v] of Object.entries(g)) {
            const key = String(k);
            const arr = toServiceIdArray(v);
            const clean = dedupe(arr.filter(x => String(x) !== key)); // drop self references
            if (clean.length) rg[key] = clean;
        }
        if (Object.keys(rg).length) out.global = rg;
    }

    // Nodes: everything except 'global' treated as node-scoped in legacy shape
    const rn: Record<string, ServiceIdRef[]> = {};
    for (const [k, v] of Object.entries(src)) {
        if (k === 'global') continue;
        const nodeId = String(k);
        const arr = toServiceIdArray(v);
        const clean = dedupe(arr.filter(x => String(x) !== nodeId)); // drop self references against nodeId string
        if (clean.length) rn[nodeId] = clean;
    }
    if (Object.keys(rn).length) out.nodes = rn;

    return (out.nodes || out.global) ? out : undefined;
}

function toServiceIdArray(v: any): ServiceIdRef[] {
    if (!Array.isArray(v)) return [];
    return v
        .map(x => (typeof x === 'number' || typeof x === 'string') ? x : String(x))
        .filter(x => x !== '' && x !== null && x !== undefined) as ServiceIdRef[];
}