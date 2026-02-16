// src/react/inputs/registry/entries/treeselect.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const treeSelectDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "treeselect", // MUST

        // sensible defaults (optional; component already has these defaults)
        multiple: true,
        searchable: true,
        clearable: true,
        expandAll: false,
        leafOnly: false,

        joinControls: true,
        extendBoxToControls: true,
    },

    ui: {
        // shared tuning
        size: sharedUi.size,
        density: sharedUi.density,

        // shared: options + mapping (no className-related stuff)
        ...sharedUi.optionMapping,

        // treeselect-specific: selection mode
        multiple: {
            type: "boolean",
            label: "Multiple",
            description:
                "If enabled, multiple nodes can be selected (emits a string array). If disabled, emits a single string.",
        },

        // shared: search UX
        ...sharedUi.searchUx,

        searchPlaceholder: {
            type: "string",
            label: "Search placeholder",
            description:
                "Placeholder text for the search input within the tree dropdown.",
        },

        emptySearchText: {
            type: "string",
            label: "Empty search text",
            description: "Text shown when search returns no matching nodes.",
        },

        // tree-only UX text (not an InputField placeholder)
        emptyLabel: {
            type: "string",
            label: "Empty label",
            description:
                "Text shown when there are no options/nodes available.",
        },

        // shared-ish picker toggle (allowed)
        clearable: {
            type: "boolean",
            label: "Clearable",
            description: "Allow clearing the current selection.",
        },

        // tree expansion behavior
        expandAll: {
            type: "boolean",
            label: "Expand all",
            description:
                "If enabled, expands all nodes by default when the dropdown opens.",
        },

        defaultExpandedValues: {
            type: "array",
            label: "Default expanded values",
            description:
                "List of node values to expand initially (useful when not expanding everything).",
            editable: true,
            item: {
                type: "string",
                label: "Node value",
                description: "The node value to expand on load.",
            },
        },

        leafOnly: {
            type: "boolean",
            label: "Leaf only",
            description: "If enabled, only leaf nodes can be selected.",
        },

        // shared layout knobs (default-mode only; we keep them since they're booleans)
        joinControls: sharedUi.joinControls,
        extendBoxToControls: sharedUi.extendBoxToControls,
    },
};
