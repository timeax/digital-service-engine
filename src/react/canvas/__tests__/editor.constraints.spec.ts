import { describe, expect, it } from "vitest";
import { createBuilder } from "@/core";
import { CanvasAPI } from "../api";
import { ServiceProps } from "@/schema";

function constraintProps(): ServiceProps {
    return {
        schema_version: "1.0",
        filters: [
            { id: "t:parent", label: "Parent" },
            { id: "t:child", label: "Child", bind_id: "t:parent" },
        ],
        fields: [],
    };
}

describe("Editor constraints", () => {
    it("populates constraints_overrides when ancestor overrides child local constraint", () => {
        const b = createBuilder({
            // Provide a mock service map so getConstraints() knows about 'refill'
            serviceMap: {
                s1: {
                    id: 1,
                    flags: {
                        refill: { description: "Refill flag" },
                    },
                } as any,
            },
        });
        b.load(constraintProps());

        const api = new CanvasAPI(b, { autoEmitState: false });
        const { editor } = api;

        // 1. Set child local constraint to 'false'
        editor.setConstraint("t:child", "refill", false);

        let props = b.getProps();
        let child = props.filters.find((t) => t.id === "t:child")!;
        expect(child.constraints?.["refill"]).toBe(false);

        // 2. Set parent constraint to 'true' -> should override child
        editor.setConstraint("t:parent", "refill", true);

        props = b.getProps();
        child = props.filters.find((t) => t.id === "t:child")!;
        const parent = props.filters.find((t) => t.id === "t:parent")!;

        // Effective value is now 'true' (inherited from parent)
        expect(parent.constraints?.["refill"]).toBe(true);
        expect(child.constraints?.["refill"]).toBe(true);
        expect(child.constraints_origin?.["refill"]).toBe("t:parent");

        // Check overrides
        expect(child.constraints_overrides?.["refill"]).toEqual({
            from: false,
            to: true,
            origin: "t:parent",
        });
    });

    it("undo/redo restores constraints", () => {
        const b = createBuilder({
            serviceMap: {
                s1: {
                    id: 1,
                    flags: { refill: { description: "Refill flag" } },
                } as any,
            },
        });
        b.load(constraintProps());

        const api = new CanvasAPI(b, { autoEmitState: false });
        const { editor } = api;

        editor.setConstraint("t:child", "refill", false);
        editor.setConstraint("t:parent", "refill", true);

        let child = b.getProps().filters.find((t) => t.id === "t:child")!;
        expect(child.constraints?.["refill"]).toBe(true);

        // Undo setting parent constraint
        editor.undo();
        child = b.getProps().filters.find((t) => t.id === "t:child")!;
        expect(child.constraints?.["refill"]).toBe(false);
        expect(child.constraints_origin?.["refill"]).toBe("t:child");

        // Redo setting parent constraint
        editor.redo();
        child = b.getProps().filters.find((t) => t.id === "t:child")!;
        expect(child.constraints?.["refill"]).toBe(true);
    });

    it("works when constraints are set through builder.load directly", () => {
        const b = createBuilder({
            serviceMap: {
                s1: {
                    id: 1,
                    flags: { refill: { description: "Refill flag" } },
                } as any,
            },
        });
        const props: ServiceProps = {
            schema_version: "1.0",
            filters: [
                {
                    id: "t:parent",
                    label: "Parent",
                    constraints: { refill: true },
                },
                {
                    id: "t:child",
                    label: "Child",
                    bind_id: "t:parent",
                    constraints: { refill: false },
                },
            ],
            fields: [],
        };

        // Actually, let's just use the editor to load them
        const api = new CanvasAPI(b, { autoEmitState: false });
        //@ts-ignore
        api.editor.replaceProps(props);

        const child = b.getProps().filters.find((t) => t.id === "t:child")!;
        expect(child.constraints?.["refill"]).toBe(true);
    });

    it("clears a constraint override", () => {
        const b = createBuilder({
            serviceMap: {
                s1: {
                    id: 1,
                    flags: { refill: { description: "Refill flag" } },
                } as any,
            },
        });
        b.load({
            schema_version: "1.0",
            filters: [
                { id: "t:parent", label: "Parent", constraints: { refill: true } },
                { id: "t:child", label: "Child", bind_id: "t:parent", constraints: { refill: false } },
            ],
            fields: [],
        });

        const api = new CanvasAPI(b, { autoEmitState: false });
        const { editor } = api;

        // Verify initial state: child has an override
        let child = b.getProps().filters.find((t) => t.id === "t:child")!;
        expect(child.constraints?.["refill"]).toBe(true); // effective
        expect(child.constraints_overrides?.["refill"]).toBeDefined();
        expect(child.constraints_overrides?.["refill"]?.from).toBe(false);

        // Clear the override
        editor.clearConstraintOverride("t:child", "refill");

        child = b.getProps().filters.find((t) => t.id === "t:child")!;
        // Now child should have no local constraint for 'refill', thus no override
        expect(child.constraints?.["refill"]).toBe(true); // still true (inherited)
        expect(child.constraints_overrides?.["refill"]).toBeUndefined();
        
        // Origin should still be parent
        expect(child.constraints_origin?.["refill"]).toBe("t:parent");

        // Undo clearing the override
        editor.undo();
        child = b.getProps().filters.find((t) => t.id === "t:child")!;
        expect(child.constraints_overrides?.["refill"]).toBeDefined();
        expect(child.constraints_overrides?.["refill"]?.from).toBe(false);
        expect(child.constraints?.["refill"]).toBe(true); // effective

        // Redo clearing
        editor.redo();
        child = b.getProps().filters.find((t) => t.id === "t:child")!;
        expect(child.constraints_overrides?.["refill"]).toBeUndefined();
    });

    it("maintains constraints_origin through multi-level inheritance", () => {
        const b = createBuilder({
            serviceMap: {
                s1: {
                    id: 1,
                    flags: { refill: { description: "Refill flag" } },
                } as any,
            },
        });
        const props: ServiceProps = {
            schema_version: "1.0",
            filters: [
                {
                    id: "t:grandparent",
                    label: "Grandparent",
                    constraints: { refill: true },
                },
                { id: "t:parent", label: "Parent", bind_id: "t:grandparent" },
                { id: "t:child", label: "Child", bind_id: "t:parent" },
            ],
            fields: [],
        };
        b.load(props);

        const api = new CanvasAPI(b, { autoEmitState: false });
        const { editor } = api;

        // Use replaceProps to trigger normalisation
        //@ts-ignore
        editor.replaceProps(props);

        const p = b.getProps();
        const grandparent = p.filters.find((t) => t.id === "t:grandparent")!;
        const parent = p.filters.find((t) => t.id === "t:parent")!;
        const child = p.filters.find((t) => t.id === "t:child")!;

        expect(grandparent.constraints?.["refill"]).toBe(true);
        expect(grandparent.constraints_origin?.["refill"]).toBe(
            "t:grandparent",
        );

        expect(parent.constraints?.["refill"]).toBe(true);
        expect(parent.constraints_origin?.["refill"]).toBe("t:grandparent");

        expect(child.constraints?.["refill"]).toBe(true);
        expect(child.constraints_origin?.["refill"]).toBe("t:grandparent");
    });
    it("maintains constraints_origin even if child has matching local constraint", () => {
        const b = createBuilder({
            serviceMap: {
                s1: {
                    id: 1,
                    flags: { refill: { description: "Refill flag" } },
                } as any,
            },
        });
        const props: ServiceProps = {
            schema_version: "1.0",
            filters: [
                {
                    id: "t:parent",
                    label: "Parent",
                    constraints: { refill: true },
                },
                {
                    id: "t:child",
                    label: "Child",
                    bind_id: "t:parent",
                    constraints: { refill: true },
                },
            ],
            fields: [],
        };
        b.load(props);

        const api = new CanvasAPI(b, { autoEmitState: false });
        //@ts-ignore
        api.editor.replaceProps(props);

        const p = b.getProps();
        const parent = p.filters.find((t) => t.id === "t:parent")!;
        const child = p.filters.find((t) => t.id === "t:child")!;

        expect(parent.constraints?.["refill"]).toBe(true);
        expect(parent.constraints_origin?.["refill"]).toBe("t:parent");

        expect(child.constraints?.["refill"]).toBe(true);
        // Should it be 't:parent' because it's inherited, or 't:child' because it's local?
        // User said: "I hope the constraints origin is set to the ancestor tag that set that flag or constraint in the first place"
        // If parent set it first, then it should be parent.
        expect(child.constraints_origin?.["refill"]).toBe("t:parent");
    });
    it("re-establishes origin when a child defines a DIFFERENT constraint", () => {
        const b = createBuilder({
            serviceMap: {
                s1: {
                    id: 1,
                    flags: { refill: { description: "Refill flag" } },
                } as any,
            },
        });
        const props: ServiceProps = {
            schema_version: "1.0",
            filters: [
                { id: "t:parent", label: "Parent" },
                {
                    id: "t:child",
                    label: "Child",
                    bind_id: "t:parent",
                    constraints: { refill: true },
                },
                { id: "t:grandchild", label: "Grandchild", bind_id: "t:child" },
            ],
            fields: [],
        };
        b.load(props);

        const api = new CanvasAPI(b, { autoEmitState: false });
        //@ts-ignore
        api.editor.replaceProps(props);

        const p = b.getProps();
        const parent = p.filters.find((t) => t.id === "t:parent")!;
        const child = p.filters.find((t) => t.id === "t:child")!;
        const grandchild = p.filters.find((t) => t.id === "t:grandchild")!;

        expect(parent.constraints?.["refill"]).toBeUndefined();

        expect(child.constraints?.["refill"]).toBe(true);
        expect(child.constraints_origin?.["refill"]).toBe("t:child");

        expect(grandchild.constraints?.["refill"]).toBe(true);
        expect(grandchild.constraints_origin?.["refill"]).toBe("t:child");
    });
    it("maintains origin from root even if many tags in between do not have constraints", () => {
        const b = createBuilder({
            serviceMap: {
                s1: {
                    id: 1,
                    flags: { refill: { description: "Refill flag" } },
                } as any,
            },
        });
        const props: ServiceProps = {
            schema_version: "1.0",
            filters: [
                { id: "t:root", label: "Root", constraints: { refill: false } },
                {
                    id: "t:1",
                    bind_id: "t:root",
                    label: "",
                },
                {
                    id: "t:2",
                    bind_id: "t:1",
                    label: "",
                },
                {
                    id: "t:3",
                    bind_id: "t:2",
                    label: "",
                },
                {
                    id: "t:leaf",
                    bind_id: "t:3",
                    label: "",
                },
            ],
            fields: [],
        };
        b.load(props);

        const api = new CanvasAPI(b, { autoEmitState: false });
        //@ts-ignore
        api.editor.replaceProps(props);

        const p = b.getProps();
        const leaf = p.filters.find((t) => t.id === "t:leaf")!;
        expect(leaf.constraints?.["refill"]).toBe(false);
        expect(leaf.constraints_origin?.["refill"]).toBe("t:root");
    });

    it("clearConstraint clears local and affects descendants appropriately", () => {
        const b = createBuilder({
            serviceMap: {
                s1: {
                    id: 1,
                    flags: { refill: { description: "Refill flag" } },
                } as any,
            },
        });
        const props: ServiceProps = {
            schema_version: "1.0",
            filters: [
                { id: "t:root", label: "Root", constraints: { refill: true } },
                { id: "t:child1", label: "Child 1", bind_id: "t:root", constraints: { refill: false } },
                { id: "t:grandchild1", label: "Grandchild 1", bind_id: "t:child1" },
                { id: "t:child2", label: "Child 2", bind_id: "t:root" },
                { id: "t:grandchild2", label: "Grandchild 2", bind_id: "t:child2", constraints: { refill: false } },
            ],
            fields: [],
        };
        b.load(props);

        const api = new CanvasAPI(b, { autoEmitState: false });
        const { editor } = api;

        // Initial state check
        let p = b.getProps();
        let child1 = p.filters.find(t => t.id === "t:child1")!;
        let grandchild1 = p.filters.find(t => t.id === "t:grandchild1")!;
        let grandchild2 = p.filters.find(t => t.id === "t:grandchild2")!;

        // child1 has local false, overrides root's true
        expect(child1.constraints?.["refill"]).toBe(true);
        expect(child1.constraints_origin?.["refill"]).toBe("t:root");
        expect(child1.constraints_overrides?.["refill"]?.from).toBe(false);

        // grandchild1 inherits from child1 (which is overridden by root)
        expect(grandchild1.constraints?.["refill"]).toBe(true);
        expect(grandchild1.constraints_origin?.["refill"]).toBe("t:root");

        // grandchild2 has local false, overrides root's true (via child2 which is transparent)
        expect(grandchild2.constraints?.["refill"]).toBe(true);
        expect(grandchild2.constraints_origin?.["refill"]).toBe("t:root");
        expect(grandchild2.constraints_overrides?.["refill"]?.from).toBe(false);

        // Perform clearConstraint on root
        // @ts-ignore
        editor.clearConstraint("t:root", "refill");

        p = b.getProps();
        let root = p.filters.find(t => t.id === "t:root")!;
        child1 = p.filters.find(t => t.id === "t:child1")!;
        grandchild1 = p.filters.find(t => t.id === "t:grandchild1")!;
        grandchild2 = p.filters.find(t => t.id === "t:grandchild2")!;

        // root constraint should be cleared
        expect(root.constraints?.["refill"]).toBeUndefined();

        // child1 had an override (from: false, to: true). 
        // According to requirement: "if the descendant has an override, just assign that override"
        // This means child1's local should remain false (which it was).
        expect(child1.constraints?.["refill"]).toBe(false);
        expect(child1.constraints_origin?.["refill"]).toBe("t:child1");

        // grandchild2 had an override (from: false, to: true).
        // Its local should remain false.
        expect(grandchild2.constraints?.["refill"]).toBe(false);
        expect(grandchild2.constraints_origin?.["refill"]).toBe("t:grandchild2");

        // Test Undo
        editor.undo();
        p = b.getProps();
        root = p.filters.find(t => t.id === "t:root")!;
        expect(root.constraints?.["refill"]).toBe(true);

        child1 = p.filters.find(t => t.id === "t:child1")!;
        expect(child1.constraints_overrides?.["refill"]).toBeDefined();
        expect(child1.constraints?.["refill"]).toBe(true); // inherited from root

        // Test Redo
        editor.redo();
        p = b.getProps();
        root = p.filters.find(t => t.id === "t:root")!;
        expect(root.constraints?.["refill"]).toBeUndefined();
    });
});
