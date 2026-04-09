import type { EditorModuleContext } from "./editor-types";
import { isActualButtonField } from "./editor-utils";

function normalizeKind(kind: string): string {
    const next = String(kind ?? "").trim();
    if (!next) {
        throw new Error("setOrderKind: kind must be a non-empty string");
    }
    return next;
}

function assertCanonicalNodeId(ctx: EditorModuleContext, nodeId: string): void {
    const id = String(nodeId ?? "").trim();
    if (!id) throw new Error("setOrderKind: nodeId is required");
    if (id.includes("::")) {
        throw new Error(
            "setOrderKind: composite/internal trigger keys are not allowed; use canonical tag/field/option ids",
        );
    }
    if (!ctx.isTagId(id) && !ctx.isFieldId(id) && !ctx.isOptionId(id)) {
        throw new Error(
            `setOrderKind: node id '${id}' is not a known tag, field, or option`,
        );
    }
    if (ctx.isFieldId(id)) {
        const node = ctx.getNode(id);
        if (node.kind !== "field" || !isActualButtonField(node.data as any)) {
            throw new Error(
                `setOrderKind: field '${id}' must be a button field without options`,
            );
        }
    }
}

export function setOrderKind(
    ctx: EditorModuleContext,
    nodeId: string,
    kind: string,
): void {
    const id = String(nodeId ?? "").trim();
    const nextKind = normalizeKind(kind);
    assertCanonicalNodeId(ctx, id);

    ctx.exec({
        name: "setOrderKind",
        do: () =>
            ctx.patchProps((p) => {
                if (!p.orderKinds) p.orderKinds = {};
                p.orderKinds[id] = nextKind;
            }),
        undo: () => ctx.undo(),
    });
}

export function deleteOrderKind(
    ctx: EditorModuleContext,
    nodeId: string,
): void {
    const id = String(nodeId ?? "").trim();
    if (!id) return;

    ctx.exec({
        name: "deleteOrderKind",
        do: () =>
            ctx.patchProps((p) => {
                if (!p.orderKinds || !Object.prototype.hasOwnProperty.call(p.orderKinds, id)) {
                    return;
                }
                delete p.orderKinds[id];
                if (!Object.keys(p.orderKinds).length) {
                    delete p.orderKinds;
                }
            }),
        undo: () => ctx.undo(),
    });
}

export function pruneOrderKind(
    ctx: EditorModuleContext,
    kind: string,
): number {
    const target = normalizeKind(kind);
    let removedCount = 0;

    ctx.exec({
        name: "pruneOrderKind",
        do: () =>
            ctx.patchProps((p) => {
                if (!p.orderKinds) return;
                removedCount = 0;
                for (const [nodeId, mapped] of Object.entries(p.orderKinds)) {
                    if (mapped !== target) continue;
                    delete p.orderKinds[nodeId];
                    removedCount++;
                }
                if (!Object.keys(p.orderKinds).length) {
                    delete p.orderKinds;
                }
            }),
        undo: () => ctx.undo(),
    });

    return removedCount;
}
