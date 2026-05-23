// src/react/inputs/registry/entries/toggle-group.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const toggleGroupDescriptor: InputDescriptor = {
    Component: InputField as any,
    options: {
        supported: true,
        autoCreate: true,
        defaultLabel: "Option label",
        defaultValue: "option",
    },

    defaultProps: {
        variant: "toggle-group", // MUST
        multiple: false,
        variantStyle: "default",
        layout: "horizontal",
        gridCols: 2,
        fillWidth: false,
        autoCap: false,
    },

    ui: {
        // (toggle-group supports these via VariantBaseProps)
        size: sharedUi.size,
        density: sharedUi.density,

        /**
         * Options
         * - supports primitive shorthand + objects + option* mapping keys
         */
        options: {
            type: "array",
            label: "Options",
            description:
                "Toggle options. Can be primitive values (string/number/boolean) or objects. Uses option* keys when provided.",
            editable: true,
            item: {
                type: "object",
                label: "Option",
                description:
                    "Option object (used when you want label/value/icon/disabled/tooltip/meta).",
                editable: true,
                fields: {
                    // Keep this minimal; the variant can also read via option* keys.
                    value: {
                        type: "string",
                        label: "Value",
                        description: "Unique option value (string).",
                    },
                    label: {
                        type: "string",
                        label: "Label",
                        description: "Display label for the option.",
                    },
                    disabled: {
                        type: "boolean",
                        label: "Disabled",
                        description: "Disable this option.",
                    },
                    tooltip: {
                        type: "string",
                        label: "Tooltip",
                        description: "Optional tooltip text for this option.",
                    },
                },
            } as any,
        },

        // option mapping keys (shared)
        autoCap: {
            type: "boolean",
            label: "Auto capitalise",
            description:
                "Automatically capitalise labels when the resolved label is a string.",
        },

        optionValue: {
            type: "string",
            label: "Option value key",
            description:
                "Property name to read the option value from when using custom option objects.",
        },

        optionLabel: {
            type: "string",
            label: "Option label key",
            description:
                "Property name to read the option label from when using custom option objects.",
        },

        optionIcon: {
            type: "string",
            label: "Option icon key",
            description:
                "Property name to read an icon from (runtime-only; builder typically won’t author icons).",
        },

        optionDisabled: {
            type: "string",
            label: "Option disabled key",
            description:
                "Property name to read the disabled flag from when using custom option objects.",
        },

        optionTooltip: {
            type: "string",
            label: "Option tooltip key",
            description:
                "Property name to read tooltip content from when using custom option objects.",
        },

        optionMeta: {
            type: "string",
            label: "Option meta key",
            description:
                "Property name to read meta from (opaque payload for host logic).",
        },

        // selection mode
        multiple: {
            type: "boolean",
            label: "Multiple",
            description:
                "If enabled, multiple options can be selected (emits a string array).",
        },

        // visuals/layout
        variant: {
            type: "anyOf",
            label: "Variant style",
            description:
                'Visual style for the toggle buttons ("default" or "outline").',
            items: [
                { type: "string", title: "Default", value: "default" },
                { type: "string", title: "Outline", value: "outline" },
            ],
        },

        layout: {
            type: "anyOf",
            label: "Layout",
            description: "How the toggle items are arranged.",
            items: [
                { type: "string", title: "Horizontal", value: "horizontal" },
                { type: "string", title: "Vertical", value: "vertical" },
                { type: "string", title: "Grid", value: "grid" },
            ],
        },

        gridCols: {
            type: "number",
            label: "Grid columns",
            description: "Number of columns when layout is set to grid.",
            minimum: 1,
        },

        fillWidth: {
            type: "boolean",
            label: "Fill width",
            description:
                "If enabled, the group stretches to full width and items expand to fill available space.",
        },

        gap: {
            type: "number",
            label: "Item gap",
            description:
                "Spacing between items in pixels (applies in grid/horizontal/vertical layouts).",
            minimum: 0,
        },
    },
};
