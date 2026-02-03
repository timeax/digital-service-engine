import { describe, it, expect } from "vitest";
import { createBuilder } from "@/core";
import { createNodeIndex } from "../tag-relations";
import { ServiceProps } from "../../schema";

describe("tag-relations explicit inheritance rules", () => {
    it("Parent tag should NOT inherit fields from its child tags", () => {
        const props: ServiceProps = {
            filters: [
                { id: "t:parent", label: "Parent" },
                { id: "t:child", label: "Child", bind_id: "t:parent" }
            ],
            fields: [
                { id: "f:child_field", label: "Child Field", type: "text", bind_id: "t:child" } as any
            ]
        };

        const builder = createBuilder();
        builder.load(props);
        const index = createNodeIndex(builder);
        const parent = index.getTag("t:parent")!;
        const child = index.getTag("t:child")!;
        
        // Sanity checks
        expect(child.isBoundTo("t:parent")).toBe(true);
        expect(index.getField("f:child_field")?.isBoundTo("t:child")).toBe(true);

        // EXPLICIT CHECK: Parent should NOT see child's field as descendant
        expect(parent.getDescendant("f:child_field")).toBeUndefined();
        
        const parentDescendants = parent.getDescendants();
        const parentDescendantIds = parentDescendants.map(d => d.id);
        
        expect(parentDescendantIds).not.toContain("t:child");
        expect(parentDescendantIds).not.toContain("f:child_field");
    });

    it("Parent tag SHOULD see its own bound fields", () => {
        const props: ServiceProps = {
            filters: [
                { id: "t:parent", label: "Parent" }
            ],
            fields: [
                { id: "f:parent_field", label: "Parent Field", type: "text", bind_id: "t:parent" } as any
            ]
        };

        const builder = createBuilder();
        builder.load(props);
        const index = createNodeIndex(builder);
        const parent = index.getTag("t:parent")!;
        
        expect(parent.getDescendant("f:parent_field")).toBeDefined();
        expect(parent.getDescendants().map(d => d.id)).toContain("f:parent_field");
    });

    it("Parent tag SHOULD see fields explicitly included, even if they are bound to children", () => {
        const props: ServiceProps = {
            filters: [
                { id: "t:parent", label: "Parent", includes: ["f:child_field"] },
                { id: "t:child", label: "Child", bind_id: "t:parent" }
            ],
            fields: [
                { id: "f:child_field", label: "Child Field", type: "text", bind_id: "t:child" } as any
            ]
        };

        const builder = createBuilder();
        builder.load(props);
        const index = createNodeIndex(builder);
        const parent = index.getTag("t:parent")!;
        
        // EXPLICIT CHECK: Parent sees it because of 'includes'
        const descendant = parent.getDescendant("f:child_field");
        expect(descendant).toBeDefined();
        expect(descendant?.id).toBe("f:child_field");
        expect(descendant?.isInherited).toBeUndefined(); // Explicitly included is NOT inherited
        
        expect(parent.getDescendants().map(d => d.id)).toContain("f:child_field");
    });
});
