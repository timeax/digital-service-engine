import type { Tag } from "@/schema";
import type { EditorModuleContext } from "./editor-types";
import { ownerOfOption } from "./editor-utils";

export function placeNode(
    ctx: EditorModuleContext,
    id: string,
    opts: {
        scopeTagId?: string;
        beforeId?: string;
        afterId?: string;
        index?: number;
    },
) {
    if (ctx.isTagId(id)) {
        ctx.exec({
            name: "placeTag",
            do: () =>
                ctx.patchProps((p) => {
                    const all = p.filters ?? [];
                    const cur = all.find((t) => t.id === id);
                    if (!cur) return;
                    const groupKey = cur.bind_id ?? "__root__";
                    const siblings = all.filter(
                        (t) => (t.bind_id ?? "__root__") === groupKey,
                    );

                    const curIdx = siblings.findIndex((t) => t.id === id);
                    if (curIdx < 0) return;
                    const pulled = siblings.splice(curIdx, 1)[0];

                    let dest = typeof opts.index === "number" ? opts.index : undefined;
                    if (opts.beforeId) {
                        dest = Math.max(
                            0,
                            siblings.findIndex((t) => t.id === opts.beforeId),
                        );
                    }
                    if (opts.afterId) {
                        dest = Math.min(
                            siblings.length,
                            siblings.findIndex((t) => t.id === opts.afterId) + 1,
                        );
                    }
                    if (dest === undefined || Number.isNaN(dest)) {
                        dest = siblings.length;
                    }

                    const out: Tag[] = [];
                    for (const t of all) {
                        const sameGroup = (t.bind_id ?? "__root__") === groupKey;
                        if (!sameGroup) {
                            out.push(t);
                        }
                    }
                    siblings.splice(dest, 0, pulled);
                    p.filters = [...out, ...siblings];
                }),
            undo: () => ctx.api.undo(),
        });
        return;
    }

    if (ctx.isFieldId(id)) {
        if (!opts.scopeTagId) {
            throw new Error("placeNode(field): scopeTagId is required");
        }
        const fieldId = id;
        const tagId = opts.scopeTagId;

        ctx.exec({
            name: "placeField",
            do: () =>
                ctx.patchProps((p) => {
                    const map = (p.order_for_tags ??= {});
                    const arr = (map[tagId] ??= []);
                    const curIdx = arr.indexOf(fieldId);
                    if (curIdx >= 0) arr.splice(curIdx, 1);

                    let dest = typeof opts.index === "number" ? opts.index : undefined;
                    if (opts.beforeId) dest = Math.max(0, arr.indexOf(opts.beforeId));
                    if (opts.afterId) {
                        dest = Math.min(arr.length, arr.indexOf(opts.afterId) + 1);
                    }
                    if (dest === undefined || Number.isNaN(dest)) dest = arr.length;

                    arr.splice(dest, 0, fieldId);
                }),
            undo: () => ctx.api.undo(),
        });
        return;
    }

    if (ctx.isOptionId(id)) {
        placeOption(ctx, id, opts);
        return;
    }

    throw new Error("placeNode: unknown id prefix");
}

export function placeOption(
    ctx: EditorModuleContext,
    optionId: string,
    opts: { beforeId?: string; afterId?: string; index?: number },
) {
    if (!ctx.isOptionId(optionId)) {
        throw new Error('placeOption: optionId must start with "o:"');
    }

    ctx.exec({
        name: "placeOption",
        do: () =>
            ctx.patchProps((p) => {
                const owner = ownerOfOption(p, optionId);
                if (!owner) return;
                const f = (p.fields ?? []).find((x) => x.id === owner.fieldId);
                if (!f?.options) return;

                const curIdx = f.options.findIndex((o) => o.id === optionId);
                if (curIdx < 0) return;

                const pulled = f.options.splice(curIdx, 1)[0];

                let dest = typeof opts.index === "number" ? opts.index : undefined;
                if (opts.beforeId) {
                    dest = Math.max(
                        0,
                        f.options.findIndex((o) => o.id === opts.beforeId),
                    );
                }
                if (opts.afterId) {
                    dest = Math.min(
                        f.options.length,
                        f.options.findIndex((o) => o.id === opts.afterId) + 1,
                    );
                }
                if (dest === undefined || Number.isNaN(dest)) {
                    dest = f.options.length;
                }

                f.options.splice(dest, 0, pulled);
            }),
        undo: () => ctx.api.undo(),
    });
}
