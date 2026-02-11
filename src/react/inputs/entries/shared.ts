// src/react/inputs/registry/shared.ts
import type { Ui } from "@/schema";

export const sharedUi = {
    // ─────────────────────────────────────────────
    // Layout: join controls (text + select)
    // ─────────────────────────────────────────────
    joinControls: {
        type: "boolean",
        label: "Join controls",
        description:
            "If enabled and there are controls, the input and controls share one visual box (borders, radius, focus states).",
    } satisfies Ui,

    extendBoxToControls: {
        type: "boolean",
        label: "Extend box to controls",
        description:
            "When joinControls is enabled: extend the styling over the controls (true) or keep them visually separate (false).",
    } satisfies Ui,

    // ─────────────────────────────────────────────
    // Masking (text family)
    // ─────────────────────────────────────────────
    textMask: {
        mask: {
            type: "string",
            label: "Mask pattern",
            description:
                'Mask pattern for formatted input (e.g. "99/99/9999", "(999) 999-9999").',
        } satisfies Ui,

        slotChar: {
            type: "string",
            label: "Slot character",
            description: 'Mask placeholder character (default is "_").',
            minLength: 1,
            maxLength: 1,
        } satisfies Ui,

        autoClear: {
            type: "boolean",
            label: "Auto clear",
            description:
                'If enabled, empty masked values emit "" instead of placeholder slots.',
        } satisfies Ui,

        unmask: {
            type: "anyOf",
            label: "Value mode",
            description:
                "Controls whether the emitted value is raw (unmasked) or masked.",
            items: [
                { type: "string", title: "Masked", value: "masked" },
                { type: "string", title: "Raw", value: "raw" },
            ],
        } satisfies Ui,

        maskInsertMode: {
            type: "anyOf",
            label: "Mask insert mode",
            description:
                "Reserved for future caret-mode logic (kept for compatibility).",
            items: [
                { type: "string", title: "Stream", value: "stream" },
                { type: "string", title: "Caret", value: "caret" },
            ],
        } satisfies Ui,

        maskDefinitions: {
            type: "object",
            label: "Mask definitions",
            description:
                "Per-symbol definitions for mask slots. Add a symbol key, then choose the definition shape.",
            editable: true,
            fields: {},

            shape: {
                "Regex pattern": {
                    type: "string",
                    label: "Pattern",
                    description:
                        "A regex pattern describing what this slot accepts.",
                    pattern: ".*",
                },

                "Boolean toggle": {
                    type: "boolean",
                    label: "Enabled",
                    description:
                        "Simple on/off definition (rare, but supported).",
                },

                "Choice list": {
                    type: "anyOf",
                    label: "Allowed values",
                    description: "Explicit allowed values for this slot.",
                    items: [{ type: "string", title: "Example", value: "X" }],
                },
            },
        } satisfies Ui,
    },

    // ─────────────────────────────────────────────
    // Options mapping + search UX (select / multi-select family)
    // ─────────────────────────────────────────────
    optionMapping: {
        options: {
            type: "array",
            label: "Options",
            description: "List of options to render.",
            item: {
                type: "object",
                label: "Option",
                description: "Option entry (object).",
                fields: {},
            } as Ui,
        } satisfies Ui,

        autoCap: {
            type: "boolean",
            label: "Auto capitalise",
            description:
                "Automatically capitalise the first letter when the resolved label is a string.",
        } satisfies Ui,

        optionLabel: {
            type: "string",
            label: "Option label key",
            description: "Key to read the label from option objects.",
        } satisfies Ui,

        optionValue: {
            type: "string",
            label: "Option value key",
            description: "Key to read the value from option objects.",
        } satisfies Ui,

        optionDescription: {
            type: "string",
            label: "Option description key",
            description:
                "Key to read the description line from option objects.",
        } satisfies Ui,

        optionDisabled: {
            type: "string",
            label: "Option disabled key",
            description: "Key to determine if an option is disabled.",
        } satisfies Ui,

        optionIcon: {
            type: "string",
            label: "Option icon key",
            description:
                'Key to read the icon from option objects (often "icon").',
        } satisfies Ui,

        optionKey: {
            type: "string",
            label: "Option key",
            description: "Stable key used as the identity for each option.",
        } satisfies Ui,
    },

    searchUx: {
        searchable: {
            type: "boolean",
            label: "Searchable",
            description: "Enable searching inside the dropdown.",
        } satisfies Ui,

        searchPlaceholder: {
            type: "string",
            label: "Search placeholder",
            description: "Placeholder text for the search input.",
        } satisfies Ui,

        emptySearchText: {
            type: "string",
            label: "Empty search text",
            description: "Text shown when the search returns no results.",
        } satisfies Ui,
    },

    pickerCommon: {
        placeholder: {
            type: "string",
            label: "Placeholder",
            description: "Placeholder text shown when no value is selected.",
        } satisfies Ui,

        clearable: {
            type: "boolean",
            label: "Clearable",
            description: "Allow clearing the current selection.",
        } satisfies Ui,
    },

    // -----------------------------
    // Box sizing / density (text + textarea, etc.)
    // -----------------------------
    size: {
        type: "anyOf",
        label: "Size",
        description: "Size preset for the input.",
        items: [
            { type: "string", title: "Small", value: "sm" },
            { type: "string", title: "Medium", value: "md" },
            { type: "string", title: "Large", value: "lg" },
        ],
    } satisfies Ui,

    density: {
        type: "anyOf",
        label: "Density",
        description: "Controls vertical compactness / line-height preset.",
        items: [
            { type: "string", title: "Compact", value: "compact" },
            { type: "string", title: "Normal", value: "normal" },
            { type: "string", title: "Relaxed", value: "relaxed" },
            { type: "string", title: "Dense", value: "dense" },
            { type: "string", title: "Loose", value: "loose" },
        ],
    } satisfies Ui,

    // -----------------------------
    // Padding (text + textarea, etc.)
    // -----------------------------
    padding: {
        px: {
            type: "number",
            label: "Padding X",
            description: "Horizontal padding override in pixels.",
            minimum: 0,
        } satisfies Ui,
        py: {
            type: "number",
            label: "Padding Y",
            description: "Vertical padding override in pixels.",
            minimum: 0,
        } satisfies Ui,
        ps: {
            type: "number",
            label: "Padding start",
            description:
                "Start-side padding override in pixels (overrides px).",
            minimum: 0,
        } satisfies Ui,
        pe: {
            type: "number",
            label: "Padding end",
            description: "End-side padding override in pixels (overrides px).",
            minimum: 0,
        } satisfies Ui,
        pb: {
            type: "number",
            label: "Padding bottom",
            description: "Bottom padding override in pixels (overrides py).",
            minimum: 0,
        } satisfies Ui,
    },
} as const;
