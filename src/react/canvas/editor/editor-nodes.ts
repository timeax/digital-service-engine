import { cloneDeep } from "lodash-es";
import type { Field, ServiceProps, Tag } from "@/schema";
import type {
    EditorModuleContext,
    EditorNodeLookup,
} from "./editor-types";
import { clearFieldButtonReceiverMaps, isActualButtonField, ownerOfOption } from "./editor-utils";

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
        undo: () => ctx.api.undo(),
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

                const fieldHasService = typeof (f as any).service_id === "number";
                const optionHasService = Array.isArray(f.options)
                    ? f.options.some((o) => typeof (o as any).service_id === "number")
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
        undo: () => ctx.api.undo(),
    });
}

export function addOption(
    ctx: EditorModuleContext,
    fieldId: string,
    input: {
        id?: string;
        label: string;
        service_id?: number;
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
        undo: () => ctx.api.undo(),
    });

    return id;
}

export function updateOption(
    ctx: EditorModuleContext,
    optionId: string,
    patch: Partial<
        {
            label: string;
            service_id: number;
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
        undo: () => ctx.api.undo(),
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
                const owner = ownerOfOption(p, optionId);
                if (!owner) return;
                const f = (p.fields ?? []).find((x) => x.id === owner.fieldId);
                if (!f?.options) return;
                f.options = f.options.filter((o) => o.id !== optionId);

                const maps: Array<"includes_for_options" | "excludes_for_options"> = [
                    "includes_for_options",
                    "excludes_for_options",
                ];
                for (const m of maps) {
                    const map = (p as any)[m] as Record<string, string[]> | undefined;
                    if (!map) continue;
                    if (map[optionId]) delete map[optionId];
                    if (!Object.keys(map).length) delete (p as any)[m];
                }
            }),
        undo: () => ctx.api.undo(),
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
        undo: () => ctx.api.undo(),
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
        undo: () => ctx.api.undo(),
    });
}

export function setService(
    ctx: EditorModuleContext,
    id: string,
    input: { service_id?: number; pricing_role?: "base" | "utility" },
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
                    typeof input.service_id === "number" &&
                    Number.isFinite(input.service_id);
                const sid: number | undefined = validId
                    ? Number(input.service_id)
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
        undo: () => ctx.api.undo(),
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
                p.filters = (p.filters ?? []).filter((t) => t.id !== id);
                for (const t of p.filters ?? []) {
                    if (t.bind_id === id) delete t.bind_id;
                    t.includes = (t.includes ?? []).filter((x) => x !== id);
                    t.excludes = (t.excludes ?? []).filter((x) => x !== id);
                }
                for (const f of p.fields ?? []) {
                    if (Array.isArray(f.bind_id)) {
                        f.bind_id = f.bind_id.filter((x) => x !== id);
                    } else if (f.bind_id === id) {
                        delete f.bind_id;
                    }
                }
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
                p.fields = (p.fields ?? []).filter((f) => f.id !== id);
                clearFieldButtonReceiverMaps(p, id);
                for (const mapKey of [
                    "includes_for_buttons",
                    "excludes_for_buttons",
                ] as const) {
                    const m = p[mapKey];
                    if (!m) continue;
                    for (const k of Object.keys(m)) {
                        m[k] = (m[k] ?? []).filter((fid) => fid !== id);
                        if (!m[k]?.length) delete m[k];
                    }
                }
                for (const t of p.filters ?? []) {
                    t.includes = (t.includes ?? []).filter((x) => x !== id);
                    t.excludes = (t.excludes ?? []).filter((x) => x !== id);
                }
            }),
        undo: () => ctx.replaceProps(prevSlice),
    });
}

export function remove(ctx: EditorModuleContext, id: string) {
    if (ctx.isTagId(id)) {
        ctx.exec({
            name: "removeTag",
            do: () =>
                ctx.patchProps((p) => {
                    p.filters = (p.filters ?? []).filter((t) => t.id !== id);

                    for (const t of p.filters ?? []) {
                        if (t.bind_id === id) delete t.bind_id;
                        t.includes = (t.includes ?? []).filter((x) => x !== id);
                        t.excludes = (t.excludes ?? []).filter((x) => x !== id);
                    }

                    for (const f of p.fields ?? []) {
                        if (Array.isArray(f.bind_id)) {
                            f.bind_id = f.bind_id.filter((x) => x !== id) as any;
                        } else if (f.bind_id === id) {
                            delete f.bind_id;
                        }
                    }

                    if (p.order_for_tags?.[id]) delete p.order_for_tags[id];
                    for (const k of Object.keys(p.order_for_tags ?? {})) {
                        p.order_for_tags![k] = (p.order_for_tags![k] ?? []).filter(
                            (fid) => (p.fields ?? []).some((f) => f.id === fid),
                        );
                        if (!p.order_for_tags![k].length) delete p.order_for_tags![k];
                    }
                }),
            undo: () => ctx.api.undo(),
        });
        return;
    }

    if (ctx.isFieldId(id)) {
        ctx.exec({
            name: "removeField",
            do: () =>
                ctx.patchProps((p) => {
                    p.fields = (p.fields ?? []).filter((f) => f.id !== id);

                    for (const t of p.filters ?? []) {
                        t.includes = (t.includes ?? []).filter((x) => x !== id);
                        t.excludes = (t.excludes ?? []).filter((x) => x !== id);
                    }

                    for (const k of Object.keys(p.order_for_tags ?? {})) {
                        p.order_for_tags![k] = (p.order_for_tags![k] ?? []).filter(
                            (fid) => fid !== id,
                        );
                        if (!p.order_for_tags![k].length) delete p.order_for_tags![k];
                    }

                    const maps: Array<"includes_for_options" | "excludes_for_options"> = [
                        "includes_for_options",
                        "excludes_for_options",
                    ];
                    for (const m of maps) {
                        const map = (p as any)[m] as Record<string, string[]> | undefined;
                        if (!map) continue;
                        for (const key of Object.keys(map)) {
                            map[key] = (map[key] ?? []).filter((fid) => fid !== id);
                            if (!map[key]?.length) delete map[key];
                        }
                        if (!Object.keys(map).length) delete (p as any)[m];
                    }
                }),
            undo: () => ctx.api.undo(),
        });
        return;
    }

    if (ctx.isOptionId(id)) {
        removeOption(ctx, id);
        return;
    }

    throw new Error("remove: unknown id prefix");
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
