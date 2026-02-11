// src/react/inputs/registry/entries/text.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const textDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "text",
        stripPrefix: true,
        stripSuffix: true,
        slotChar: "_",
    },

    ui: {
        // shared box tuning (text supports these)
        size: sharedUi.size,
        density: sharedUi.density,
        ...sharedUi.padding,

        // behavior
        trim: {
            type: "boolean",
            label: "Trim",
            description: "If enabled, the value is trimmed before validation.",
        },

        minLength: {
            type: "number",
            label: "Min length",
            minimum: 0,
            description: "Minimum allowed string length.",
        },

        maxLength: {
            type: "number",
            label: "Max length",
            minimum: 0,
            description: "Maximum allowed string length.",
        },

        // affixes
        prefix: {
            type: "string",
            label: "Prefix",
            description: "Fixed prefix rendered as part of the input value.",
        },

        suffix: {
            type: "string",
            label: "Suffix",
            description: "Fixed suffix rendered as part of the input value.",
        },

        stripPrefix: {
            type: "boolean",
            label: "Strip prefix",
            description:
                "If enabled, remove the prefix from the emitted model value.",
        },

        stripSuffix: {
            type: "boolean",
            label: "Strip suffix",
            description:
                "If enabled, remove the suffix from the emitted model value.",
        },

        // shared layout knobs
        joinControls: sharedUi.joinControls,
        extendBoxToControls: sharedUi.extendBoxToControls,

        // shared masking knobs
        ...sharedUi.textMask,
    },
};
