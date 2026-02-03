import { describe, it, expect } from "vitest";
import { createBuilder } from "@/core";
import { createNodeIndex } from "../tag-relations";
import { ServiceProps } from "../../schema";

describe("tag-relations includes/excludes", () => {
    it("should populate includes/excludes for TagNode", () => {
        const props: ServiceProps = {
            filters: [
                {
                    id: "t1",
                    label: "Tag 1",
                    includes: ["inc1", "inc2"],
                    excludes: ["exc1"]
                }
            ],
            fields: []
        };

        const builder = createBuilder();
        builder.load(props);
        const index = createNodeIndex(builder);
        const node = index.getTag("t1");

        expect(node).toBeDefined();
        expect(node?.includes.has("inc1")).toBe(true);
        expect(node?.includes.has("inc2")).toBe(true);
        expect(node?.includes.has("other")).toBe(false);
        expect(node?.excludes.has("exc1")).toBe(true);
    });

    it("should populate includes/excludes for FieldNode (buttons)", () => {
        const props: ServiceProps = {
            filters: [],
            fields: [
                {
                    id: "f1",
                    label: "Button 1",
                    type: "custom",
                    button: true,
                } as any,
                {
                    id: "f2",
                    label: "Regular Field",
                    type: "text",
                } as any
            ],
            includes_for_buttons: {
                "f1": ["btn_inc"]
            },
            excludes_for_buttons: {
                "f1": ["btn_exc"]
            }
        };

        const builder = createBuilder();
        builder.load(props);
        const index = createNodeIndex(builder);
        
        const btnNode = index.getField("f1");
        expect(btnNode?.includes.has("btn_inc")).toBe(true);
        expect(btnNode?.excludes.has("btn_exc")).toBe(true);

        const regNode = index.getField("f2");
        expect(regNode?.includes.size).toBe(0);
        expect(regNode?.excludes.size).toBe(0);
    });

    it("should populate includes/excludes for OptionNode (options are buttons by default)", () => {
        const props: ServiceProps = {
            filters: [],
            fields: [
                {
                    id: "f1",
                    label: "Field",
                    type: "select",
                    options: [{ id: "o1", label: "Option 1" }]
                } as any
            ],
            includes_for_buttons: {
                "o1": ["opt_inc"]
            },
            excludes_for_buttons: {
                "o1": ["opt_exc"]
            }
        };

        const builder = createBuilder();
        builder.load(props);
        const index = createNodeIndex(builder);
        const optNode = index.getOption("o1");
        expect(optNode?.includes.has("opt_inc")).toBe(true);
        expect(optNode?.excludes.has("opt_exc")).toBe(true);
        expect(optNode?.isInherited).toBeUndefined();
    });

    it("should have empty sets for UnknownNode", () => {
        const props: ServiceProps = {
            filters: [],
            fields: []
        };

        const builder = createBuilder();
        builder.load(props);
        const index = createNodeIndex(builder);
        const unkNode = index.getNode("unknown");
        expect(unkNode.kind).toBe("unknown");
        expect(unkNode.includes.size).toBe(0);
        expect(unkNode.excludes.size).toBe(0);
        expect(unkNode.isInherited).toBeUndefined();
    });
});
