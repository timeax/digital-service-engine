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
});
