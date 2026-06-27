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

describe("Editor includes/excludes", () => {
    it("should add include to a tag", () => {
        const props = {
            filters: [{ id: "t:1", label: "Tag 1" }],
            fields: [{ id: "f:1", label: "Field 1" }],
        };
        const editor = mkEditor(props);
        editor.include("t:1", "f:1");

        const nextProps = editor.getProps();
        expect(nextProps.filters![1].includes).toEqual(["f:1"]);
    });

    it("should remove from excludes when adding to includes", () => {
        const props = {
            filters: [{ id: "t:1", label: "Tag 1", excludes: ["f:1"] }],
            fields: [{ id: "f:1", label: "Field 1" }],
        };
        const editor = mkEditor(props);
        editor.include("t:1", "f:1");

        const nextProps = editor.getProps();
        expect(nextProps.filters![1].includes).toEqual(["f:1"]);
        expect(nextProps.filters![1].excludes).toBeUndefined();
    });

    it("should add include to a button field", () => {
        const props = {
            filters: [],
            fields: [{ id: "f:btn", label: "Button", button: true }, { id: "f:1", label: "Field 1" }],
        };
        const editor = mkEditor(props);
        editor.include("f:btn", "f:1");

        const nextProps = editor.getProps();
        expect(nextProps.includes_for_buttons?.["f:btn"]).toContain("f:1");
    });

    it("should prevent cycle: A includes B, B includes A", () => {
        const props = {
            filters: [
                { id: "t:A", label: "A" },
                { id: "t:B", label: "B" },
            ],
            fields: [],
        };
        const editor = mkEditor(props);
        editor.include("t:A", "t:B");
        
        // This should be blocked by cycle detection
        const emitSpy = (editor as any).api.emit;
        editor.include("t:B", "t:A");
        
        const nextProps = editor.getProps();
        expect(nextProps.filters?.find(t => t.id === "t:B")?.includes).toBeUndefined();
        expect(emitSpy).toHaveBeenCalledWith("editor:error", expect.objectContaining({
            code: "cycle_detected"
        }));
    });

    it("should prevent cycle: A includes B, B excludes A", () => {
        const props = {
            filters: [
                { id: "t:A", label: "A" },
                { id: "t:B", label: "B" },
            ],
            fields: [],
        };
        const editor = mkEditor(props);
        editor.include("t:A", "t:B");
        
        const emitSpy = (editor as any).api.emit;
        editor.exclude("t:B", "t:A");
        
        const nextProps = editor.getProps();
        expect(nextProps.filters?.find(t => t.id === "t:B")?.excludes).toBeUndefined();
        expect(emitSpy).toHaveBeenCalledWith("editor:error", expect.objectContaining({
            code: "cycle_detected"
        }));
    });

    it("should throw error if receiver is not a tag, button, or option", () => {
        const props = {
            filters: [],
            fields: [{ id: "f:reg", label: "Regular", button: false }],
        };
        const editor = mkEditor(props);
        expect(() => editor.include("f:reg", "t:any")).toThrow("Receiver must be a tag, button field, or option");
    });

    it("should reject option-container fields as field-level include/exclude receivers", () => {
        const props = {
            filters: [{ id: "t:1", label: "Tag 1" }],
            fields: [
                {
                    id: "f:mode",
                    label: "Mode",
                    button: true,
                    options: [{ id: "o:fast", label: "Fast" }],
                },
            ],
        };
        const editor = mkEditor(props);

        expect(() => editor.include("f:mode", "t:1")).toThrow("Receiver must be a tag, button field, or option");
    });

    it("should handle excludes for options", () => {
        const props = {
            filters: [{ id: "t:1", label: "Tag 1" }],
            fields: [
                { 
                    id: "f:1", 
                    label: "Field 1", 
                    options: [{ id: "o:1", label: "Opt 1" }] 
                }
            ],
        };
        const editor = mkEditor(props);
        editor.exclude("o:1", "t:1");

        const nextProps = editor.getProps();
        expect(nextProps.excludes_for_buttons?.["o:1"]).toContain("t:1");
    });

    it("clears stale field button maps when a button field stops qualifying", () => {
        const props = {
            filters: [],
            fields: [{ id: "f:btn", label: "Button", button: true }, { id: "f:1", label: "Field 1" }],
            includes_for_buttons: { "f:btn": ["f:1"] },
            excludes_for_buttons: { "f:btn": ["f:1"] },
        };
        const editor = mkEditor(props);

        editor.updateField("f:btn", { button: false });

        let nextProps = editor.getProps();
        expect(nextProps.includes_for_buttons?.["f:btn"]).toBeUndefined();
        expect(nextProps.excludes_for_buttons?.["f:btn"]).toBeUndefined();

        editor.undo();

        nextProps = editor.getProps();
        expect(nextProps.includes_for_buttons?.["f:btn"]).toEqual(["f:1"]);
        expect(nextProps.excludes_for_buttons?.["f:btn"]).toEqual(["f:1"]);
    });
});

describe("Editor option effects", () => {
    const baseProps = () => ({
        filters: [{ id: "t:root", label: "Root" }],
        fields: [
            {
                id: "f:button",
                label: "Button",
                button: true,
            },
            {
                id: "f:trigger",
                label: "Trigger",
                type: "select",
                options: [
                    {
                        id: "o:parent",
                        label: "Parent",
                        children: [{ id: "o:child", label: "Child" }],
                    },
                ],
            },
            {
                id: "f:target",
                label: "Target",
                type: "select",
                options: [
                    { id: "o:a", label: "A" },
                    {
                        id: "o:group",
                        label: "Group",
                        children: [{ id: "o:b", label: "B" }],
                    },
                ],
            },
            {
                id: "f:regular",
                label: "Regular",
                type: "text",
            },
        ],
    });

    it("sets, patches, and clears a target option effect", () => {
        const editor = mkEditor(baseProps());

        editor.setOptionEffect("o:child", "f:target", {
            forceVisible: true,
            include: ["o:a", "o:b", "o:a"],
            exclude: ["o:a"],
        });

        expect(editor.getProps().option_effects_for_buttons).toEqual({
            "o:child": {
                "f:target": {
                    forceVisible: true,
                    include: ["o:b"],
                    exclude: ["o:a"],
                },
            },
        });

        editor.patchOptionEffect("o:child", "f:target", {
            include: ["o:a", "o:b"],
        });

        expect(
            editor.getProps().option_effects_for_buttons?.["o:child"]?.[
                "f:target"
            ],
        ).toEqual({
            forceVisible: true,
            include: ["o:b"],
            exclude: ["o:a"],
        });

        editor.clearOptionEffect("o:child", "f:target");
        expect(editor.getProps().option_effects_for_buttons).toBeUndefined();
    });

    it("adds/removes include and exclude option ids and toggles forceVisible", () => {
        const editor = mkEditor(baseProps());

        editor.addOptionEffectOptions("f:button", "f:target", "include", [
            "o:a",
            "o:b",
            "o:a",
        ]);
        editor.addOptionEffectOptions("f:button", "f:target", "exclude", [
            "o:a",
        ]);
        editor.setOptionEffectForceVisible("f:button", "f:target", true);

        expect(
            editor.getProps().option_effects_for_buttons?.["f:button"]?.[
                "f:target"
            ],
        ).toEqual({
            forceVisible: true,
            include: ["o:b"],
            exclude: ["o:a"],
        });

        editor.removeOptionEffectOptions("f:button", "f:target", "exclude", [
            "o:a",
        ]);
        editor.setOptionEffectForceVisible("f:button", "f:target", false);

        expect(
            editor.getProps().option_effects_for_buttons?.["f:button"]?.[
                "f:target"
            ],
        ).toEqual({ include: ["o:b"] });
    });

    it("rejects invalid triggers, targets, target options, and composite ids", () => {
        const editor = mkEditor(baseProps());

        expect(() =>
            editor.setOptionEffect("t:root", "f:target", { include: ["o:a"] }),
        ).toThrow("option effect trigger must be an option id or button field id");
        expect(() =>
            editor.setOptionEffect("f:regular", "f:target", {
                include: ["o:a"],
            }),
        ).toThrow("option effect trigger must be an option id or button field id");
        expect(() =>
            editor.setOptionEffect("o:child", "f:ghost", { include: ["o:a"] }),
        ).toThrow("option effect target field not found");
        expect(() =>
            editor.setOptionEffect("o:child", "f:target", {
                include: ["o:ghost"],
            }),
        ).toThrow("option effect include option not found");
        expect(() =>
            editor.setOptionEffect("f:trigger::o:child", "f:target", {
                include: ["o:a"],
            }),
        ).toThrow("composite/path id");
    });

    it("cleans option effects when options or target fields are removed", () => {
        const editor = mkEditor({
            ...baseProps(),
            option_effects_for_buttons: {
                "o:child": {
                    "f:target": {
                        forceVisible: true,
                        include: ["o:a", "o:b"],
                        exclude: ["o:b"],
                    },
                },
            },
        });

        editor.removeOption("o:b");
        expect(
            editor.getProps().option_effects_for_buttons?.["o:child"]?.[
                "f:target"
            ],
        ).toEqual({ forceVisible: true, include: ["o:a"] });

        editor.removeField("f:target");
        expect(editor.getProps().option_effects_for_buttons).toBeUndefined();
    });

    it("cleans option effects when a button field stops qualifying and undo restores them", () => {
        const editor = mkEditor({
            ...baseProps(),
            option_effects_for_buttons: {
                "f:button": {
                    "f:target": { include: ["o:a"] },
                },
            },
        });

        editor.updateField("f:button", { button: false });
        expect(editor.getProps().option_effects_for_buttons).toBeUndefined();

        editor.undo();
        expect(editor.getProps().option_effects_for_buttons).toEqual({
            "f:button": {
                "f:target": { include: ["o:a"] },
            },
        });
    });

    it("duplicates option effects with raw ids when copyOptionMaps is enabled", () => {
        const editor = mkEditor({
            ...baseProps(),
            option_effects_for_buttons: {
                "o:child": {
                    "f:target": { include: ["o:b"] },
                },
            },
        });

        const newFieldId = editor.duplicate(
            { kind: "field", id: "f:trigger" },
            {
                copyOptionMaps: true,
                optionIdStrategy: (old) => `${old}:copy`,
            },
        );

        expect(newFieldId).not.toBe("f:trigger");
        const copiedChild = editor
            .getProps()
            .fields.find((field) => field.id === newFieldId)
            ?.options?.[0]?.children?.[0]?.id;

        expect(copiedChild).toBe("o:child:copy");
        expect(
            editor.getProps().option_effects_for_buttons?.[copiedChild!]?.[
                "f:target"
            ],
        ).toEqual({ include: ["o:b"] });
    });
});
