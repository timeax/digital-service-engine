import { describe, expect, it } from "vitest";
import { createBuilder } from "@/core";
import type { ServiceProps } from "@/schema";
import { CanvasAPI } from "../api";

function baseProps(): ServiceProps {
    return {
        schema_version: "1.0",
        filters: [{ id: "t:root", label: "Root" }],
        fields: [{ id: "f:seed", type: "text", bind_id: "t:root", label: "Seed" }],
    };
}

function setup() {
    const b = createBuilder({
        serviceMap: {
            svc1: { id: 1, flags: { refill: { description: "Refill flag" } } } as any,
        },
    });
    b.load(baseProps());
    const api = new CanvasAPI(b, { autoEmitState: false });
    return { b, api, editor: api.editor };
}

function tagIdByLabel(props: ServiceProps, label: string): string {
    const found = props.filters.find((t) => t.label === label);
    if (!found) throw new Error(`tag with label '${label}' not found`);
    return found.id;
}

function fieldIdByLabel(props: ServiceProps, label: string): string {
    const found = props.fields.find((f) => f.label === label);
    if (!found) throw new Error(`field with label '${label}' not found`);
    return found.id;
}

describe("Editor history redo regression", () => {
    it("basic add-node undo/redo restores tag", () => {
        const { b, editor } = setup();
        editor.addTag({ label: "A" });
        const tagId = tagIdByLabel(b.getProps(), "A");
        expect(b.getProps().filters.some((t) => t.id === tagId)).toBe(true);

        expect(editor.undo()).toBe(true);
        expect(b.getProps().filters.some((t) => t.id === tagId)).toBe(false);

        expect(editor.redo()).toBe(true);
        expect(b.getProps().filters.some((t) => t.id === tagId)).toBe(true);
    });

    it("supports multi-step chain undo/redo across structural, property, and rule mutations", () => {
        const { b, editor } = setup();

        editor.addTag({ label: "ChainTag" });
        const tagId = tagIdByLabel(b.getProps(), "ChainTag");
        editor.editLabel(tagId, "ChainTag v2");
        editor.addField({
            label: "ChainField",
            type: "text",
            bind_id: tagId,
        });
        const fieldId = fieldIdByLabel(b.getProps(), "ChainField");
        editor.setFieldQuantityRule(fieldId, { valueBy: "length" });

        expect(editor.getFieldQuantityRule(fieldId)).toEqual({ valueBy: "length" });
        expect(b.getProps().fields.some((f) => f.id === fieldId)).toBe(true);
        expect(b.getProps().filters.find((t) => t.id === tagId)?.label).toBe("ChainTag v2");

        expect(editor.undo()).toBe(true);
        expect(editor.getFieldQuantityRule(fieldId)).toBeUndefined();

        expect(editor.undo()).toBe(true);
        expect(b.getProps().fields.some((f) => f.id === fieldId)).toBe(false);

        expect(editor.undo()).toBe(true);
        expect(b.getProps().filters.find((t) => t.id === tagId)?.label).toBe("ChainTag");

        expect(editor.undo()).toBe(true);
        expect(b.getProps().filters.some((t) => t.id === tagId)).toBe(false);

        expect(editor.redo()).toBe(true);
        expect(b.getProps().filters.some((t) => t.id === tagId)).toBe(true);

        expect(editor.redo()).toBe(true);
        expect(b.getProps().filters.find((t) => t.id === tagId)?.label).toBe("ChainTag v2");

        expect(editor.redo()).toBe(true);
        expect(b.getProps().fields.some((f) => f.id === fieldId)).toBe(true);

        expect(editor.redo()).toBe(true);
        expect(editor.getFieldQuantityRule(fieldId)).toEqual({ valueBy: "length" });
    });

    it("preserves redo branch after undo and discards branch only after new mutation", () => {
        const { b, editor } = setup();

        editor.addTag({ label: "A" }); // A
        const tagId = tagIdByLabel(b.getProps(), "A");
        editor.updateTag(tagId, { label: "B" }); // B
        editor.addField({ label: "CField", type: "text", bind_id: tagId }); // C
        const fieldId = fieldIdByLabel(b.getProps(), "CField");
        expect(b.getProps().fields.some((f) => f.id === fieldId)).toBe(true);

        expect(editor.undo()).toBe(true); // back to B
        expect(b.getProps().fields.some((f) => f.id === fieldId)).toBe(false);

        expect(editor.redo()).toBe(true); // forward to C
        expect(b.getProps().fields.some((f) => f.id === fieldId)).toBe(true);

        expect(editor.undo()).toBe(true); // back to B
        editor.updateTag(tagId, { label: "C" }); // new branch

        expect(editor.redo()).toBe(false);
        expect(b.getProps().fields.some((f) => f.id === fieldId)).toBe(false);
        expect(b.getProps().filters.find((t) => t.id === tagId)?.label).toBe("C");
    });

    it("does not re-push editor history entries on pure undo/redo restore", () => {
        const { editor } = setup();
        editor.addTag({ label: "HistA" });
        editor.addTag({ label: "HistB" });

        const anyEditor = editor as any;
        const lenBeforeUndo = anyEditor.history.length;
        const idxBeforeUndo = anyEditor.index;

        expect(editor.undo()).toBe(true);
        expect(anyEditor.history.length).toBe(lenBeforeUndo);
        expect(anyEditor.index).toBe(idxBeforeUndo - 1);

        expect(editor.redo()).toBe(true);
        expect(anyEditor.history.length).toBe(lenBeforeUndo);
        expect(anyEditor.index).toBe(idxBeforeUndo);
    });

    it("canvas api does not expose undo; editor remains the history owner", () => {
        const { b, api, editor } = setup();
        editor.addTag({ label: "LegacyUndo" });
        const tagId = tagIdByLabel(b.getProps(), "LegacyUndo");
        expect(b.getProps().filters.some((t) => t.id === tagId)).toBe(true);

        expect((api as any).undo).toBeUndefined();

        expect(editor.undo()).toBe(true);
        expect(b.getProps().filters.some((t) => t.id === tagId)).toBe(false);

        expect(editor.redo()).toBe(true);
        expect(b.getProps().filters.some((t) => t.id === tagId)).toBe(true);
    });
});
