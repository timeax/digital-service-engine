import type { FieldOption, OptionEffectForButton, ServiceProps, Tag } from "@/schema";
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
import { findMutableOption } from "./editor-utils";

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
        if (findMutableOption({ ...props, fields: [field] }, optionId)) {
            return { fieldId: field.id };
        }
    }
    return null;
}

function cloneOptionTree(
    ctx: EditorModuleContext,
    fieldId: string,
    option: FieldOption,
    opts: DuplicateOptions,
    optionIdMap: Map<string, string>,
): FieldOption {
    const newId = ctx.uniqueOptionId(
        fieldId,
        (opts.optionIdStrategy ?? defaultOptionIdStrategy)(option.id),
    );
    optionIdMap.set(option.id, newId);
    const children = option.children?.map((child) =>
        cloneOptionTree(ctx, fieldId, child, opts, optionIdMap),
    );
    return {
        ...option,
        id: newId,
        label: (opts.labelStrategy ?? nextCopyLabel)(option.label ?? option.id),
        ...(children?.length ? { children } : {}),
    };
}

function remapEffect(
    effect: OptionEffectForButton,
    optionIdMap: Map<string, string>,
): OptionEffectForButton {
    const remapList = (values: string[] | undefined) =>
        values?.map((value) => optionIdMap.get(value) ?? value);
    return {
        ...effect,
        ...(effect.include ? { include: remapList(effect.include) } : {}),
        ...(effect.exclude ? { exclude: remapList(effect.exclude) } : {}),
    };
}

function copyOptionEffects(
    props: ServiceProps,
    args: {
        triggerIdMap?: Map<string, string>;
        targetFieldIdMap?: Map<string, string>;
        optionIdMap?: Map<string, string>;
    },
): void {
    const source = props.option_effects_for_buttons;
    if (!source) return;

    const next: NonNullable<ServiceProps["option_effects_for_buttons"]> = {
        ...source,
    };
    const triggerIdMap = args.triggerIdMap ?? new Map<string, string>();
    const targetFieldIdMap = args.targetFieldIdMap ?? new Map<string, string>();
    const optionIdMap = args.optionIdMap ?? new Map<string, string>();

    for (const [oldTriggerId, targetMap] of Object.entries(source)) {
        const newTriggerId = triggerIdMap.get(oldTriggerId);
        if (!newTriggerId) continue;

        const copiedTargets: Record<string, OptionEffectForButton> = {
            ...(next[newTriggerId] ?? {}),
        };
        for (const [oldTargetFieldId, effect] of Object.entries(targetMap ?? {})) {
            const newTargetFieldId =
                targetFieldIdMap.get(oldTargetFieldId) ?? oldTargetFieldId;
            copiedTargets[newTargetFieldId] = remapEffect(effect, optionIdMap);
        }
        next[newTriggerId] = copiedTargets;
    }

    props.option_effects_for_buttons = next;
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

    const optionIdMap = new Map<string, string>();
    const clonedOptions = (src.options ?? []).map((o) =>
        cloneOptionTree(ctx, id, o, opts, optionIdMap),
    );

    const cloned = {
        ...src,
        id,
        label,
        name,
        bind_id: (opts.copyBindings ?? true) ? src.bind_id : undefined,
        options: clonedOptions,
    } as typeof src;

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

            copyOptionEffects(p, {
                triggerIdMap: new Map<string, string>([
                    [fieldId, id],
                    ...Array.from(optionIdMap.entries()),
                ]),
                targetFieldIdMap: new Map([[fieldId, id]]),
                optionIdMap,
            });
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
    const location = findMutableOption(props, optionId);
    if (!location || location.field.id !== fieldId) {
        throw new Error(`Option not found: ${fieldId}/${optionId}`);
    }
    const src = location.option;
    const optionIdMap = new Map<string, string>();
    const clone = cloneOptionTree(ctx, fieldId, src, opts, optionIdMap);
    const newId = clone.id;

    ctx.patchProps((p) => {
        const current = findMutableOption(p, optionId);
        if (!current) return;
        current.siblings.splice(current.index + 1, 0, clone);

        if (opts.copyOptionMaps) {
            for (const mapKey of [
                "includes_for_buttons",
                "excludes_for_buttons",
            ] as const) {
                const m = p[mapKey] ?? {};
                for (const [oldKey, newKey] of optionIdMap.entries()) {
                    if (m[oldKey]) {
                        m[newKey] = Array.from(new Set(m[oldKey]));
                        p[mapKey] = m as any;
                    }
                }
            }

            copyOptionEffects(p, {
                triggerIdMap: optionIdMap,
                optionIdMap,
            });
        }
    });

    return newId;
}
