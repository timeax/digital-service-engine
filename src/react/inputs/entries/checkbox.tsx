// src/react/inputs/registry/entries/checkbox.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

const checkboxBaseUi: InputDescriptor["ui"] = {
    size: sharedUi.size,

    density: {
        type: "anyOf",
        label: "Density",
        description: "Vertical density of each option row.",
        items: [
            { type: "string", title: "Compact", value: "compact" },
            { type: "string", title: "Comfortable", value: "comfortable" },
            { type: "string", title: "Loose", value: "loose" },
        ],
    },

    single: {
        type: "boolean",
        label: "Single",
        description:
            "If enabled, behaves like a single checkbox (boolean). Otherwise renders a group (array).",
    },

    tristate: {
        type: "boolean",
        label: "Tri-state",
        description:
            'Enable tri-state behaviour (supports an internal "none" state).',
    },

    layout: {
        type: "anyOf",
        label: "Layout",
        description: "Arrange options as a vertical list or grid.",
        items: [
            { type: "string", title: "List", value: "list" },
            { type: "string", title: "Grid", value: "grid" },
        ],
    },

    columns: {
        type: "number",
        label: "Columns",
        description: "Number of columns when layout is grid.",
        minimum: 1,
    },

    itemGapPx: {
        type: "number",
        label: "Item gap (px)",
        description: "Gap between option rows/items in pixels.",
        minimum: 0,
    },

    autoCap: {
        type: "boolean",
        label: "Auto capitalise",
        description:
            "Capitalise the first letter of labels (only when label resolves to a string).",
    },

    options: {
        type: "array",
        label: "Options",
        description:
            "Checkbox options. Can be primitives (string/number/boolean) or objects (label/value/description/disabled/tristate).",
        editable: true,
        item: {
            type: "object",
            label: "Option",
            description: "An option item for group mode.",
            editable: true,
            fields: {
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
                description: {
                    type: "string",
                    label: "Description",
                    description: "Optional helper text under the label.",
                },
                disabled: {
                    type: "boolean",
                    label: "Disabled",
                    description: "Disable this option.",
                },
                tristate: {
                    type: "boolean",
                    label: "Tri-state override",
                    description:
                        "Override tri-state behaviour for this option (if unset, uses variant tristate).",
                },
            },
            order: ["value", "label", "description", "disabled", "tristate"],
        } as any,
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
};

export const checkboxDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "checkbox", // MUST

        single: true,
        tristate: false,
        layout: "list",
        columns: 2,
        itemGapPx: 8,
        size: "md",
        density: "comfortable",
        autoCap: false,
    },
    adapter: {

    },

    options: {
        supported: false,
    },
    ui: checkboxBaseUi,
};

export const checkboxOptionsDescriptor: InputDescriptor = {
    ...checkboxDescriptor,
    defaultProps: {
        ...(checkboxDescriptor.defaultProps ?? {}),
        single: false,
    },
    options: {
        supported: true,
        autoCreate: true,
        defaultLabel: "Option label",
        defaultValue: "option",
    },
};
