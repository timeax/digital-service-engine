// src/react/inputs/registry/entries/keyvalue.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const keyValueDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "keyvalue", // MUST

        min: 0,
        max: Infinity,

        // legacy (optional)
        // minVisible: undefined,
        // maxVisible: undefined,

        showValue: false,

        // text labels (strings are fine; variant accepts ReactNode)
        dialogTitle: "Edit Item",
        keyLabel: "Key",
        valueLabel: "Value",
        submitLabel: "Save Changes",
        emptyLabel: "No items added",
    },

    ui: {
        // keyvalue has its own density union (compact/comfortable/loose)
        size: sharedUi.size,

        density: {
            type: "anyOf",
            label: "Density",
            description: "Vertical spacing preset for chips and controls.",
            items: [
                { type: "string", title: "Compact", value: "compact" },
                { type: "string", title: "Comfortable", value: "comfortable" },
                { type: "string", title: "Loose", value: "loose" },
            ],
        },

        min: {
            type: "number",
            label: "Min items",
            description:
                "Minimum number of entries allowed (prevents deletion below this).",
            minimum: 0,
        },

        max: {
            type: "number",
            label: "Max items",
            description:
                "Maximum number of entries allowed (prevents adding above this).",
            minimum: 0,
        },

        // legacy compatibility knobs
        minVisible: {
            type: "number",
            label: "Min visible (legacy)",
            description:
                "Legacy prop kept for compatibility; no longer drives visibility.",
            minimum: 0,
        },

        maxVisible: {
            type: "number",
            label: "Max visible (legacy)",
            description:
                "Legacy prop kept for compatibility; no longer drives visibility.",
            minimum: 0,
        },

        showValue: {
            type: "boolean",
            label: "Show value inline",
            description:
                'If enabled, inline chips show "key : value". In the dropdown, values are still available via info.',
        },

        dialogTitle: {
            type: "string",
            label: "Dialog title",
            description: "Title shown at the top of the edit dialog.",
        },

        keyLabel: {
            type: "string",
            label: "Key label",
            description: "Label for the key input in the dialog.",
        },

        valueLabel: {
            type: "string",
            label: "Value label",
            description: "Label for the value input in the dialog.",
        },

        submitLabel: {
            type: "string",
            label: "Submit label",
            description: "Text for the dialog submit button.",
        },

        emptyLabel: {
            type: "string",
            label: "Empty label",
            description: "Text shown when there are no entries.",
        },

        // intentionally excluded:
        // - placeholder (InputField prop; injected by registry helper)
        // - moreLabel (function)
        // - className/chipsClassName/chipClassName
        // - renderChip (render function)
    },
};
