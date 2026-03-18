import type { EditorModuleContext } from "./editor-types";

export function setConstraint(
    ctx: EditorModuleContext,
    tagId: string,
    flag: string,
    value: boolean | undefined,
) {
    let prev: boolean | undefined;
    ctx.exec({
        name: "setConstraint",
        do: () =>
            ctx.patchProps((p) => {
                const t = (p.filters ?? []).find((x) => x.id === tagId);
                if (!t) return;
                prev = t.constraints?.[flag];
                if (!t.constraints) t.constraints = {};
                if (value === undefined) delete t.constraints[flag];
                else t.constraints[flag] = value;
            }),
        undo: () =>
            ctx.patchProps((p) => {
                const t = (p.filters ?? []).find((x) => x.id === tagId);
                if (!t) return;
                if (!t.constraints) t.constraints = {};
                if (prev === undefined) delete t.constraints[flag];
                else t.constraints[flag] = prev;
            }),
    });
}

export function clearConstraintOverride(
    ctx: EditorModuleContext,
    tagId: string,
    flag: string,
) {
    let prev: boolean | undefined;
    let prevOverride: any;
    ctx.exec({
        name: "clearConstraintOverride",
        do: () =>
            ctx.patchProps((p) => {
                const t = (p.filters ?? []).find((x) => x.id === tagId);
                if (!t) return;
                prev = t.constraints?.[flag];
                prevOverride = t.constraints_overrides?.[flag];

                if (t.constraints) delete t.constraints[flag];
                if (t.constraints_overrides) delete t.constraints_overrides[flag];
            }),
        undo: () =>
            ctx.patchProps((p) => {
                const t = (p.filters ?? []).find((x) => x.id === tagId);
                if (!t) return;
                if (prev !== undefined) {
                    if (!t.constraints) t.constraints = {};
                    t.constraints[flag] = prev;
                }
                if (prevOverride !== undefined) {
                    if (!t.constraints_overrides) t.constraints_overrides = {};
                    t.constraints_overrides[flag] = prevOverride;
                }
            }),
    });
}

export function clearConstraint(
    ctx: EditorModuleContext,
    tagId: string,
    flag: string,
) {
    ctx.exec({
        name: "clearConstraint",
        do: () =>
            ctx.patchProps((p) => {
                const tags = p.filters ?? [];
                const byId = new Map(tags.map((t) => [t.id, t]));
                const children = new Map<string, string[]>();
                for (const t of tags) {
                    if (t.bind_id) {
                        if (!children.has(t.bind_id)) children.set(t.bind_id, []);
                        children.get(t.bind_id)!.push(t.id);
                    }
                }

                const process = (id: string) => {
                    const t = byId.get(id);
                    if (!t) return;

                    const override = t.constraints_overrides?.[flag];
                    if (override) {
                        if (!t.constraints) t.constraints = {};
                        t.constraints[flag] = override.from;
                        delete t.constraints_overrides![flag];
                        if (Object.keys(t.constraints_overrides ?? {}).length === 0) {
                            delete t.constraints_overrides;
                        }
                    } else if (t.constraints) {
                        delete t.constraints[flag];
                        if (Object.keys(t.constraints).length === 0) {
                            delete t.constraints;
                        }
                    }

                    for (const childId of children.get(id) ?? []) {
                        process(childId);
                    }
                };

                process(tagId);
            }),
        undo: () => ctx.undo(),
    });
}
