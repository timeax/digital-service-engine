import { describe, expect, it } from "vitest";
import { createBuilder } from "@/core";
import type { ServiceProps } from "@/schema";
import { CanvasAPI } from "../api";

function baseProps(): ServiceProps {
    return {
        schema_version: "1.0",
        filters: [
            {
                id: "t:root",
                label: "Root",
                includes: ["f:a", "f:b"],
                excludes: ["o:a1"],
            },
            {
                id: "t:child",
                label: "Child",
                bind_id: "t:root",
                includes: ["f:a"],
                excludes: ["f:b"],
            },
        ],
        fields: [
            {
                id: "f:a",
                type: "select",
                bind_id: ["t:root", "t:child"],
                label: "A",
                options: [
                    { id: "o:a1", label: "A1" },
                    { id: "o:a2", label: "A2" },
                ],
            } as any,
            {
                id: "f:b",
                type: "text",
                bind_id: "t:child",
                label: "B",
            } as any,
        ],
        includes_for_buttons: {
            "f:a": ["f:b", "o:a1"],
            "f:b": ["f:a"],
            "o:a1": ["f:b"],
        } as any,
        excludes_for_buttons: {
            "f:b": ["f:a", "o:a1"],
        } as any,
        notices: [
            {
                id: "n:global",
                type: "public",
                kind: "label",
                severity: "info",
                title: "Global",
                target: { scope: "global" },
            },
            {
                id: "n:field",
                type: "public",
                kind: "warning",
                severity: "warning",
                title: "Field",
                target: { scope: "node", node_kind: "field", node_id: "f:a" },
            },
            {
                id: "n:option",
                type: "public",
                kind: "warning",
                severity: "warning",
                title: "Option",
                target: { scope: "node", node_kind: "option", node_id: "o:a1" },
            },
        ] as any,
    };
}

function setup(props: ServiceProps = baseProps()) {
    const builder = createBuilder();
    builder.load(props);
    const api = new CanvasAPI(builder, { autoEmitState: false });
    return { builder, api, editor: api.editor };
}

describe("Editor batch actions", () => {
    it("removeMany removes mixed ids in one undoable operation and skips missing", () => {
        const { builder, editor } = setup();
        const changes: any[] = [];
        (editor as any).api.on("editor:change", (e: any) => changes.push(e));

        editor.removeMany(["o:a1", "f:b", "t:child", "missing:id"]);
        const next = builder.getProps();
        expect(next.fields.some((f) => f.id === "f:b")).toBe(false);
        expect((next.fields.find((f) => f.id === "f:a")?.options ?? []).some((o) => o.id === "o:a1")).toBe(false);
        expect(next.filters.some((t) => t.id === "t:child")).toBe(false);
        expect(changes).toHaveLength(1);

        expect(editor.undo()).toBe(true);
        const restored = builder.getProps();
        expect(restored.fields.some((f) => f.id === "f:b")).toBe(true);
        expect((restored.fields.find((f) => f.id === "f:a")?.options ?? []).some((o) => o.id === "o:a1")).toBe(true);
        expect(restored.filters.some((t) => t.id === "t:child")).toBe(true);
    });

    it("removeMany does not double-delete option when parent field is selected", () => {
        const { builder, editor } = setup();
        editor.removeMany(["f:a", "o:a1"]);

        const next = builder.getProps();
        expect(next.fields.some((f) => f.id === "f:a")).toBe(false);
        expect(next.notices?.some((n) => n.id === "n:field")).toBe(false);
        expect(next.notices?.some((n) => n.id === "n:option")).toBe(false);
    });

    it("duplicateMany duplicates multiple nodes in input order and uses one undo step", () => {
        const { builder, editor } = setup();
        const events: any[] = [];
        (editor as any).api.on("editor:change", (e: any) => events.push(e));

        const ids = editor.duplicateMany(["f:a", "o:a1", "t:child", "missing:id"]);
        expect(ids).toHaveLength(2);
        expect(events).toHaveLength(1);

        const after = builder.getProps();
        expect(after.fields.length).toBeGreaterThan(2);
        expect(after.filters.length).toBeGreaterThan(2);

        expect(editor.undo()).toBe(true);
        const restored = builder.getProps();
        expect(restored.fields).toHaveLength(2);
        expect(restored.filters).toHaveLength(2);
    });

    it("duplicateMany skips option duplication when its parent field is also selected", () => {
        const { editor } = setup();
        const ids = editor.duplicateMany(["f:a", "o:a1"]);
        expect(ids).toHaveLength(1);
    });

    it("single duplicate behavior remains unchanged", () => {
        const { builder, editor } = setup();
        const id = editor.duplicate({ kind: "field", id: "f:a" });
        expect(id).toBeTruthy();
        expect(builder.getProps().fields.some((f) => f.id === id)).toBe(true);
    });

    it("clearServiceMany removes service ids from selected tags/fields/options", () => {
        const { builder, editor } = setup({
            ...baseProps(),
            filters: [{ id: "t:root", label: "Root", service_id: 10 } as any],
            fields: [
                { id: "f:a", type: "text", label: "A", service_id: 22 } as any,
                {
                    id: "f:b",
                    type: "select",
                    label: "B",
                    options: [{ id: "o:b1", label: "B1", service_id: 33 }],
                } as any,
            ],
        } as any);

        editor.clearServiceMany(["t:root", "f:a", "o:b1"]);
        const next = builder.getProps() as any;
        expect(next.filters[0].service_id).toBeUndefined();
        expect(next.fields[0].service_id).toBeUndefined();
        expect(next.fields[1].options[0].service_id).toBeUndefined();
    });

    it("rebindMany rebinds selected fields and tags to target tag", () => {
        const { builder, editor } = setup();
        editor.rebindMany(["f:b", "t:child"], "t:root");
        const next = builder.getProps();
        expect((next.fields.find((f) => f.id === "f:b") as any)?.bind_id).toBe("t:root");
        expect((next.filters.find((t) => t.id === "t:child") as any)?.bind_id).toBe("t:root");
    });

    it("includeMany/excludeMany apply selected ids to receiver", () => {
        const { builder, editor } = setup();
        editor.includeMany("t:root", ["f:a", "f:b"]);
        editor.excludeMany("t:root", ["o:a1"]);
        const root = builder.getProps().filters.find((t) => t.id === "t:root") as any;
        expect(root.includes).toContain("f:a");
        expect(root.includes).toContain("f:b");
        expect(root.excludes).toContain("o:a1");
    });

    it("clearRelationsMany clears owned and incoming relationships", () => {
        const { builder, editor } = setup();
        editor.clearRelationsMany(["f:a", "t:root"], "both");
        const next = builder.getProps() as any;
        expect(next.filters.find((t: any) => t.id === "t:root")?.includes).toBeUndefined();
        expect(next.filters.find((t: any) => t.id === "t:root")?.excludes).toBeUndefined();
        expect(next.includes_for_buttons?.["f:b"]?.includes("f:a")).not.toBe(true);
    });

    it("renameLabelsMany applies prefix/suffix to labels only", () => {
        const { builder, editor } = setup();
        editor.renameLabelsMany(["t:root", "f:a", "o:a1"], {
            prefix: "P-",
            suffix: "-S",
        });
        const next = builder.getProps();
        expect(next.filters.find((t) => t.id === "t:root")?.label).toBe("P-Root-S");
        expect(next.fields.find((f) => f.id === "f:a")?.label).toBe("P-A-S");
        expect(next.fields.find((f) => f.id === "f:a")?.options?.find((o) => o.id === "o:a1")?.label).toBe("P-A1-S");
    });

    it("setPricingRoleMany updates selected fields/options roles", () => {
        const { builder, editor } = setup();
        editor.setPricingRoleMany(["f:a", "o:a1"], "utility");
        const next = builder.getProps() as any;
        expect(next.fields.find((f: any) => f.id === "f:a")?.pricing_role).toBe("utility");
        expect(
            next.fields
                .find((f: any) => f.id === "f:a")
                ?.options?.find((o: any) => o.id === "o:a1")?.pricing_role,
        ).toBe("utility");
    });

    it("clearFieldDefaultsMany and clearFieldValidationMany clear only selected fields", () => {
        const { builder, editor } = setup({
            ...baseProps(),
            fields: [
                {
                    id: "f:a",
                    type: "text",
                    label: "A",
                    defaults: { foo: "bar" },
                    validation: [{ op: "truthy" }],
                } as any,
            ],
        } as any);
        editor.clearFieldDefaultsMany(["f:a"]);
        editor.clearFieldValidationMany(["f:a"]);
        const next = builder.getProps() as any;
        expect(next.fields[0].defaults).toBeUndefined();
        expect(next.fields[0].validation).toBeUndefined();
    });

    it("autoCreateOptionsMany creates one starter option when missing", () => {
        const { builder, editor } = setup({
            ...baseProps(),
            fields: [{ id: "f:a", type: "select", label: "A" } as any],
        } as any);
        editor.autoCreateOptionsMany(["f:a"]);
        const next = builder.getProps();
        expect(next.fields[0].options?.length).toBe(1);
    });

    it("clearAllOptionsMany removes all options and related references", () => {
        const { builder, editor } = setup();
        editor.clearAllOptionsMany(["f:a"]);
        const next = builder.getProps() as any;
        expect(next.fields.find((f: any) => f.id === "f:a")?.options?.length ?? 0).toBe(0);
        expect(next.notices?.some((n: any) => n.id === "n:option")).toBe(false);
    });

    it("notice batch actions remove and toggle notices for selected nodes", () => {
        const { builder, editor } = setup();
        editor.setNoticesVisibilityForNodes(["f:a"], "private");
        let next = builder.getProps() as any;
        expect(next.notices.find((n: any) => n.id === "n:field")?.type).toBe("private");

        editor.removeNoticesForNodes(["f:a", "o:a1"]);
        next = builder.getProps() as any;
        expect(next.notices?.some((n: any) => n.id === "n:field")).toBe(false);
        expect(next.notices?.some((n: any) => n.id === "n:option")).toBe(false);
        expect(next.notices?.some((n: any) => n.id === "n:global")).toBe(true);
    });
});

describe("Delete cleanup parity (single and batch)", () => {
    it("single remove cleans relation maps, tag includes/excludes, and node notices", () => {
        const { builder, editor } = setup();
        editor.remove("f:a");
        const next = builder.getProps() as any;

        expect(next.includes_for_buttons?.["f:a"]).toBeUndefined();
        expect(next.excludes_for_buttons?.["f:b"]?.includes("f:a")).not.toBe(true);
        expect(next.filters.find((t: any) => t.id === "t:root")?.includes?.includes("f:a")).not.toBe(true);
        expect(next.notices?.some((n: any) => n.id === "n:field")).toBe(false);
        expect(next.notices?.some((n: any) => n.id === "n:global")).toBe(true);
    });

    it("batch remove cleans all selected ids from maps and notices in one operation", () => {
        const { builder, editor } = setup();
        editor.removeMany(["f:a", "o:a1", "t:child"]);
        const next = builder.getProps() as any;

        expect(next.includes_for_buttons?.["f:a"]).toBeUndefined();
        expect(next.includes_for_buttons?.["o:a1"]).toBeUndefined();
        expect(next.excludes_for_buttons?.["f:b"]?.includes("f:a")).not.toBe(true);
        expect(next.filters.find((t: any) => t.id === "t:root")?.excludes?.includes("o:a1")).not.toBe(true);
        expect(next.notices?.some((n: any) => n.id === "n:field")).toBe(false);
        expect(next.notices?.some((n: any) => n.id === "n:option")).toBe(false);
        expect(next.notices?.some((n: any) => n.id === "n:global")).toBe(true);
    });
});
