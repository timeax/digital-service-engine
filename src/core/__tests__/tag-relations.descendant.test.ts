import { describe, it, expect } from "vitest";
import { createBuilder } from "@/core";
import { createNodeIndex } from "../tag-relations";
import { ServiceProps } from "../../schema";

describe("tag-relations getDescendant", () => {
    const props: ServiceProps = {
        filters: [
            { id: "t:parent", label: "Parent" },
            { id: "t:child", label: "Child", bind_id: "t:parent" },
            { id: "t:standalone", label: "Standalone", includes: ["f:included"] }
        ],
        fields: [
            { id: "f:bound", label: "Bound Field", type: "text", bind_id: "t:parent" } as any,
            { id: "f:included", label: "Included Field", type: "text" } as any,
            { id: "f:button", label: "Button", type: "custom", button: true, bind_id: ["t:parent"] } as any
        ],
        includes_for_buttons: {
            "f:button": ["f:included"]
        }
    };

    const builder = createBuilder();
    builder.load(props);
    const index = createNodeIndex(builder);

    describe("TagNode.getDescendant", () => {
        it("should return explicitly bound field as non-inherited", () => {
            const parent = index.getTag("t:parent")!;
            const descendant = parent.getDescendant("f:bound");
            expect(descendant).toBeDefined();
            expect(descendant?.id).toBe("f:bound");
            expect(descendant?.isInherited).toBeUndefined();
        });

        it("should return explicitly included field as non-inherited", () => {
            const standalone = index.getTag("t:standalone")!;
            const descendant = standalone.getDescendant("f:included");
            expect(descendant).toBeDefined();
            expect(descendant?.id).toBe("f:included");
            expect(descendant?.isInherited).toBeUndefined();
        });

        it("should return undefined for fields bound to descendant tags", () => {
            const props2: ServiceProps = {
                filters: [
                    { id: "t:p", label: "P" },
                    { id: "t:c", label: "C", bind_id: "t:p" }
                ],
                fields: [
                    { id: "f:c_field", label: "C Field", type: "text", bind_id: "t:c" } as any
                ]
            };
            const builder2 = createBuilder();
            builder2.load(props2);
            const index2 = createNodeIndex(builder2);
            const p = index2.getTag("t:p")!;
            const descendant = p.getDescendant("f:c_field");
            
            expect(descendant).toBeUndefined();
        });

        it("should return undefined for unrelated nodes", () => {
            const standalone = index.getTag("t:standalone")!;
            const descendant = standalone.getDescendant("t:parent");
            expect(descendant).toBeUndefined();
        });
    });

    describe("FieldNode.getDescendant (Button)", () => {
        it("should return explicitly included node as non-inherited", () => {
            const button = index.getField("f:button")!;
            const descendant = button.getDescendant("f:included");
            expect(descendant).toBeDefined();
            expect(descendant?.id).toBe("f:included");
            expect(descendant?.isInherited).toBeUndefined();
        });

        it("should return undefined for nodes in bound tags (no inheritance for buttons anymore)", () => {
            const button = index.getField("f:button")!;
            // f:button is bound to t:parent. t:child is a descendant of t:parent.
            const descendant = button.getDescendant("t:child");
            expect(descendant).toBeUndefined();
        });

        it("should return undefined for nodes outside of context", () => {
            const button = index.getField("f:button")!;
            const descendant = button.getDescendant("t:standalone");
            expect(descendant).toBeUndefined();
        });
    });

    describe("OptionNode.getDescendant", () => {
        const props: ServiceProps = {
            filters: [
                { id: "t:p", label: "P" },
                { id: "t:c", label: "C", bind_id: "t:p" },
                { id: "t:standalone", label: "S" }
            ],
            fields: [
                {
                    id: "f:select",
                    label: "Select",
                    type: "select",
                    bind_id: "t:p",
                    options: [{ id: "o:opt", label: "Opt" }]
                } as any,
                { id: "f:extra", label: "Extra", type: "text" } as any
            ],
            includes_for_buttons: {
                "o:opt": ["f:extra"]
            }
        };
        const builder = createBuilder();
        builder.load(props);
        const idx = createNodeIndex(builder);

        it("should return explicitly included node as non-inherited", () => {
            const opt = idx.getOption("o:opt")!;
            const descendant = opt.getDescendant("f:extra");
            expect(descendant).toBeDefined();
            expect(descendant?.id).toBe("f:extra");
            expect(descendant?.isInherited).toBeUndefined();
        });

        it("should return undefined for nodes in bound tags (no inheritance for options anymore)", () => {
            const opt = idx.getOption("o:opt")!;
            // owner field is bound to t:p. t:c is a descendant of t:p.
            const descendant = opt.getDescendant("t:c");
            expect(descendant).toBeUndefined();
        });

        it("should return undefined for unrelated nodes", () => {
            const opt = idx.getOption("o:opt")!;
            const descendant = opt.getDescendant("f:select"); 
            expect(descendant).toBeUndefined();
        });
    });

    describe("getDescendants", () => {
        const props: ServiceProps = {
            filters: [
                { id: "t:p", label: "P" },
                { id: "t:c", label: "C", bind_id: "t:p" },
                { id: "t:s", label: "S", includes: ["f:inc"] }
            ],
            fields: [
                { id: "f:p", label: "P Field", type: "text", bind_id: "t:p" } as any,
                { id: "f:c", label: "C Field", type: "text", bind_id: "t:c" } as any,
                { id: "f:inc", label: "Inc Field", type: "text" } as any,
                {
                    id: "f:btn",
                    label: "Btn",
                    type: "custom",
                    button: true,
                    bind_id: ["t:p"],
                    options: [{ id: "o:opt", label: "Opt" }]
                } as any
            ],
            includes_for_buttons: {
                "f:btn": ["f:inc"]
            }
        };
        const builder = createBuilder();
        builder.load(props);
        const idx = createNodeIndex(builder);

        it("TagNode should return visible field descendants only", () => {
            const p = idx.getTag("t:p")!;
            const descendants = p.getDescendants();

            const ids = descendants.map(d => d.id);
            expect(ids).toContain("f:p"); // bound field
            expect(ids).toContain("f:btn"); // bound field
            expect(ids).not.toContain("f:c"); // f:c is bound to t:c, should NOT be descendant of t:p
            expect(ids).not.toContain("f:inc"); // included under t:s only

            const f_p = descendants.find(d => d.id === "f:p")!;
            expect(f_p.isInherited).toBeUndefined();
        });

        it("FieldNode (button) should return only explicitly included descendants", () => {
            const btn = idx.getField("f:btn")!;
            const descendants = btn.getDescendants();

            const ids = descendants.map(d => d.id);
            expect(ids).toContain("f:inc"); // explicitly included
            expect(ids).not.toContain("f:c"); // no longer inherited from t:p
            expect(ids).not.toContain("f:p"); // no longer inherited from t:p

            const f_inc = descendants.find(d => d.id === "f:inc")!;
            expect(f_inc.isInherited).toBeUndefined();
        });

        it("OptionNode should return only explicitly included descendants", () => {
            const opt = idx.getOption("o:opt")!;
            const descendants = opt.getDescendants();

            expect(descendants.length).toBe(0); // o:opt has no includes
        });
    });
});
