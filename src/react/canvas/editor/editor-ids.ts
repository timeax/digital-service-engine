import type { EditorModuleContext } from "./editor-types";

export function uniqueId(ctx: EditorModuleContext, base: string): string {
    const props = ctx.getProps();
    const taken = new Set<string>([
        ...(props.filters ?? []).map((t) => t.id),
        ...(props.fields ?? []).map((f) => f.id),
    ]);
    let candidate = nextCopyId(base);
    while (taken.has(candidate)) candidate = bumpSuffix(candidate);
    return candidate;
}

export function uniqueOptionId(
    ctx: EditorModuleContext,
    fieldId: string,
    base: string,
): string {
    const props = ctx.getProps();
    const fld = (props.fields ?? []).find((f) => f.id === fieldId);
    const taken = new Set((fld?.options ?? []).map((o) => o.id));
    let candidate = base;
    if (taken.has(candidate)) candidate = nextCopyId(candidate);
    while (taken.has(candidate)) candidate = bumpSuffix(candidate);
    return candidate;
}

export function genId(
    ctx: EditorModuleContext,
    prefix: "t" | "f" | "o",
): string {
    const props = ctx.getProps();
    const taken = new Set<string>([
        ...(props.filters ?? []).map((t) => t.id),
        ...(props.fields ?? []).map((f) => f.id),
        ...(props.fields ?? []).flatMap((f) => f.options?.map((o) => o.id) ?? []),
    ]);
    for (let i = 1; i < 10_000; i++) {
        const id = `${prefix}:${i}`;
        if (!taken.has(id)) return id;
    }
    throw new Error("Unable to generate id");
}

export function nextCopyLabel(old: string): string {
    const m = old.match(/^(.*?)(?:\s*\(copy(?:\s+(\d+))?\))$/i);
    if (!m) return `${old} (copy)`;
    const stem = m[1].trim();
    const n = m[2] ? parseInt(m[2], 10) + 1 : 2;
    return `${stem} (copy ${n})`;
}

export function nextCopyName(old?: string): string | undefined {
    if (!old) return undefined;
    const m = old.match(/^(.*?)(_copy(\d+)?)$/i);
    if (!m) return `${old}_copy`;
    const stem = m[1];
    const n = m[3] ? parseInt(m[3], 10) + 1 : 2;
    return `${stem}_copy${n}`;
}

export function defaultOptionIdStrategy(old: string): string {
    return nextCopyId(old);
}

export function nextCopyId(old: string): string {
    const m = old.match(/^(.*?)(?:_copy(\d+)?)$/i);
    if (!m) return `${old}_copy`;
    const stem = m[1];
    const n = m[2] ? parseInt(m[2], 10) + 1 : 2;
    return `${stem}_copy${n}`;
}

export function bumpSuffix(old: string): string {
    const m = old.match(/^(.*?)(\d+)$/);
    if (!m) return `${old}2`;
    const stem = m[1];
    return `${stem}${parseInt(m[2], 10) + 1}`;
}
