import { describe, expect, it } from "vitest";
import { createBuilder } from "@/core";
import { CanvasAPI } from "../api";
import type { ServiceProps } from "@/schema";
import { buildOrderSnapshot } from "@/utils/build-order-snapshot";

function baseProps(): ServiceProps {
    return {
        schema_version: "1.0",
        filters: [{ id: "t:root", label: "Root" }],
        fields: [
            {
                id: "f:button",
                type: "checkbox",
                bind_id: "t:root",
                label: "Button",
                button: true,
            } as any,
            {
                id: "f:plain",
                type: "text",
                bind_id: "t:root",
                label: "Plain",
                name: "plain",
            } as any,
            {
                id: "f:mode",
                type: "select",
                bind_id: "t:root",
                label: "Mode",
                options: [{ id: "o:contract", label: "Contract" }],
            } as any,
        ],
    };
}

function setup(props: ServiceProps = baseProps()) {
    const builder = createBuilder();
    builder.load(props);
    const api = new CanvasAPI(builder, { autoEmitState: false });
    return { builder, api, editor: api.editor };
}

describe("Editor orderKinds helpers", () => {
    it("setOrderKind writes mappings for tag, button field, and option ids", () => {
        const { builder, editor } = setup();
        editor.setOrderKind("t:root", "subscription");
        editor.setOrderKind("f:button", "contract");
        editor.setOrderKind("o:contract", "quote");

        expect(builder.getProps().orderKinds).toEqual({
            "t:root": "subscription",
            "f:button": "contract",
            "o:contract": "quote",
        });
    });

    it("setOrderKind throws for unknown ids", () => {
        const { editor } = setup();
        expect(() => editor.setOrderKind("missing:id", "contract")).toThrow(
            "is not a known tag, field, or option",
        );
    });

    it("setOrderKind throws for composite ids", () => {
        const { editor } = setup();
        expect(() =>
            editor.setOrderKind("f:mode::o:contract", "contract"),
        ).toThrow("composite/internal trigger keys are not allowed");
    });

    it("setOrderKind rejects non-button fields", () => {
        const { editor } = setup();
        expect(() => editor.setOrderKind("f:plain", "contract")).toThrow(
            "must be a button field",
        );
        expect(() => editor.setOrderKind("f:mode", "contract")).toThrow(
            "must be a button field",
        );
    });

    it("deleteOrderKind removes single key and cleans empty map", () => {
        const { builder, editor } = setup();
        editor.setOrderKind("t:root", "subscription");
        editor.deleteOrderKind("t:root");
        expect(builder.getProps().orderKinds).toBeUndefined();
    });

    it("deleteOrderKind unknown id is no-op", () => {
        const { builder, editor } = setup();
        editor.setOrderKind("t:root", "subscription");
        editor.deleteOrderKind("t:missing");
        expect(builder.getProps().orderKinds).toEqual({
            "t:root": "subscription",
        });
    });

    it("pruneKind removes exact matching kinds globally and returns count", () => {
        const { builder, editor } = setup();
        editor.setOrderKind("t:root", "contract");
        editor.setOrderKind("f:button", "contract");
        editor.setOrderKind("o:contract", "quote");

        const removed = editor.pruneKind("contract");
        expect(removed).toBe(2);
        expect(builder.getProps().orderKinds).toEqual({
            "o:contract": "quote",
        });
    });

    it("supports undo/redo across set, delete, prune", () => {
        const { builder, editor } = setup();
        editor.setOrderKind("t:root", "subscription");
        editor.setOrderKind("f:button", "contract");
        editor.deleteOrderKind("t:root");
        editor.pruneKind("contract");
        expect(builder.getProps().orderKinds).toBeUndefined();

        editor.undo();
        expect(builder.getProps().orderKinds).toEqual({
            "f:button": "contract",
        });

        editor.undo();
        expect(builder.getProps().orderKinds).toEqual({
            "t:root": "subscription",
            "f:button": "contract",
        });

        editor.redo();
        expect(builder.getProps().orderKinds).toEqual({
            "f:button": "contract",
        });

        editor.redo();
        expect(builder.getProps().orderKinds).toBeUndefined();
    });

    it("editor-written orderKinds is used by downstream snapshot resolution", () => {
        const { builder, editor } = setup();
        editor.setOrderKind("t:root", "subscription");
        editor.setOrderKind("f:button", "contract");

        const snap = buildOrderSnapshot(
            builder.getProps(),
            builder,
            {
                activeTagId: "t:root",
                formValuesByFieldId: {},
                optionSelectionsByFieldId: {},
                selectedKeys: ["f:button"],
            },
            {},
            { mode: "prod" },
        );

        expect(snap.orderKind).toBe("contract");
        expect(snap.orderKindSource).toEqual({
            nodeId: "f:button",
            nodeKind: "field",
        });
    });
});
