import type { ServiceProps, Tag } from "@/schema";
import type {
    DuplicateManyOptions,
    DuplicateOptions,
    EditorModuleContext,
    NodeRef,
} from "./editor-types";
import {
    defaultOptionIdStrategy,
    nextCopyLabel,
    nextCopyName,
} from "./editor-ids";

export function duplicate(
    ctx: EditorModuleContext,
    ref: NodeRef,
    opts: DuplicateOptions = {},
): string {
    const snapBefore = ctx.makeSnapshot("duplicate:before");
    try {
        let newId = "";
        ctx.transact("duplicate", () => {
            newId = duplicateInPlace(ctx, ref, opts);
        });
        return newId;
    } catch (err) {
        ctx.loadSnapshot(snapBefore, "undo");
        throw err;
    }
}

export function duplicateMany(
    ctx: EditorModuleContext,
    ids: readonly string[],
    opts: DuplicateManyOptions = {},
): string[] {
    const ordered = Array.from(new Set((ids ?? []).map((id) => String(id))));
    if (!ordered.length) return [];

    const snapBefore = ctx.makeSnapshot("duplicateMany:before");
    try {
        const created: string[] = [];
        ctx.transact("duplicateMany", () => {
            const props = ctx.getProps();
            const selectedFields = new Set<string>();
            for (const id of ordered) {
                if (ctx.isFieldId(id) && (props.fields ?? []).some((f) => f.id === id)) {
                    selectedFields.add(id);
                }
            }

            for (const id of ordered) {
                if (ctx.isTagId(id)) {
                    if (!(ctx.getProps().filters ?? []).some((t) => t.id === id)) continue;
                    created.push(
                        duplicateInPlace(ctx, { kind: "tag", id }, opts as DuplicateOptions),
                    );
                    continue;
                }

                if (ctx.isFieldId(id)) {
                    if (!(ctx.getProps().fields ?? []).some((f) => f.id === id)) continue;
                    created.push(
                        duplicateInPlace(ctx, { kind: "field", id }, opts as DuplicateOptions),
                    );
                    continue;
                }

                if (ctx.isOptionId(id)) {
                    const owner = ownerFieldOfOption(ctx.getProps(), id);
                    if (!owner) continue;
                    if (selectedFields.has(owner.fieldId)) continue;
                    created.push(
                        duplicateInPlace(
                            ctx,
                            { kind: "option", fieldId: owner.fieldId, id },
                            opts as DuplicateOptions,
                        ),
                    );
                }
            }
        });
        return created;
    } catch (err) {
        ctx.loadSnapshot(snapBefore, "undo");
        throw err;
    }
}

function duplicateInPlace(
    ctx: EditorModuleContext,
    ref: NodeRef,
    opts: DuplicateOptions = {},
): string {
    if (ref.kind === "tag") {
        return duplicateTag(ctx, ref.id, opts);
    }
    if (ref.kind === "field") {
        return duplicateField(ctx, ref.id, opts);
    }
    return duplicateOption(ctx, ref.fieldId, ref.id, opts);
}

function ownerFieldOfOption(
    props: ServiceProps,
    optionId: string,
): { fieldId: string } | null {
    for (const field of props.fields ?? []) {
        if ((field.options ?? []).some((o) => o.id === optionId)) {
            return { fieldId: field.id };
        }
    }
    return null;
}

export function duplicateTag(
    ctx: EditorModuleContext,
    tagId: string,
    opts: DuplicateOptions,
): string {
    const props = ctx.getProps();
    const tags = props.filters ?? [];
    const src = tags.find((t) => t.id === tagId);
    if (!src) throw new Error(`Tag not found: ${tagId}`);

    const id = opts.id ?? ctx.uniqueId(src.id);
    const label = (opts.labelStrategy ?? nextCopyLabel)(src.label ?? id);

    if (!opts.withChildren) {
        ctx.patchProps((p) => {
            const clone = { ...src, id, label };
            clone.bind_id = src.bind_id;
            clone.constraints_overrides = undefined;
            clone.constraints_origin = undefined;
            const arr = p.filters ?? [];
            const idx = arr.findIndex((t) => t.id === tagId);
            arr.splice(idx + 1, 0, clone);
            p.filters = arr;
        });
        return id;
    }

    const idMap = new Map<string, string>();
    const collect = (t: typeof src, acc: (typeof src)[]) => {
        acc.push(t);
        for (const child of tags.filter((x) => x.bind_id === t.id)) {
            collect(child as any, acc);
        }
    };
    const subtree: (typeof src)[] = [];
    collect(src, subtree);

    for (const n of subtree) {
        idMap.set(n.id, n.id === src.id ? id : ctx.uniqueId(n.id));
    }

    const clones = subtree.map((n) => {
        const cloned = { ...n };
        cloned.id = idMap.get(n.id)!;
        cloned.label =
            n.id === src.id
                ? label
                : (opts.labelStrategy ?? nextCopyLabel)(n.label ?? n.id);
        cloned.bind_id = n.bind_id ? (idMap.get(n.bind_id) ?? n.bind_id) : undefined;
        cloned.constraints_origin = undefined;
        cloned.constraints_overrides = undefined;
        return cloned;
    });

    ctx.patchProps((p) => {
        const arr = p.filters ?? [];
        const rootIdx = arr.findIndex((t) => t.id === tagId);
        arr.splice(rootIdx + 1, 0, clones[0] as any);
        for (const c of clones.slice(1)) arr.push(c as any);
        p.filters = arr;
    });

    return id;
}

export function duplicateField(
    ctx: EditorModuleContext,
    fieldId: string,
    opts: DuplicateOptions,
): string {
    const props = ctx.getProps();
    const fields = props.fields ?? [];
    const src = fields.find((f) => f.id === fieldId);
    if (!src) throw new Error(`Field not found: ${fieldId}`);

    const id = opts.id ?? ctx.uniqueId(src.id);
    const label = (opts.labelStrategy ?? nextCopyLabel)(src.label ?? id);
    const name = opts.nameStrategy
        ? opts.nameStrategy(src.name)
        : nextCopyName(src.name);

    const optId = (old: string) =>
        ctx.uniqueOptionId(
            id,
            (opts.optionIdStrategy ?? defaultOptionIdStrategy)(old),
        );

    const clonedOptions = (src.options ?? []).map((o) => ({
        ...o,
        id: optId(o.id),
        label: (opts.labelStrategy ?? nextCopyLabel)(o.label ?? o.id),
    }));

    const cloned = {
        ...src,
        id,
        label,
        name,
        bind_id: (opts.copyBindings ?? true) ? src.bind_id : undefined,
        options: clonedOptions,
    } as typeof src;

    const optionIdMap = new Map<string, string>();
    (src.options ?? []).forEach((o, i) => {
        const newOptId = clonedOptions[i]?.id ?? o.id;
        optionIdMap.set(o.id, newOptId);
    });

    ctx.patchProps((p) => {
        const arr = p.fields ?? [];
        const idx = arr.findIndex((f) => f.id === fieldId);
        arr.splice(idx + 1, 0, cloned as any);
        p.fields = arr;

        if (opts.copyIncludesExcludes) {
            for (const t of p.filters ?? []) {
                if (t.includes?.includes(fieldId)) {
                    const s = new Set(t.includes);
                    s.add(id);
                    t.includes = Array.from(s);
                }
                if (t.excludes?.includes(fieldId)) {
                    const s = new Set(t.excludes);
                    s.add(id);
                    t.excludes = Array.from(s);
                }
            }
        }

        if (opts.copyOptionMaps) {
            const maps: Array<"includes_for_buttons" | "excludes_for_buttons"> = [
                "includes_for_buttons",
                "excludes_for_buttons",
            ];

            for (const mapKey of maps) {
                const srcMap = (p as any)[mapKey] ?? {};
                const nextMap: Record<string, string[]> = { ...srcMap };

                for (const [key, targets] of Object.entries(
                    srcMap as Record<string, string[]>,
                )) {
                    if (key === fieldId) {
                        const newKey = id;
                        const merged = new Set([...(nextMap[newKey] ?? []), ...targets]);
                        nextMap[newKey] = Array.from(merged);
                        continue;
                    }

                    if (optionIdMap.has(key)) {
                        const newKey = optionIdMap.get(key)!;
                        const merged = new Set([...(nextMap[newKey] ?? []), ...targets]);
                        nextMap[newKey] = Array.from(merged);
                    }
                }

                (p as any)[mapKey] = nextMap;
            }
        }
    });

    return id;
}

export function duplicateOption(
    ctx: EditorModuleContext,
    fieldId: string,
    optionId: string,
    opts: DuplicateOptions,
): string {
    const props = ctx.getProps();
    const fields = props.fields ?? [];
    const f = fields.find((x) => x.id === fieldId);
    if (!f) throw new Error(`Field not found: ${fieldId}`);
    const optIdx = (f.options ?? []).findIndex((o) => o.id === optionId);
    if (optIdx < 0) {
        throw new Error(`Option not found: ${fieldId}::${optionId}`);
    }
    const src = (f.options ?? [])[optIdx];

    const newId = ctx.uniqueOptionId(
        fieldId,
        (opts.optionIdStrategy ?? defaultOptionIdStrategy)(src.id),
    );
    const newLabel = (opts.labelStrategy ?? nextCopyLabel)(src.label ?? src.id);

    ctx.patchProps((p) => {
        const fld = (p.fields ?? []).find((x) => x.id === fieldId)!;
        const arr = fld.options ?? [];
        const clone = { ...src, id: newId, label: newLabel };
        arr.splice(optIdx + 1, 0, clone);
        fld.options = arr;

        if (opts.copyOptionMaps) {
            const oldKey = `${fieldId}::${optionId}`;
            const newKey = `${fieldId}::${newId}`;
            for (const mapKey of [
                "includes_for_buttons",
                "excludes_for_buttons",
            ] as const) {
                const m = p[mapKey] ?? {};
                if (m[oldKey]) {
                    m[newKey] = Array.from(new Set(m[oldKey]));
                    p[mapKey] = m as any;
                }
            }
        }
    });

    return newId;
}
