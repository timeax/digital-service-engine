// src/react/inputs/registry/entries/password.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const passwordDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "password", // MUST

        // sensible defaults (optional)
        revealToggle: true,
        meterStyle: "simple",
    },

    ui: {
        // shared text-like tuning supported by password (it types against text props)
        size: sharedUi.size,
        density: sharedUi.density,
        ...sharedUi.padding,
        joinControls: sharedUi.joinControls,
        extendBoxToControls: sharedUi.extendBoxToControls,

        // password-specific
        maxLength: {
            type: "number",
            label: "Max length",
            minimum: 0,
            description: "Maximum number of characters permitted.",
        },

        autoComplete: {
            type: "string",
            label: "Autocomplete",
            description:
                'Browser autocomplete hint (e.g. "current-password", "new-password").',
        },

        revealToggle: {
            type: "boolean",
            label: "Reveal toggle",
            description:
                "Show an eye button to toggle between obscured/plain text.",
        },

        defaultRevealed: {
            type: "boolean",
            label: "Default revealed",
            description: "Start in the revealed (plain text) state.",
        },

        meterStyle: {
            type: "anyOf",
            label: "Meter style",
            description:
                'Built-in meter style: "simple" (bar + label) or "rules" (bar + checklist).',
            items: [
                { type: "string", title: "Simple", value: "simple" },
                { type: "string", title: "Rules", value: "rules" },
            ],
        },

        /**
         * Strength meter config
         * - Runtime accepts: boolean | StrengthOptions
         * - We expose it as an object; if present (even empty), it enables the meter
         *   and merges with defaults.
         *
         * NOTE: we intentionally do NOT expose `calc` (function).
         */
        strengthMeter: {
            type: "object",
            label: "Strength meter",
            description:
                "Configure the built-in strength meter. If set (even partially), the meter is enabled and defaults are merged.",
            editable: false,
            fields: {
                labels: {
                    type: "array",
                    label: "Labels",
                    description: "Labels for each score bucket (index 0..4).",
                    editable: true,
                    minItems: 5,
                    maxItems: 5,
                    item: {
                        type: "string",
                        label: "Label",
                        description: "Label for a score bucket.",
                    },
                },

                thresholds: {
                    type: "array",
                    label: "Thresholds",
                    description:
                        "Thresholds for score steps using a 0–100 bar (index 0..4).",
                    editable: true,
                    minItems: 5,
                    maxItems: 5,
                    item: {
                        type: "number",
                        label: "Threshold",
                        description: "Threshold value (0–100).",
                        minimum: 0,
                        maximum: 100,
                    },
                },

                minScore: {
                    type: "number",
                    label: "Minimum score",
                    description:
                        "Minimum score required to consider the password acceptable (visual only unless enforced elsewhere).",
                    minimum: 0,
                    maximum: 4,
                },

                showLabel: {
                    type: "boolean",
                    label: "Show label",
                    description:
                        "Show the textual label next to/under the bar.",
                },

                display: {
                    type: "anyOf",
                    label: "Display",
                    description:
                        'Where to render the meter: "inline" (compact) or "block" (stacked).',
                    items: [
                        { type: "string", title: "Inline", value: "inline" },
                        { type: "string", title: "Block", value: "block" },
                    ],
                },
            },
            order: ["display", "showLabel", "minScore", "labels", "thresholds"],
        },

        ruleUses: {
            type: "array",
            label: "Rule uses",
            description:
                'Selection of rule aliases to apply. Prefix with "!" to mark a rule as important.',
            editable: true,
            item: {
                type: "string",
                label: "Rule",
                description: 'Rule alias (e.g. "length" or "!length").',
            },
        },
    },
};
