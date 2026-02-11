// src/utils/service-props-id.ts
import type { ServiceProps } from "@/schema";

type ServicePropsIdOptions = {
    /** If true, array order does NOT matter (arrays will be sorted by stable string form). */
    orderInsensitiveArrays?: boolean;

    /** Keys to remove anywhere in the object tree (e.g. ["schema_version"] or ["meta"]). */
    dropKeys?: string[];

    /** Optional prefix for readability, e.g. "sp" */
    prefix?: string;

    /** Hash output length. 10–16 is usually enough. */
    hashLen?: number;
};

function isPlainObject(x: any): x is Record<string, any> {
    return !!x && typeof x === "object" && !Array.isArray(x);
}

function stableStringify(value: any): string {
    // value is assumed canonical already; this stays stable.
    return JSON.stringify(value);
}

function canonicalize(value: any, opts: Required<ServicePropsIdOptions>): any {
    if (value === undefined) return undefined;
    if (value === null) return null;

    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") return value;

    // Normalize Dates (just in case)
    if (value instanceof Date) return value.toISOString();

    if (Array.isArray(value)) {
        const items = value
            .map((v) => canonicalize(v, opts))
            .filter((v) => v !== undefined);

        if (!opts.orderInsensitiveArrays) return items;

        // Order-insensitive: sort by stable string form
        return items
            .map((v) => ({ v, k: stableStringify(v) }))
            .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
            .map((x) => x.v);
    }

    if (isPlainObject(value)) {
        const out: Record<string, any> = {};
        const keys = Object.keys(value)
            .filter((k) => !opts.dropKeys.includes(k))
            .sort();

        for (const k of keys) {
            const v = canonicalize(value[k], opts);
            if (v !== undefined) out[k] = v;
        }
        return out;
    }

    // Fallback for odd types (Map/Set/etc). Convert to string deterministically.
    try {
        return String(value);
    } catch {
        return Object.prototype.toString.call(value);
    }
}

// FNV-1a 32-bit hash (fast, deterministic, plenty good for caching keys)
function fnv1a32(str: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        // h *= 16777619 (with overflow)
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    // base36 keeps it short
    return h.toString(36);
}

/**
 * Deterministic ID for ServiceProps based on structural content.
 */
export function servicePropsId(
    props: ServiceProps,
    options: ServicePropsIdOptions = {},
): string {
    const opts: Required<ServicePropsIdOptions> = {
        orderInsensitiveArrays: options.orderInsensitiveArrays ?? false,
        dropKeys: options.dropKeys ?? [],
        prefix: options.prefix ?? "sp",
        hashLen: options.hashLen ?? 12,
    };

    const canonical = canonicalize(props, opts);
    const payload = stableStringify(canonical);

    // Optionally: mix 2 hashes for fewer collisions with tiny cost
    const h1 = fnv1a32(payload);
    const h2 = fnv1a32(payload.split("").reverse().join(""));
    const hash = (h1 + h2).slice(0, opts.hashLen);

    return `${opts.prefix}_${hash}`;
}
