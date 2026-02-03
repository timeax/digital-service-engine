import { describe, it, expect } from "vitest";
import { createBuilder } from "@/core";
import { createNodeIndex } from "../tag-relations";
import { ServiceProps } from "../../schema";

describe("tag-relations getDescendant - isInherited", () => {
    it("TagNode.getDescendant should mark inherited fields correctly", () => {
        const props: ServiceProps = {
            filters: [
                { id: "t:parent", label: "Parent" },
                { id: "t:child", label: "Child", bind_id: "t:parent" }
            ],
            fields: [
                { id: "f:parent_field", label: "Parent Field", type: "text", bind_id: "t:parent" } as any,
                { id: "f:child_field", label: "Child Field", type: "text", bind_id: "t:child" } as any
            ]
        };

        const builder = createBuilder();
        builder.load(props);
        const index = createNodeIndex(builder);
        
        const childNode = index.getTag("t:child")!;
        
        // f:child_field is directly bound to t:child -> NOT inherited
        const directDescendant = childNode.getDescendant("f:child_field");
        expect(directDescendant).toBeDefined();
        expect(directDescendant?.id).toBe("f:child_field");
        expect(directDescendant?.isInherited).toBeUndefined();

        // f:parent_field is inherited by t:child from t:parent -> SHOULD BE inherited
        const inheritedDescendant = childNode.getDescendant("f:parent_field");
        expect(inheritedDescendant).toBeDefined();
        expect(inheritedDescendant?.id).toBe("f:parent_field");
        expect(inheritedDescendant?.isInherited).toBe(true);
    });

    it("FieldNode.getDescendant (Button) should mark inherited fields correctly", () => {
        const props: ServiceProps = {
            filters: [
                { id: "t:parent", label: "Parent" },
                { id: "t:child", label: "Child", bind_id: "t:parent" }
            ],
            fields: [
                { id: "f:button", label: "Button", type: "custom", button: true, bind_id: "t:child" } as any,
                { id: "f:parent_field", label: "Parent Field", type: "text", bind_id: "t:parent" } as any
            ],
            includes_for_buttons: {
                // f:button does NOT explicitly include f:parent_field
            }
        };

        const builder = createBuilder();
        builder.load(props);
        const index = createNodeIndex(builder);
        
        const buttonNode = index.getField("f:button")!;
        
        // f:parent_field should be visible in t:child context for the button
        // Since it's not explicitly included in includes_for_buttons, it should be marked as inherited
        const inheritedDescendant = buttonNode.getDescendant("f:parent_field", "t:child");
        expect(inheritedDescendant).toBeDefined();
        expect(inheritedDescendant?.id).toBe("f:parent_field");
        expect(inheritedDescendant?.isInherited).toBe(true);

        // If we explicitly include it, it should NOT be inherited
        const props2 = {
            ...props,
            includes_for_buttons: {
                "f:button": ["f:parent_field"]
            }
        };
        const builder2 = createBuilder();
        builder2.load(props2);
        const index2 = createNodeIndex(builder2);
        const buttonNode2 = index2.getField("f:button")!;
        const explicitDescendant = buttonNode2.getDescendant("f:parent_field", "t:child");
        expect(explicitDescendant).toBeDefined();
        expect(explicitDescendant?.id).toBe("f:parent_field");
        expect(explicitDescendant?.isInherited).toBeUndefined();
    });

    it("OptionNode.getDescendant should mark inherited fields correctly", () => {
        const props: ServiceProps = {
            filters: [
                { id: "t:parent", label: "Parent" },
                { id: "t:child", label: "Child", bind_id: "t:parent" }
            ],
            fields: [
                { 
                    id: "f:select", 
                    label: "Select", 
                    type: "select", 
                    bind_id: "t:child",
                    options: [{ id: "o:opt", label: "Option" }] 
                } as any,
                { id: "f:parent_field", label: "Parent Field", type: "text", bind_id: "t:parent" } as any
            ],
            includes_for_buttons: {
                // o:opt does NOT explicitly include f:parent_field
            }
        };

        const builder = createBuilder();
        builder.load(props);
        const index = createNodeIndex(builder);
        
        const optionNode = index.getOption("o:opt")!;
        
        // f:parent_field should be visible in t:child context for the option
        // Since it's not explicitly included in includes_for_buttons, it should be marked as inherited
        const inheritedDescendant = optionNode.getDescendant("f:parent_field", "t:child");
        expect(inheritedDescendant).toBeDefined();
        expect(inheritedDescendant?.id).toBe("f:parent_field");
        expect(inheritedDescendant?.isInherited).toBe(true);
    });
});
