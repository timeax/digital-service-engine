import { describe, expect, it, vi } from "vitest";
import { createBuilder } from "@/core";
import { Editor } from "../editor";

function mkEditor(props: any) {
    const builder = createBuilder({});
    builder.load(props);
    const api = {
        undo: vi.fn(),
        refreshGraph: vi.fn(),
        snapshot: vi.fn(),
        emit: vi.fn(),
    };
    return new Editor(builder, api as any);
}

function baseProps() {
    return {
        schema_version: "1.0",
        filters: [{ id: "t:root", label: "Root" }],
        fields: [
            { id: "f:text", type: "text", label: "Text" },
            {
                id: "f:single",
                type: "select",
                label: "Single",
                button: true,
                options: [
                    { id: "o:a", label: "A" },
                    { id: "o:b", label: "B" },
                ],
            },
            {
                id: "f:multi",
                type: "select",
                label: "Multi",
                button: true,
                meta: { multi: true },
                options: [
                    {
                        id: "o:parent",
                        label: "Parent",
                        children: [{ id: "o:child", label: "Child" }],
                    },
                    { id: "o:c", label: "C" },
                ],
            },
            { id: "f:button", type: "button", label: "Button", button: true },
            { id: "f:regular", type: "text", label: "Regular" },
        ],
    };
}

describe("Editor field defaultValue helpers", () => {
    it("sets, gets, clears, and restores scalar field defaults", () => {
        const editor = mkEditor(baseProps());

        editor.setFieldDefaultValue("f:text", "hello");
        expect(editor.getFieldDefaultValue("f:text")).toBe("hello");
        expect(
            editor.getProps().fields.find((field) => field.id === "f:text")
                ?.defaultValue,
        ).toBe("hello");

        editor.clearFieldDefaultValue("f:text");
        expect(editor.getFieldDefaultValue("f:text")).toBeUndefined();

        editor.undo();
        expect(editor.getFieldDefaultValue("f:text")).toBe("hello");

        editor.redo();
        expect(editor.getFieldDefaultValue("f:text")).toBeUndefined();
    });

    it("normalizes selectable defaults and clears invalid/empty values", () => {
        const editor = mkEditor(baseProps());

        editor.setFieldDefaultValue("f:single", ["o:a", "o:b", "o:a"]);
        expect(editor.getFieldDefaultValue("f:single")).toBe("o:b");

        editor.setFieldDefaultValue("f:multi", [
            "o:child",
            "o:ghost",
            "o:child",
            "o:c",
        ]);
        expect(editor.getFieldDefaultValue("f:multi")).toEqual([
            "o:child",
            "o:c",
        ]);

        editor.setFieldDefaultValue("f:multi", ["o:ghost"]);
        expect(editor.getFieldDefaultValue("f:multi")).toBeUndefined();
    });

    it("clears default values for many fields without touching host defaults", () => {
        const editor = mkEditor({
            ...baseProps(),
            fields: [
                {
                    id: "f:text",
                    type: "text",
                    label: "Text",
                    defaultValue: "customer",
                    defaults: { value: "host" },
                },
                {
                    id: "f:regular",
                    type: "text",
                    label: "Regular",
                    defaultValue: "other",
                },
            ],
        });

        editor.clearFieldDefaultValuesMany(["f:text"]);
        const props = editor.getProps();
        expect(
            props.fields.find((field) => field.id === "f:text")?.defaultValue,
        ).toBeUndefined();
        expect(
            props.fields.find((field) => field.id === "f:text")?.defaults,
        ).toEqual({ value: "host" });
        expect(
            props.fields.find((field) => field.id === "f:regular")
                ?.defaultValue,
        ).toBe("other");
    });
});

describe("Editor value effect helpers", () => {
    it("sets, patches, clears, and restores value effects", () => {
        const editor = mkEditor(baseProps());

        editor.setValueEffect("t:root", "f:text", {
            value: "alpha",
            mode: "if_empty",
            clearOnDeactivate: true,
        });
        expect(editor.getProps().value_effects_for_triggers).toEqual({
            "t:root": {
                "f:text": {
                    value: "alpha",
                    mode: "if_empty",
                    clearOnDeactivate: true,
                },
            },
        });

        editor.patchValueEffect("t:root", "f:text", {
            value: "beta",
            mode: "invalid" as any,
            clearOnDeactivate: false,
        });
        expect(
            editor.getProps().value_effects_for_triggers?.["t:root"]?.[
                "f:text"
            ],
        ).toEqual({ value: "beta" });

        editor.clearValueEffect("t:root", "f:text");
        expect(editor.getProps().value_effects_for_triggers).toBeUndefined();

        editor.undo();
        expect(
            editor.getProps().value_effects_for_triggers?.["t:root"]?.[
                "f:text"
            ],
        ).toEqual({ value: "beta" });

        editor.redo();
        expect(editor.getProps().value_effects_for_triggers).toBeUndefined();
    });

    it("supports tag, button, and option triggers with selectable target ownership", () => {
        const editor = mkEditor(baseProps());

        editor.setValueEffect("f:button", "f:single", {
            value: ["o:a", "o:b"],
        });
        editor.setValueEffect("o:child", "f:multi", {
            value: ["o:child", "o:c", "o:child"],
            mode: "always",
        });

        expect(
            editor.getProps().value_effects_for_triggers?.["f:button"]?.[
                "f:single"
            ],
        ).toEqual({ value: "o:b" });
        expect(
            editor.getProps().value_effects_for_triggers?.["o:child"]?.[
                "f:multi"
            ],
        ).toEqual({ value: ["o:child", "o:c"], mode: "always" });

        expect(() =>
            editor.setValueEffect("f:regular", "f:text", { value: "x" }),
        ).toThrow(
            "value effect trigger must be a tag id, option id, or button field id",
        );
        expect(() =>
            editor.setValueEffect("t:root", "f:ghost", { value: "x" }),
        ).toThrow("value effect target field not found");
        expect(() =>
            editor.setValueEffect("t:root", "f:single", { value: "o:ghost" }),
        ).toThrow("value effect option not found");
        expect(() =>
            editor.setValueEffect("f:button::o:a", "f:text", { value: "x" }),
        ).toThrow("composite/path id");
    });

    it("clears value effects for trigger and target", () => {
        const editor = mkEditor(baseProps());

        editor.setValueEffect("t:root", "f:text", { value: "root" });
        editor.setValueEffect("f:button", "f:text", { value: "button" });
        editor.setValueEffect("o:child", "f:single", { value: "o:a" });

        editor.clearValueEffectsForTrigger("f:button");
        expect(
            editor.getProps().value_effects_for_triggers?.["f:button"],
        ).toBeUndefined();

        editor.undo();
        expect(
            editor.getProps().value_effects_for_triggers?.["f:button"]?.[
                "f:text"
            ],
        ).toEqual({ value: "button" });

        editor.redo();
        expect(
            editor.getProps().value_effects_for_triggers?.["f:button"],
        ).toBeUndefined();

        editor.clearValueEffectsForTarget("f:text");
        expect(editor.getProps().value_effects_for_triggers).toEqual({
            "o:child": { "f:single": { value: "o:a" } },
        });

        editor.undo();
        expect(editor.getProps().value_effects_for_triggers).toEqual({
            "t:root": { "f:text": { value: "root" } },
            "o:child": { "f:single": { value: "o:a" } },
        });

        editor.redo();
        expect(editor.getProps().value_effects_for_triggers).toEqual({
            "o:child": { "f:single": { value: "o:a" } },
        });
    });

    it("cleans removed fields, options, and demoted button triggers", () => {
        const editor = mkEditor({
            ...baseProps(),
            value_effects_for_triggers: {
                "f:button": {
                    "f:text": { value: "owned" },
                },
                "o:child": {
                    "f:multi": { value: ["o:child", "o:c"] },
                },
                "t:root": {
                    "f:single": { value: "o:a" },
                },
            },
        });

        editor.removeOption("o:child");
        expect(
            editor.getProps().value_effects_for_triggers?.["o:child"],
        ).toBeUndefined();

        editor.removeField("f:single");
        expect(
            editor.getProps().value_effects_for_triggers?.["t:root"],
        ).toBeUndefined();

        editor.updateField("f:button", { button: false });
        expect(
            editor.getProps().value_effects_for_triggers?.["f:button"],
        ).toBeUndefined();

        editor.undo();
        expect(
            editor.getProps().value_effects_for_triggers?.["f:button"]?.[
                "f:text"
            ],
        ).toEqual({ value: "owned" });
    });

    it("clearRelationsMany removes owned and incoming value effects", () => {
        const editor = mkEditor({
            ...baseProps(),
            value_effects_for_triggers: {
                "f:button": {
                    "f:text": { value: "owned" },
                },
                "t:root": {
                    "f:single": { value: "o:a" },
                    "f:multi": { value: ["o:child", "o:c"] },
                },
            },
        });

        editor.clearRelationsMany(["f:button", "f:single", "o:child"], "both");
        expect(
            editor.getProps().value_effects_for_triggers?.["f:button"],
        ).toBeUndefined();
        expect(editor.getProps().value_effects_for_triggers).toEqual({
            "t:root": {
                "f:multi": { value: ["o:c"] },
            },
        });
    });
});
