import type { ServiceProps } from "@/schema";
import type { EditorModuleContext, WireKind } from "./editor-types";
import { ensureServiceExists, isActualButtonField } from "./editor-utils";

export function wouldCreateTagCycle(
    _ctx: EditorModuleContext,
    p: ServiceProps,
    parentId: string,
    childId: string,
): boolean {
    if (parentId === childId) return true;
    const tagById = new Map((p.filters ?? []).map((t) => [t.id, t]));
    let cur: string | undefined = parentId;
    const guard = new Set<string>();
    while (cur) {
        if (cur === childId) return true;
        if (guard.has(cur)) break;
        guard.add(cur);
        cur = tagById.get(cur)?.bind_id;
    }
    return false;
}

export function wouldCreateIncludeExcludeCycle(
    ctx: EditorModuleContext,
    p: ServiceProps,
    receiverId: string,
    targetId: string,
): boolean {
    if (receiverId === targetId) return true;

    const getDirectRelations = (id: string): string[] => {
        if (ctx.isTagId(id)) {
            const t = (p.filters ?? []).find((x) => x.id === id);
            return [...(t?.includes ?? []), ...(t?.excludes ?? [])];
        }
        const inc = p.includes_for_buttons?.[id] ?? [];
        const exc = p.excludes_for_buttons?.[id] ?? [];
        return [...inc, ...exc];
    };

    const visited = new Set<string>();
    const stack = [targetId];

    while (stack.length > 0) {
        const curr = stack.pop()!;
        if (curr === receiverId) return true;
        if (visited.has(curr)) continue;
        visited.add(curr);
        stack.push(...getDirectRelations(curr));
    }

    return false;
}

export function include(
    ctx: EditorModuleContext,
    receiverId: string,
    idOrIds: string | string[],
) {
    ctx.exec({
        name: "include",
        do: () =>
            ctx.patchProps((p) => {
                const receiver = ctx.getNode(receiverId);
                const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
                if (
                    receiver.kind === "tag" ||
                    (receiver.kind === "field" && isActualButtonField(receiver.data)) ||
                    receiver.kind === "option"
                ) {
                    if (receiver.kind === "tag") {
                        const t = (p.filters ?? []).find((x) => x.id === receiverId);
                        if (t) {
                            const accepted: string[] = [];
                            const next = new Set(t.includes ?? []);
                            for (const id of ids) {
                                if (
                                    wouldCreateIncludeExcludeCycle(
                                        ctx,
                                        p,
                                        receiverId,
                                        id,
                                    )
                                ) {
                                    ctx.emit("editor:error", {
                                        message: `Cycle detected: ${receiverId} including ${id} would create a cycle.`,
                                        code: "cycle_detected",
                                        meta: {
                                            receiverId,
                                            targetId: id,
                                            type: "include",
                                        },
                                    });
                                    continue;
                                }
                                next.add(id);
                                accepted.push(id);
                            }
                            if (accepted.length > 0 || (t.includes?.length ?? 0) > 0) {
                                t.includes = Array.from(next);
                            }

                            if (t.excludes) {
                                t.excludes = t.excludes.filter(
                                    (x) => !accepted.includes(x),
                                );
                                if (t.excludes.length === 0) {
                                    delete t.excludes;
                                }
                            }
                        }
                    } else {
                        const accepted: string[] = [];
                        const current = p.includes_for_buttons?.[receiverId] ?? [];
                        const next = new Set(current);
                        for (const id of ids) {
                            if (
                                wouldCreateIncludeExcludeCycle(ctx, p, receiverId, id)
                            ) {
                                ctx.emit("editor:error", {
                                    message: `Cycle detected: ${receiverId} including ${id} would create a cycle.`,
                                    code: "cycle_detected",
                                    meta: {
                                        receiverId,
                                        targetId: id,
                                        type: "include",
                                    },
                                });
                                continue;
                            }
                            next.add(id);
                            accepted.push(id);
                        }
                        if (accepted.length > 0 || current.length > 0) {
                            if (!p.includes_for_buttons) p.includes_for_buttons = {};
                            p.includes_for_buttons[receiverId] = Array.from(next);
                        }

                        if (p.excludes_for_buttons?.[receiverId]) {
                            p.excludes_for_buttons[receiverId] =
                                p.excludes_for_buttons[receiverId].filter(
                                    (x) => !accepted.includes(x),
                                );
                            if (p.excludes_for_buttons[receiverId].length === 0) {
                                delete p.excludes_for_buttons[receiverId];
                            }
                        }
                    }

                    if (!p.fields) p.fields = [];
                    if (!p.filters) p.filters = [];
                } else {
                    throw new Error("Receiver must be a tag, button field, or option");
                }
            }),
        undo: () => ctx.api.undo(),
    });
}

export function exclude(
    ctx: EditorModuleContext,
    receiverId: string,
    idOrIds: string | string[],
) {
    ctx.exec({
        name: "exclude",
        do: () =>
            ctx.patchProps((p) => {
                const receiver = ctx.getNode(receiverId);
                const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
                if (
                    receiver.kind === "tag" ||
                    (receiver.kind === "field" && isActualButtonField(receiver.data)) ||
                    receiver.kind === "option"
                ) {
                    if (receiver.kind === "tag") {
                        const t = (p.filters ?? []).find((x) => x.id === receiverId);
                        if (t) {
                            const accepted: string[] = [];
                            const next = new Set(t.excludes ?? []);
                            for (const id of ids) {
                                if (
                                    wouldCreateIncludeExcludeCycle(
                                        ctx,
                                        p,
                                        receiverId,
                                        id,
                                    )
                                ) {
                                    ctx.emit("editor:error", {
                                        message: `Cycle detected: ${receiverId} excluding ${id} would create a cycle.`,
                                        code: "cycle_detected",
                                        meta: {
                                            receiverId,
                                            targetId: id,
                                            type: "exclude",
                                        },
                                    });
                                    continue;
                                }
                                next.add(id);
                                accepted.push(id);
                            }
                            if (accepted.length > 0 || (t.excludes?.length ?? 0) > 0) {
                                t.excludes = Array.from(next);
                            }

                            if (t.includes) {
                                t.includes = t.includes.filter(
                                    (x) => !accepted.includes(x),
                                );
                                if (t.includes.length === 0) {
                                    delete t.includes;
                                }
                            }
                        }
                    } else {
                        const accepted: string[] = [];
                        const current = p.excludes_for_buttons?.[receiverId] ?? [];
                        const next = new Set(current);
                        for (const id of ids) {
                            if (
                                wouldCreateIncludeExcludeCycle(ctx, p, receiverId, id)
                            ) {
                                ctx.emit("editor:error", {
                                    message: `Cycle detected: ${receiverId} excluding ${id} would create a cycle.`,
                                    code: "cycle_detected",
                                    meta: {
                                        receiverId,
                                        targetId: id,
                                        type: "exclude",
                                    },
                                });
                                continue;
                            }
                            next.add(id);
                            accepted.push(id);
                        }
                        if (accepted.length > 0 || current.length > 0) {
                            if (!p.excludes_for_buttons) p.excludes_for_buttons = {};
                            p.excludes_for_buttons[receiverId] = Array.from(next);
                        }

                        if (p.includes_for_buttons?.[receiverId]) {
                            p.includes_for_buttons[receiverId] =
                                p.includes_for_buttons[receiverId].filter(
                                    (x) => !accepted.includes(x),
                                );
                            if (p.includes_for_buttons[receiverId].length === 0) {
                                delete p.includes_for_buttons[receiverId];
                            }
                        }
                    }

                    if (!p.fields) p.fields = [];
                    if (!p.filters) p.filters = [];
                } else {
                    throw new Error("Receiver must be a tag, button field, or option");
                }
            }),
        undo: () => ctx.api.undo(),
    });
}

export function connect(
    ctx: EditorModuleContext,
    kind: WireKind,
    fromId: string,
    toId: string,
): void {
    ctx.exec({
        name: `connect:${kind}`,
        do: () =>
            ctx.patchProps((p) => {
                if (kind === "bind") {
                    if (ctx.isTagId(fromId) && ctx.isTagId(toId)) {
                        if (wouldCreateTagCycle(ctx, p, fromId, toId)) {
                            throw new Error(`bind would create a cycle: ${fromId} ? ${toId}`);
                        }
                        const child = (p.filters ?? []).find((t) => t.id === toId);
                        if (child) child.bind_id = fromId;
                        return;
                    }
                    if (
                        (ctx.isTagId(fromId) && ctx.isFieldId(toId)) ||
                        (ctx.isFieldId(fromId) && ctx.isTagId(toId))
                    ) {
                        const fieldId = ctx.isFieldId(toId) ? toId : fromId;
                        const tagId = ctx.isTagId(fromId) ? fromId : toId;
                        const f = (p.fields ?? []).find((x) => x.id === fieldId);
                        if (!f) return;
                        if (!f.bind_id) {
                            f.bind_id = tagId;
                            return;
                        }
                        if (typeof f.bind_id === "string") {
                            if (f.bind_id !== tagId) f.bind_id = [f.bind_id, tagId];
                            return;
                        }
                        if (!f.bind_id.includes(tagId)) f.bind_id.push(tagId);
                        return;
                    }
                    throw new Error(`bind: unsupported route ${fromId} ? ${toId}`);
                }

                if (kind === "include" || kind === "exclude") {
                    const key = kind === "include" ? "includes" : "excludes";

                    if (ctx.isTagId(fromId) && ctx.isFieldId(toId)) {
                        const t = (p.filters ?? []).find((x) => x.id === fromId);
                        if (!t) return;
                        const arr = (t[key] ??= []);
                        if (!arr.includes(toId)) arr.push(toId);
                        return;
                    }

                    if (ctx.isOptionId(fromId) && ctx.isFieldId(toId)) {
                        const mapKey =
                            kind === "include"
                                ? "includes_for_options"
                                : "excludes_for_options";
                        const maps = (p as any)[mapKey] as
                            | Record<string, string[]>
                            | undefined;
                        const next = { ...(maps ?? {}) };
                        const arr = next[fromId] ?? [];
                        if (!arr.includes(toId)) arr.push(toId);
                        next[fromId] = arr;
                        (p as any)[mapKey] = next;
                        return;
                    }

                    throw new Error(`${kind}: unsupported route ${fromId} ? ${toId}`);
                }

                if (kind === "service") {
                    ensureServiceExists(ctx.opts, fromId);

                    if (toId.startsWith("t:")) {
                        ctx.exec({
                            name: "connect:service?tag",
                            do: () =>
                                ctx.patchProps((next) => {
                                    const t = (next.filters ?? []).find((x) => x.id === toId);
                                    if (t) (t as any).service_id = fromId;
                                }),
                            undo: () => ctx.api.undo(),
                        });
                        return;
                    }

                    if (toId.startsWith("o:")) {
                        ctx.exec({
                            name: "connect:service?option",
                            do: () =>
                                ctx.patchProps((next) => {
                                    for (const f of next.fields ?? []) {
                                        const o = f.options?.find((x) => x.id === toId);
                                        if (o) {
                                            (o as any).service_id = fromId;
                                            return;
                                        }
                                    }
                                }),
                            undo: () => ctx.api.undo(),
                        });
                        return;
                    }

                    throw new Error('service: to must be a tag ("t:*") or option ("o:*")');
                }

                throw new Error(`Unknown connect kind: ${kind}`);
            }),
        undo: () => ctx.api.undo(),
    });
}

export function disconnect(
    ctx: EditorModuleContext,
    kind: WireKind,
    fromId: string,
    toId: string,
): void {
    ctx.exec({
        name: `disconnect:${kind}`,
        do: () =>
            ctx.patchProps((p) => {
                if (kind === "bind") {
                    if (ctx.isTagId(fromId) && ctx.isTagId(toId)) {
                        const child = (p.filters ?? []).find((t) => t.id === toId);
                        if (child?.bind_id === fromId) delete child.bind_id;
                        return;
                    }
                    if (
                        (ctx.isTagId(fromId) && ctx.isFieldId(toId)) ||
                        (ctx.isFieldId(fromId) && ctx.isTagId(toId))
                    ) {
                        const fieldId = ctx.isFieldId(toId) ? toId : fromId;
                        const tagId = ctx.isTagId(fromId) ? fromId : toId;
                        const f = (p.fields ?? []).find((x) => x.id === fieldId);
                        if (!f?.bind_id) return;
                        if (typeof f.bind_id === "string") {
                            if (f.bind_id === tagId) delete f.bind_id;
                            return;
                        }
                        f.bind_id = f.bind_id.filter((x) => x !== tagId) as any;
                        if (f.bind_id?.length === 0) delete f.bind_id;
                        return;
                    }
                    throw new Error(`unbind: unsupported route ${fromId} ? ${toId}`);
                }

                if (kind === "include" || kind === "exclude") {
                    const key = kind === "include" ? "includes" : "excludes";

                    if (ctx.isTagId(fromId) && ctx.isFieldId(toId)) {
                        const t = (p.filters ?? []).find((x) => x.id === fromId);
                        if (!t) return;
                        t[key] = (t[key] ?? []).filter((x) => x !== toId);
                        if (!t[key]?.length) delete (t as any)[key];
                        return;
                    }

                    if (ctx.isOptionId(fromId) && ctx.isFieldId(toId)) {
                        const mapKey =
                            kind === "include"
                                ? "includes_for_options"
                                : "excludes_for_options";
                        const maps = (p as any)[mapKey] as
                            | Record<string, string[]>
                            | undefined;
                        if (!maps) return;
                        if (maps[fromId]) {
                            maps[fromId] = (maps[fromId] ?? []).filter(
                                (fid) => fid !== toId,
                            );
                            if (!maps[fromId]?.length) delete maps[fromId];
                        }
                        if (!Object.keys(maps).length) delete (p as any)[mapKey];
                        return;
                    }

                    throw new Error(`${kind}: unsupported route ${fromId} ? ${toId}`);
                }

                if (kind === "service") {
                    ensureServiceExists(ctx.opts, fromId);

                    if (toId.startsWith("t:")) {
                        ctx.exec({
                            name: "disconnect:service?tag",
                            do: () =>
                                ctx.patchProps((next) => {
                                    const t = (next.filters ?? []).find((x) => x.id === toId);
                                    if (t) delete (t as any).service_id;
                                }),
                            undo: () => ctx.api.undo(),
                        });
                        return;
                    }

                    if (toId.startsWith("o:")) {
                        ctx.exec({
                            name: "disconnect:service?option",
                            do: () =>
                                ctx.patchProps((next) => {
                                    for (const f of next.fields ?? []) {
                                        const o = f.options?.find((x) => x.id === toId);
                                        if (o) {
                                            delete (o as any).service_id;
                                            return;
                                        }
                                    }
                                }),
                            undo: () => ctx.api.undo(),
                        });
                        return;
                    }

                    throw new Error('service: to must be a tag ("t:*") or option ("o:*")');
                }

                throw new Error(`Unknown disconnect kind: ${kind}`);
            }),
        undo: () => ctx.api.undo(),
    });
}
