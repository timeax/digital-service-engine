import { describe, expect, it } from "vitest";
import { createBuilder } from "@/core";
import type { ServiceProps, ServicePropsNotice } from "@/schema";
import { CanvasAPI } from "../api";

function baseProps(): ServiceProps {
    return {
        schema_version: "1.0",
        filters: [{ id: "root", label: "Root" }],
        fields: [{ id: "f:text", type: "text", bind_id: "root", label: "Text" }],
    };
}

function makeNotice(
    overrides: Partial<ServicePropsNotice> = {},
): Omit<ServicePropsNotice, "id"> {
    return {
        type: "public",
        kind: "label",
        severity: "info",
        target: { scope: "global" },
        title: "Best",
        ...overrides,
    };
}

describe("Editor notice helpers", () => {
    it("addNotice adds a notice and returns generated id when omitted", () => {
        const b = createBuilder();
        b.load(baseProps());
        const api = new CanvasAPI(b, { autoEmitState: false });
        const { editor } = api;

        const id = editor.addNotice(makeNotice());
        const props = b.getProps();

        expect(id).toBe("n:1");
        expect(props.notices).toHaveLength(1);
        expect(props.notices?.[0]).toMatchObject({ id, title: "Best" });
    });

    it("addNotice preserves provided id", () => {
        const b = createBuilder();
        b.load(baseProps());
        const api = new CanvasAPI(b, { autoEmitState: false });
        const { editor } = api;

        const id = editor.addNotice({
            id: "notice:custom",
            ...makeNotice({ title: "Custom" }),
        });
        const props = b.getProps();

        expect(id).toBe("notice:custom");
        expect(props.notices?.[0].id).toBe("notice:custom");
    });

    it("updateNotice patches targeted notice and unknown id is no-op", () => {
        const b = createBuilder();
        b.load({
            ...baseProps(),
            notices: [
                { id: "n:1", ...makeNotice({ title: "One" }) },
                { id: "n:2", ...makeNotice({ title: "Two" }) },
            ],
        });
        const api = new CanvasAPI(b, { autoEmitState: false });
        const { editor } = api;

        editor.updateNotice("n:2", { title: "Two Updated", severity: "warning" });
        editor.updateNotice("n:404", { title: "Nope" });

        const props = b.getProps();
        expect(props.notices?.find((n) => n.id === "n:1")?.title).toBe("One");
        expect(props.notices?.find((n) => n.id === "n:2")).toMatchObject({
            title: "Two Updated",
            severity: "warning",
        });
    });

    it("removeNotice deletes targeted notice and unknown id is no-op", () => {
        const b = createBuilder();
        b.load({
            ...baseProps(),
            notices: [
                { id: "n:1", ...makeNotice({ title: "One" }) },
                { id: "n:2", ...makeNotice({ title: "Two" }) },
            ],
        });
        const api = new CanvasAPI(b, { autoEmitState: false });
        const { editor } = api;

        editor.removeNotice("n:2");
        editor.removeNotice("n:404");

        const props = b.getProps();
        expect(props.notices).toHaveLength(1);
        expect(props.notices?.[0].id).toBe("n:1");
    });

    it("supports undo/redo across add, update, remove notice", () => {
        const b = createBuilder();
        b.load(baseProps());
        const api = new CanvasAPI(b, { autoEmitState: false });
        const { editor } = api;

        const id = editor.addNotice(makeNotice({ title: "Initial" }));
        editor.updateNotice(id, { title: "Updated" });
        editor.removeNotice(id);
        expect(b.getProps().notices).toBeUndefined();

        editor.undo();
        expect(b.getProps().notices?.[0].title).toBe("Updated");

        editor.undo();
        expect(b.getProps().notices?.[0].title).toBe("Initial");

        editor.undo();
        expect(b.getProps().notices).toBeUndefined();

        editor.redo();
        expect(b.getProps().notices?.[0].title).toBe("Initial");

        editor.redo();
        expect(b.getProps().notices?.[0].title).toBe("Updated");

        editor.redo();
        expect(b.getProps().notices).toBeUndefined();
    });
});
