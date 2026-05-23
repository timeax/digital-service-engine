// src/react/inputs/registry/entries/chips.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const chipsDescriptor: InputDescriptor = {
    Component: InputField as any,
    options: {
        supported: false,
    },

    defaultProps: {
        variant: "chips", // MUST

        // sensible defaults (these match the variant defaults)
        addOnEnter: true,
        addOnTab: true,
        addOnBlur: true,
        allowDuplicates: false,
        backspaceRemovesLast: true,
        clearable: false,
        textareaMode: false,
        placement: "inline",
    },

    ui: {
        // chips "also supports most ShadcnTextVariantProps" (size/density/etc.)
        size: sharedUi.size,
        density: sharedUi.density,
        ...sharedUi.padding,
        joinControls: sharedUi.joinControls,
        extendBoxToControls: sharedUi.extendBoxToControls,

        // NOTE: placeholder is an InputField prop in your system — exclude it here.

        separators: {
            type: "array",
            label: "Separators",
            description:
                'Separators used to split raw input into chips (strings only in builder UI). Runtime default: [",", ";"].',
            editable: true,
            item: {
                type: "string",
                label: "Separator",
                description: 'A string separator (e.g. "," or ";").',
            },
        },

        addOnEnter: {
            type: "boolean",
            label: "Add on Enter",
            description: "Commit chips when the user presses Enter.",
        },

        addOnTab: {
            type: "boolean",
            label: "Add on Tab",
            description: "Commit chips when the user presses Tab.",
        },

        addOnBlur: {
            type: "boolean",
            label: "Add on blur",
            description: "Commit chips when the input loses focus.",
        },

        allowDuplicates: {
            type: "boolean",
            label: "Allow duplicates",
            description: "If disabled, duplicate chips are ignored.",
        },

        maxChips: {
            type: "number",
            label: "Max chips",
            description:
                "Maximum number of chips allowed. Leave unset for unlimited.",
            minimum: 1,
        },

        backspaceRemovesLast: {
            type: "boolean",
            label: "Backspace removes last",
            description:
                "If enabled, Backspace on an empty input removes the last chip.",
        },

        clearable: {
            type: "boolean",
            label: "Clearable",
            description: "Show a clear-all button.",
        },

        maxVisibleChips: {
            type: "number",
            label: "Max visible chips",
            description:
                'Maximum number of chips to render before summarizing the rest as "+N more".',
            minimum: 1,
        },

        maxChipChars: {
            type: "number",
            label: "Max chip chars",
            description:
                "Soft cap for chip display label length (UI-only; value is not truncated).",
            minimum: 1,
        },

        maxChipWidth: {
            type: "string",
            label: "Max chip width",
            description:
                'Soft cap for chip label width (CSS value, e.g. "160px" or "12rem").',
        },

        textareaMode: {
            type: "boolean",
            label: "Textarea mode",
            description:
                "Use a textarea entry control instead of a single-line input.",
        },

        placement: {
            type: "anyOf",
            label: "Placement",
            description:
                "Where chips are rendered relative to the entry control.",
            items: [
                { type: "string", title: "Inline", value: "inline" },
                { type: "string", title: "Below", value: "below" },
            ],
        },
    },
};
