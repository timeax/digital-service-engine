// src/react/inputs/registry/entries/phone.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const phoneDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "phone", // MUST

        // (optional) you can omit these since the component already defaults them:
        // showCountry: true,
        // showFlag: true,
        // showSelectedLabel: false,
        // showSelectedDial: false,
        // showDialInList: true,
        // valueMode: "e164",
        // keepCharPositions: false,
    },

    ui: {
        // shared text-like tuning supported by phone (since it types against Text props)
        size: sharedUi.size,
        density: sharedUi.density,
        ...sharedUi.padding,

        joinControls: sharedUi.joinControls,
        extendBoxToControls: sharedUi.extendBoxToControls,

        // ─────────────────────────────────────────────
        // Phone-specific configuration
        // ─────────────────────────────────────────────

        defaultCountry: {
            type: "string",
            label: "Default country",
            description:
                'ISO 3166-1 alpha-2 code for the initial country (e.g. "NG", "US", "GB").',
        },

        // Countries list is optional; if omitted, runtime uses global list.
        // editable=true lets admins add custom countries if you want.
        countries: {
            type: "array",
            label: "Countries",
            description:
                "Optional custom country list. If omitted, the global country list is used.",
            editable: true,
            item: {
                type: "object",
                label: "Country",
                description:
                    "A single country entry: code, label, dial code, and national mask.",
                editable: false,
                fields: {
                    code: {
                        type: "string",
                        label: "ISO code",
                        description: 'ISO alpha-2 (e.g. "NG").',
                    },
                    label: {
                        type: "string",
                        label: "Label",
                        description: 'Display label (e.g. "Nigeria").',
                    },
                    dial: {
                        type: "string",
                        label: "Dial code",
                        description: 'Dial code without "+" (e.g. "234").',
                    },
                    mask: {
                        type: "string",
                        label: "National mask",
                        description:
                            'Mask for the NATIONAL portion only (no dial). Example: "999 999 9999".',
                    },
                    // flag is ReactNode in the variant; not builder-editable, so excluded.
                },
                order: ["code", "label", "dial", "mask"],
            },
        },

        valueMode: {
            type: "anyOf",
            label: "Value mode",
            description:
                "Controls how the form value is emitted (masked, e164, or national digits only).",
            items: [
                {
                    type: "string",
                    title: "Masked (+234 801 234 5678)",
                    value: "masked",
                },
                {
                    type: "string",
                    title: "E164 (dial+digits, no +)",
                    value: "e164",
                },
                {
                    type: "string",
                    title: "National (digits only)",
                    value: "national",
                },
            ],
        },

        keepCharPositions: {
            type: "boolean",
            label: "Keep character positions",
            description:
                "If enabled, the national mask keeps placeholder characters for not-yet-filled positions.",
        },

        // ─────────────────────────────────────────────
        // Country selector UX (allowed; not InputField placeholder)
        // ─────────────────────────────────────────────

        showCountry: {
            type: "boolean",
            label: "Show country selector",
            description: "Show or hide the country selector control.",
        },

        countryPlaceholder: {
            type: "string",
            label: "Country placeholder",
            description:
                "Placeholder shown on the country selector when nothing is selected.",
        },

        showFlag: {
            type: "boolean",
            label: "Show flag",
            description: "Show or hide the country flag in the selector.",
        },

        showSelectedLabel: {
            type: "boolean",
            label: "Show selected label",
            description: "Show the selected country label in the trigger.",
        },

        showSelectedDial: {
            type: "boolean",
            label: "Show selected dial code",
            description: "Show the selected country dial code in the trigger.",
        },

        showDialInList: {
            type: "boolean",
            label: "Show dial code in list",
            description:
                "Show dial codes alongside country names in the dropdown list.",
        },

        // onCountryChange is a callback; not builder-editable, so excluded.
        // country*ClassName props are forbidden; excluded.
    },
};
