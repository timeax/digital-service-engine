import { cloneDeep } from "lodash-es";
import type { Field, ServiceIdRef, ServiceProps, Tag } from "@/schema";
import type {
    EditorModuleContext,
    EditorNodeLookup,
} from "./editor-types";
import { clearFieldButtonReceiverMaps, isActualButtonField, ownerOfOption } from "./editor-utils";

const RELATION_MAP_KEYS = [
    "includes_for_buttons",
    "excludes_for_buttons",
    "includes_for_options",
    "excludes_for_options",
] as const;

function stripDeletedIds(
    ids: readonly string[],
): { ordered: string[]; set: Set<string> } {
    const ordered = Array.from(new Set((ids ?? []).map((id) => String(id))));
    return { ordered, set: new Set(ordered) };
}

function cleanTagRelationsForDeleted(
    p: ServiceProps,
    deleted: Set<string>,
): void {
    for (const t of p.filters ?? []) {
        if (t.bind_id && deleted.has(String(t.bind_id))) delete t.bind_id;

        if (t.includes) {
            const next = t.includes.filter((x) => !deleted.has(String(x)));
            if (next.length) t.includes = next;
            else delete t.includes;
        }

        if (t.excludes) {
            const next = t.excludes.filter((x) => !deleted.has(String(x)));
            if (next.length) t.excludes = next;
            else delete t.excludes;
        }
    }
}

function cleanFieldBindsForDeleted(p: ServiceProps, deleted: Set<string>): void {
    for (const f of p.fields ?? []) {
        const bind = f.bind_id;
        if (!bind) continue;
        if (Array.isArray(bind)) {
            const next = bind.filter((x) => !deleted.has(String(x)));
            if (next.length) f.bind_id = next;
            else delete f.bind_id;
            continue;
        }
        if (deleted.has(String(bind))) delete f.bind_id;
    }
}

function cleanRelationMapsForDeleted(
    p: ServiceProps,
    deleted: Set<string>,
): void {
    for (const key of RELATION_MAP_KEYS) {
        const map = (p as any)[key] as Record<string, string[]> | undefined;
        if (!map) continue;

        for (const mapKey of Object.keys(map)) {
            if (deleted.has(String(mapKey))) {
                delete map[mapKey];
                continue;
            }

            const next = (map[mapKey] ?? []).filter(
                (item) => !deleted.has(String(item)),
            );
            if (next.length) map[mapKey] = next;
            else delete map[mapKey];
        }

        if (!Object.keys(map).length) delete (p as any)[key];
    }
}

function cleanOrderForTagsForDeleted(
    p: ServiceProps,
    deleted: Set<string>,
): void {
    const map = p.order_for_tags;
    if (!map) return;
    const fieldIds = new Set((p.fields ?? []).map((f) => String(f.id)));

    for (const key of Object.keys(map)) {
        if (deleted.has(String(key))) {
            delete map[key];
            continue;
        }
        const next = (map[key] ?? []).filter(
            (fid) => !deleted.has(String(fid)) && fieldIds.has(String(fid)),
        );
        if (next.length) map[key] = next;
        else delete map[key];
    }

    if (!Object.keys(map).length) delete p.order_for_tags;
}

function cleanNoticesForDeleted(p: ServiceProps, deleted: Set<string>): void {
    if (!p.notices?.length) return;
    p.notices = p.notices.filter((n) => {
        const target: any = n.target;
        if (!target || target.scope === "global") return true;
        if (target.scope === "node" && deleted.has(String(target.node_id))) {
            return false;
        }
        return true;
    });
    if (!p.notices.length) delete p.notices;
}

function applyDeleteCleanup(p: ServiceProps, deleted: Set<string>): void {
    cleanTagRelationsForDeleted(p, deleted);
    cleanFieldBindsForDeleted(p, deleted);
    cleanRelationMapsForDeleted(p, deleted);
    cleanOrderForTagsForDeleted(p, deleted);
    cleanNoticesForDeleted(p, deleted);
}

function removeOptionInPlace(p: ServiceProps, optionId: string): boolean {
    const owner = ownerOfOption(p, optionId);
    if (!owner) return false;
    const f = (p.fields ?? []).find((x) => x.id === owner.fieldId);
    if (!f?.options) return false;
    const before = f.options.length;
    f.options = f.options.filter((o) => o.id !== optionId);
    return f.options.length !== before;
}

function removeFieldInPlace(p: ServiceProps, fieldId: string): string[] {
    const field = (p.fields ?? []).find((f) => f.id === fieldId);
    if (!field) return [];
    const deleted = [fieldId, ...(field.options ?? []).map((o) => String(o.id))];
    const before = (p.fields ?? []).length;
    p.fields = (p.fields ?? []).filter((f) => f.id !== fieldId);
    clearFieldButtonReceiverMaps(p, fieldId);
    return (p.fields ?? []).length !== before ? deleted : [];
}

function removeTagInPlace(p: ServiceProps, tagId: string): boolean {
    const before = (p.filters ?? []).length;
    p.filters = (p.filters ?? []).filter((t) => t.id !== tagId);
    return (p.filters ?? []).length !== before;
}

export function reLabel(
    ctx: EditorModuleContext,
    id: string,
    nextLabel: string,
): void {
    const label = String(nextLabel ?? "").trim();

    ctx.exec({
        name: "reLabel",
        do: () =>
            ctx.patchProps((p) => {
                if (ctx.isTagId(id)) {
                    const t = (p.filters ?? []).find((x) => x.id === id);
                    if (!t) return;
                    if ((t.label ?? "") === label) return;
                    t.label = label;
                    ctx.api.refreshGraph();
                    return;
                }

                if (ctx.isOptionId(id)) {
                    const own = ownerOfOption(p, id);
                    if (!own) return;
                    const f = (p.fields ?? []).find((x) => x.id === own.fieldId);
                    const o = f?.options?.find((x) => x.id === id);
                    if (!o) return;
                    if ((o.label ?? "") === label) return;
                    o.label = label;
                    ctx.api.refreshGraph();
                    return;
                }

                const fld = (p.fields ?? []).find((x) => x.id === id);
                if (!fld) return;
                if ((fld.label ?? "") === label) return;
                fld.label = label;
                ctx.api.refreshGraph();
            }),
        undo: () => ctx.undo(),
    });
}

export function setFieldName(
    ctx: EditorModuleContext,
    fieldId: string,
    nextName: string | null | undefined,
): void {
    const raw = typeof nextName === "string" ? nextName : "";
    const name = raw.trim();

    ctx.exec({
        name: "setFieldName",
        do: () =>
            ctx.patchProps((p) => {
                const fields = p.fields ?? [];
                const f = fields.find((x) => x.id === fieldId);
                if (!f) {
                    ctx.api.emit("error", {
                        code: "field_not_found",
                        message: `Field not found: ${fieldId}`,
                        meta: { fieldId },
                    });
                    return;
                }

                const fieldHasService =
                    (typeof (f as any).service_id === "number" &&
                        Number.isFinite((f as any).service_id)) ||
                    (typeof (f as any).service_id === "string" &&
                        (f as any).service_id.trim().length > 0);
                const optionHasService = Array.isArray(f.options)
                    ? f.options.some(
                          (o) =>
                              (typeof (o as any).service_id === "number" &&
                                  Number.isFinite((o as any).service_id)) ||
                              (typeof (o as any).service_id === "string" &&
                                  (o as any).service_id.trim().length > 0),
                      )
                    : false;

                if (fieldHasService || optionHasService) {
                    ctx.api.emit("error", {
                        code: "field_has_service_mapping",
                        message:
                            "Cannot set a name on a field that maps to a service (either the field or one of its options has a service_id).",
                        meta: {
                            fieldId,
                            fieldHasService,
                            optionHasService,
                        },
                    });
                    return;
                }

                if (name.length === 0) {
                    if ("name" in f) delete (f as any).name;
                    return;
                }

                const collision = fields.find(
                    (x) => x.id !== fieldId && (x.name ?? "") === name,
                );
                if (collision) {
                    ctx.api.emit("error", {
                        code: "field_name_collision",
                        message: `Another field already uses the name "${name}".`,
                        meta: { fieldId, otherFieldId: collision.id },
                    });
                    return;
                }

                (f as any).name = name;
            }),
        undo: () => ctx.undo(),
    });
}

export function addOption(
    ctx: EditorModuleContext,
    fieldId: string,
    input: {
        id?: string;
        label: string;
        service_id?: ServiceIdRef;
        pricing_role?: "base" | "utility" | "addon";
        [k: string]: any;
    },
): string {
    const id = input.id ?? ctx.genId("o");

    ctx.exec({
        name: "addOption",
        do: () =>
            ctx.patchProps((p) => {
                const f = (p.fields ?? []).find((x) => x.id === fieldId);
                if (!f) throw new Error(`addOption: field '${fieldId}' not found`);
                const list = (f.options ??= []);
                if (list.some((o) => o.id === id)) {
                    throw new Error(`Option id '${id}' already exists`);
                }
                list.push({ ...input, id } as any);
            }),
        undo: () => ctx.undo(),
    });

    return id;
}

export function updateOption(
    ctx: EditorModuleContext,
    optionId: string,
    patch: Partial<
        {
            label: string;
            service_id: ServiceIdRef;
            pricing_role: "base" | "utility" | "addon";
        } & Record<string, any>
    >,
) {
    if (!ctx.isOptionId(optionId)) {
        throw new Error('updateOption: optionId must start with "o:"');
    }
    ctx.exec({
        name: "updateOption",
        do: () =>
            ctx.patchProps((p) => {
                const owner = ownerOfOption(p, optionId);
                if (!owner) return;
                const f = (p.fields ?? []).find((x) => x.id === owner.fieldId);
                if (!f?.options) return;
                const o = f.options.find((x) => x.id === optionId);
                if (o) Object.assign(o, patch);
            }),
        undo: () => ctx.undo(),
    });
}

export function removeOption(ctx: EditorModuleContext, optionId: string) {
    if (!ctx.isOptionId(optionId)) {
        throw new Error('removeOption: optionId must start with "o:"');
    }
    ctx.exec({
        name: "removeOption",
        do: () =>
            ctx.patchProps((p) => {
                const removed = removeOptionInPlace(p, optionId);
                if (!removed) return;
                applyDeleteCleanup(p, new Set([optionId]));
            }),
        undo: () => ctx.undo(),
    });
}

export function editLabel(ctx: EditorModuleContext, id: string, label: string): void {
    const next = (label ?? "").trim();
    if (!next) throw new Error("Label cannot be empty");

    ctx.exec({
        name: "editLabel",
        do: () =>
            ctx.patchProps((p) => {
                if (ctx.isTagId(id)) {
                    const t = (p.filters ?? []).find((x) => x.id === id);
                    if (t) t.label = next;
                    return;
                }
                if (ctx.isFieldId(id)) {
                    const f = (p.fields ?? []).find((x) => x.id === id);
                    if (f) f.label = next;
                    return;
                }
                if (ctx.isOptionId(id)) {
                    const own = ownerOfOption(p, id);
                    if (!own) return;
                    const f = (p.fields ?? []).find((x) => x.id === own.fieldId);
                    const o = f?.options?.find((x) => x.id === id);
                    if (o) o.label = next;
                    return;
                }
                throw new Error("editLabel: unsupported id");
            }),
        undo: () => ctx.undo(),
    });
}

export function editName(
    ctx: EditorModuleContext,
    fieldId: string,
    name: string | undefined,
) {
    ctx.exec({
        name: "editName",
        do: () =>
            ctx.patchProps((p) => {
                const f = (p.fields ?? []).find((x) => x.id === fieldId);
                if (!f) return;
                f.name = name;
            }),
        undo: () => ctx.undo(),
    });
}

export function setService(
    ctx: EditorModuleContext,
    id: string,
    input: { service_id?: ServiceIdRef; pricing_role?: "base" | "utility" },
): void {
    ctx.exec({
        name: "setService",
        do: () =>
            ctx.patchProps((p) => {
                const hasSidKey = Object.prototype.hasOwnProperty.call(
                    input,
                    "service_id",
                );
                const validId =
                    hasSidKey &&
                    ((typeof input.service_id === "number" &&
                        Number.isFinite(input.service_id)) ||
                        (typeof input.service_id === "string" &&
                            input.service_id.trim().length > 0));
                const sid: ServiceIdRef | undefined = validId
                    ? typeof input.service_id === "string"
                        ? input.service_id.trim()
                        : Number(input.service_id)
                    : undefined;
                const nextRole = input.pricing_role;

                if (ctx.isTagId(id)) {
                    const t = (p.filters ?? []).find((x) => x.id === id);
                    if (!t) return;
                    if (hasSidKey) {
                        if (sid === undefined) delete (t as any).service_id;
                        else t.service_id = sid;
                    }
                    return;
                }

                if (ctx.isOptionId(id)) {
                    const own = ownerOfOption(p, id);
                    if (!own) return;
                    const f = (p.fields ?? []).find((x) => x.id === own.fieldId);
                    const o = f?.options?.find((x) => x.id === id);
                    if (!o) return;

                    const currentRole = (o.pricing_role ?? "base") as
                        | "base"
                        | "utility";
                    const role = nextRole ?? currentRole;

                    if (role === "utility") {
                        if (hasSidKey && sid !== undefined) {
                            ctx.api.emit("error", {
                                message: "Utilities cannot have service_id (option).",
                                code: "utility_service_conflict",
                                meta: { id, service_id: sid },
                            });
                        }
                        o.pricing_role = "utility";
                        if ("service_id" in o) delete (o as any).service_id;
                        return;
                    }

                    if (nextRole) o.pricing_role = "base";
                    if (hasSidKey) {
                        if (sid === undefined) delete (o as any).service_id;
                        else o.service_id = sid;
                    }
                    return;
                }

                const f = (p.fields ?? []).find((x) => x.id === id);
                if (!f) {
                    throw new Error(
                        'setService only supports tag ("t:*"), option ("o:*"), or field ("f:*") ids',
                    );
                }

                const isOptionBased = Array.isArray(f.options) && f.options.length > 0;
                const isButton = !!(f as any).button;

                if (nextRole) {
                    f.pricing_role = nextRole;
                }
                const effectiveRole = (f.pricing_role ?? "base") as
                    | "base"
                    | "utility";

                if (isOptionBased) {
                    if (hasSidKey) {
                        ctx.api.emit("error", {
                            message:
                                "Cannot set service_id on an option-based field. Assign service_id on its options instead.",
                            code: "field_option_based_service_forbidden",
                            meta: { id, service_id: sid },
                        });
                    }
                    if ("service_id" in (f as any)) delete (f as any).service_id;
                    return;
                }

                if (!isButton) {
                    if (hasSidKey) {
                        ctx.api.emit("error", {
                            message:
                                "Only button fields (without options) can have a service_id.",
                            code: "non_button_field_service_forbidden",
                            meta: { id, service_id: sid },
                        });
                    }
                    if ("service_id" in (f as any)) delete (f as any).service_id;
                    return;
                }

                if (effectiveRole === "utility") {
                    if (hasSidKey && sid !== undefined) {
                        ctx.api.emit("error", {
                            message: "Utilities cannot have service_id (field).",
                            code: "utility_service_conflict",
                            meta: { id, service_id: sid },
                        });
                    }
                    if ("service_id" in (f as any)) delete (f as any).service_id;
                    return;
                }

                if (hasSidKey) {
                    if (sid === undefined) delete (f as any).service_id;
                    else (f as any).service_id = sid;
                }
            }),
        undo: () => ctx.undo(),
    });
}

export function addTag(
    ctx: EditorModuleContext,
    partial: Omit<Tag, "id" | "label"> & { id?: string; label: string },
) {
    const id = partial.id ?? ctx.genId("t");
    const payload = { ...partial, id };
    ctx.exec({
        name: "addTag",
        do: () =>
            ctx.patchProps((p) => {
                p.filters = [...(p.filters ?? []), payload];
            }),
        undo: () =>
            ctx.patchProps((p) => {
                p.filters = (p.filters ?? []).filter((t) => t.id !== id);
            }),
    });
}

export function updateTag(
    ctx: EditorModuleContext,
    id: string,
    patch: Partial<Tag>,
) {
    let prev: Tag | undefined;
    ctx.exec({
        name: "updateTag",
        do: () =>
            ctx.patchProps((p) => {
                p.filters = (p.filters ?? []).map((t) => {
                    if (t.id !== id) return t;
                    prev = t;
                    return { ...t, ...patch };
                });
            }),
        undo: () =>
            ctx.patchProps((p) => {
                p.filters = (p.filters ?? []).map((t) =>
                    t.id === id && prev ? prev : t,
                );
            }),
    });
}

export function removeTag(ctx: EditorModuleContext, id: string) {
    let prevSlice!: ServiceProps;
    ctx.exec({
        name: "removeTag",
        do: () =>
            ctx.patchProps((p) => {
                prevSlice = cloneDeep(p);
                const removed = removeTagInPlace(p, id);
                if (!removed) return;
                applyDeleteCleanup(p, new Set([id]));
            }),
        undo: () => ctx.replaceProps(prevSlice),
    });
}

export function addField(
    ctx: EditorModuleContext,
    partial: Omit<Field, "id" | "label" | "type"> & {
        id?: string;
        label: string;
        type: Field["type"];
    },
) {
    const id = partial.id ?? ctx.genId("f");
    const payload = { ...partial, id };
    ctx.exec({
        name: "addField",
        do: () =>
            ctx.patchProps((p) => {
                p.fields = [...(p.fields ?? []), payload as Field];
            }),
        undo: () =>
            ctx.patchProps((p) => {
                p.fields = (p.fields ?? []).filter((f) => f.id !== id);
            }),
    });
}

export function updateField(
    ctx: EditorModuleContext,
    id: string,
    patch: Partial<Field>,
) {
    let prev: Field | undefined;
    let prevIncludesForButton: string[] | undefined;
    let prevExcludesForButton: string[] | undefined;
    ctx.exec({
        name: "updateField",
        do: () =>
            ctx.patchProps((p) => {
                prevIncludesForButton = p.includes_for_buttons?.[id]
                    ? [...(p.includes_for_buttons?.[id] ?? [])]
                    : undefined;
                prevExcludesForButton = p.excludes_for_buttons?.[id]
                    ? [...(p.excludes_for_buttons?.[id] ?? [])]
                    : undefined;

                p.fields = (p.fields ?? []).map((f) => {
                    if (f.id !== id) return f;
                    prev = cloneDeep(f);
                    const nextField = { ...f, ...patch } as Field;
                    if (!isActualButtonField(nextField)) {
                        clearFieldButtonReceiverMaps(p, id);
                    }
                    return nextField;
                });
            }),
        undo: () =>
            ctx.patchProps((p) => {
                p.fields = (p.fields ?? []).map((f) =>
                    f.id === id && prev ? prev : f,
                );
                if (prevIncludesForButton) {
                    p.includes_for_buttons = {
                        ...(p.includes_for_buttons ?? {}),
                        [id]: [...prevIncludesForButton],
                    };
                } else {
                    clearFieldButtonReceiverMaps(p, id);
                }
                if (prevExcludesForButton) {
                    p.excludes_for_buttons = {
                        ...(p.excludes_for_buttons ?? {}),
                        [id]: [...prevExcludesForButton],
                    };
                }
            }),
    });
}

export function removeField(ctx: EditorModuleContext, id: string) {
    let prevSlice!: ServiceProps;
    ctx.exec({
        name: "removeField",
        do: () =>
            ctx.patchProps((p) => {
                prevSlice = cloneDeep(p);
                const removedIds = removeFieldInPlace(p, id);
                if (!removedIds.length) return;
                applyDeleteCleanup(p, new Set(removedIds));
            }),
        undo: () => ctx.replaceProps(prevSlice),
    });
}

export function remove(ctx: EditorModuleContext, id: string) {
    const key = String(id);
    if (ctx.isTagId(id)) {
        ctx.exec({
            name: "removeTag",
            do: () =>
                ctx.patchProps((p) => {
                    const removed = removeTagInPlace(p, key);
                    if (!removed) return;
                    applyDeleteCleanup(p, new Set([key]));
                }),
            undo: () => ctx.undo(),
        });
        return;
    }

    if (ctx.isFieldId(id)) {
        ctx.exec({
            name: "removeField",
            do: () =>
                ctx.patchProps((p) => {
                    const removedIds = removeFieldInPlace(p, key);
                    if (!removedIds.length) return;
                    applyDeleteCleanup(p, new Set(removedIds));
                }),
            undo: () => ctx.undo(),
        });
        return;
    }

    if (ctx.isOptionId(id)) {
        ctx.exec({
            name: "removeOption",
            do: () =>
                ctx.patchProps((p) => {
                    const removed = removeOptionInPlace(p, key);
                    if (!removed) return;
                    applyDeleteCleanup(p, new Set([key]));
                }),
            undo: () => ctx.undo(),
        });
        return;
    }

    throw new Error("remove: unknown id prefix");
}

export function removeMany(ctx: EditorModuleContext, ids: readonly string[]): void {
    const { ordered } = stripDeletedIds(ids);
    if (!ordered.length) return;

    ctx.transact("removeMany", () => {
        ctx.patchProps((p) => {
            const existingFieldIds = new Set((p.fields ?? []).map((f) => String(f.id)));
            const existingTagIds = new Set((p.filters ?? []).map((t) => String(t.id)));
            const existingOptionIds = new Set(
                (p.fields ?? []).flatMap((f) => (f.options ?? []).map((o) => String(o.id))),
            );

            const fieldIds = ordered.filter((id) => ctx.isFieldId(id) && existingFieldIds.has(id));
            const fieldIdSet = new Set(fieldIds);
            const tagIds = ordered.filter((id) => ctx.isTagId(id) && existingTagIds.has(id));
            const optionIds = ordered.filter((id) => {
                if (!ctx.isOptionId(id) || !existingOptionIds.has(id)) return false;
                const owner = ownerOfOption(p, id);
                if (!owner) return false;
                return !fieldIdSet.has(String(owner.fieldId));
            });

            const deleted = new Set<string>();

            for (const optionId of optionIds) {
                if (removeOptionInPlace(p, optionId)) deleted.add(optionId);
            }
            for (const fieldId of fieldIds) {
                const removedIds = removeFieldInPlace(p, fieldId);
                for (const rid of removedIds) deleted.add(rid);
            }
            for (const tagId of tagIds) {
                if (removeTagInPlace(p, tagId)) deleted.add(tagId);
            }

            if (!deleted.size) return;
            applyDeleteCleanup(p, deleted);
        });
    });
}

export function getNode(ctx: EditorModuleContext, id: string): EditorNodeLookup {
    const props = ctx.getProps();
    if (ctx.isTagId(id)) {
        const t = (props.filters ?? []).find((x) => x.id === id);
        return {
            kind: "tag",
            data: t,
            owners: { parentTagId: t?.bind_id },
        };
    }
    if (ctx.isFieldId(id)) {
        const f = (props.fields ?? []).find((x) => x.id === id);
        const bind = Array.isArray(f?.bind_id)
            ? (f!.bind_id as string[])
            : f?.bind_id
              ? [f.bind_id]
              : [];
        return { kind: "field", data: f, owners: { bindTagIds: bind } };
    }
    if (ctx.isOptionId(id)) {
        const own = ownerOfOption(props, id);
        const f = own ? (props.fields ?? []).find((x) => x.id === own.fieldId) : undefined;
        const o = f?.options?.find((x) => x.id === id);
        return {
            kind: "option",
            data: o,
            owners: { fieldId: own?.fieldId },
        };
    }
    return { kind: "option", data: undefined, owners: {} };
}
