import type { ServicePropsNotice } from "@/schema";
import type { EditorModuleContext } from "./editor-types";

function genNoticeId(ctx: EditorModuleContext): string {
    const taken = new Set((ctx.getProps().notices ?? []).map((n) => n.id));
    for (let i = 1; i < 10_000; i++) {
        const id = `n:${i}`;
        if (!taken.has(id)) return id;
    }
    throw new Error("Unable to generate notice id");
}

export function addNotice(
    ctx: EditorModuleContext,
    input: Omit<ServicePropsNotice, "id"> & { id?: string },
): string {
    const id = input.id ?? genNoticeId(ctx);

    ctx.exec({
        name: "addNotice",
        do: () =>
            ctx.patchProps((p) => {
                const notices = (p.notices ??= []);
                if (notices.some((n) => n.id === id)) {
                    throw new Error(`Notice id '${id}' already exists`);
                }
                notices.push({ ...input, id });
            }),
        undo: () => ctx.undo(),
    });

    return id;
}

export function updateNotice(
    ctx: EditorModuleContext,
    id: string,
    patch: Partial<ServicePropsNotice>,
): void {
    const { id: _ignored, ...rest } = patch;
    ctx.exec({
        name: "updateNotice",
        do: () =>
            ctx.patchProps((p) => {
                const notices = p.notices;
                if (!notices?.length) return;

                const target = notices.find((n) => n.id === id);
                if (!target) return;
                Object.assign(target, rest);
            }),
        undo: () => ctx.undo(),
    });
}

export function removeNotice(ctx: EditorModuleContext, id: string): void {
    ctx.exec({
        name: "removeNotice",
        do: () =>
            ctx.patchProps((p) => {
                if (!p.notices?.length) return;
                p.notices = p.notices.filter((n) => n.id !== id);
                if (!p.notices.length) delete p.notices;
            }),
        undo: () => ctx.undo(),
    });
}
