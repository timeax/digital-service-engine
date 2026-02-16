// src/react/inputs/registry/entries/number.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const numberDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "number", // MUST

        // sensible defaults (optional — you can remove if you prefer)
        mode: "decimal",
        useGrouping: true,
        format: true,
        allowEmpty: true,
        step: 1,

        // for ShadcnNumberVariant
        showButtons: false,
        buttonLayout: "stacked",
    },

    ui: {
        // shared (supported via text base)
        size: sharedUi.size,
        density: sharedUi.density,
        ...sharedUi.padding,
        joinControls: sharedUi.joinControls,
        extendBoxToControls: sharedUi.extendBoxToControls,

        // numeric mode
        mode: {
            type: "anyOf",
            label: "Mode",
            description: "Number formatting mode (decimal or currency).",
            items: [
                { type: "string", title: "Decimal", value: "decimal" },
                { type: "string", title: "Currency", value: "currency" },
            ],
        },

        currency: {
            type: "string",
            label: "Currency code",
            description:
                'ISO currency code used when mode is "currency" (e.g. "USD", "NGN").',
        },

        currencyDisplay: {
            type: "anyOf",
            label: "Currency display",
            description: "How currency is displayed when mode is currency.",
            items: [
                { type: "string", title: "Symbol", value: "symbol" },
                {
                    type: "string",
                    title: "Narrow symbol",
                    value: "narrowSymbol",
                },
                { type: "string", title: "Code", value: "code" },
                { type: "string", title: "Name", value: "name" },
            ],
        },

        // locale + grouping
        locale: {
            type: "string",
            label: "Locale",
            description:
                'Locale used for formatting (e.g. "en-US", "en-GB"). If unset, runtime uses browser locale.',
        },

        useGrouping: {
            type: "boolean",
            label: "Use grouping",
            description: "If enabled, format with thousands separators.",
        },

        // fraction digits
        minFractionDigits: {
            type: "number",
            label: "Min fraction digits",
            description: "Minimum number of fractional digits to show.",
            minimum: 0,
        },

        maxFractionDigits: {
            type: "number",
            label: "Max fraction digits",
            description: "Maximum number of fractional digits to show.",
            minimum: 0,
        },

        // limits + stepping
        min: {
            type: "number",
            label: "Minimum",
            description: "Minimum allowed numeric value.",
        },

        max: {
            type: "number",
            label: "Maximum",
            description: "Maximum allowed numeric value.",
        },

        step: {
            type: "number",
            label: "Step",
            description: "Step increment used for arrow keys and +/- buttons.",
        },

        // behavior
        allowEmpty: {
            type: "boolean",
            label: "Allow empty",
            description:
                "If enabled, the field can be cleared to an empty state (null).",
        },

        format: {
            type: "boolean",
            label: "Format",
            description:
                "If enabled, uses Intl formatting (grouping/currency) when blurred. If disabled, shows raw text.",
        },

        // affixes (allowed — not InputField props)
        prefix: {
            type: "string",
            label: "Prefix",
            description:
                "Fixed prefix rendered as part of the displayed value.",
        },

        suffix: {
            type: "string",
            label: "Suffix",
            description:
                "Fixed suffix rendered as part of the displayed value.",
        },

        // ShadcnNumberVariant extras (buttons)
        showButtons: {
            type: "boolean",
            label: "Show +/- buttons",
            description:
                "Show increment/decrement buttons around the number field.",
        },

        buttonLayout: {
            type: "anyOf",
            label: "Button layout",
            description:
                'How +/- buttons are arranged when "Show +/- buttons" is enabled.',
            items: [
                { type: "string", title: "Inline", value: "inline" },
                { type: "string", title: "Stacked", value: "stacked" },
            ],
        },
    },
};
