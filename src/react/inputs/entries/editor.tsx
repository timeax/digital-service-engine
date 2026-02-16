// src/react/inputs/registry/entries/editor.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const editorDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "editor", // MUST

        height: "400px",
        previewStyle: "vertical",
        editType: "wysiwyg",
        useCommandShortcut: true,

        // stored value format
        format: "html",

        // toolbar mode (we only support the safe enum values here)
        toolbar: "default",

        pastePlainText: false,
    },

    ui: {
        // editor supports size + density from VariantBaseProps
        size: sharedUi.size,
        density: sharedUi.density,

        height: {
            type: "string",
            label: "Height",
            description: 'Editor height (CSS value, e.g. "400px", "60vh").',
        },

        previewStyle: {
            type: "anyOf",
            label: "Preview style",
            description: "How the preview is displayed (for markdown mode).",
            items: [
                { type: "string", title: "Vertical", value: "vertical" },
                { type: "string", title: "Tab", value: "tab" },
            ],
        },

        editType: {
            type: "anyOf",
            label: "Edit mode",
            description: "Initial editor mode.",
            items: [
                { type: "string", title: "WYSIWYG", value: "wysiwyg" },
                { type: "string", title: "Markdown", value: "markdown" },
            ],
        },

        useCommandShortcut: {
            type: "boolean",
            label: "Command shortcuts",
            description: "Enable editor keyboard shortcuts.",
        },

        format: {
            type: "anyOf",
            label: "Stored format",
            description: "Which format is stored in the form value.",
            items: [
                { type: "string", title: "HTML", value: "html" },
                { type: "string", title: "Markdown", value: "markdown" },
            ],
        },

        toolbar: {
            type: "anyOf",
            label: "Toolbar",
            description:
                'Toolbar mode. "default" uses built-in tools; "none" hides tools and mode switch.',
            items: [
                { type: "string", title: "Default", value: "default" },
                { type: "string", title: "None", value: "none" },
            ],
        },

        pastePlainText: {
            type: "boolean",
            label: "Paste as plain text",
            description: "If enabled, paste is inserted as plain text only.",
        },

        // excluded on purpose:
        // - placeholder (InputField prop; injected by registry helper)
        // - className (not allowed)
        // - toolbar as array (ToastToolbarItem[][] not builder-safe)
    },
};
