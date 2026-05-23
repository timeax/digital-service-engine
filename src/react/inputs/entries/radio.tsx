// src/react/inputs/registry/entries/radio.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const radioDescriptor: InputDescriptor = {
    Component: InputField as any,
    options: {
        supported: true,
        autoCreate: true,
        defaultLabel: "Option label",
        defaultValue: "option",
    },

    defaultProps: {
        variant: "radio", // MUST
        autoCap: false,
    },

    ui: {
        // common tuning (radio supports these in your palette variants)
        size: sharedUi.size,
        density: sharedUi.density,

        /**
         * Options
         * Radio supports primitive shorthands + objects, using option* mapping keys.
         */
        ...sharedUi.optionMapping,

        // small radio-only behavior knobs (safe)
        multiple: {
            type: "boolean",
            label: "Multiple",
            description:
                "If enabled, behaves like a multi-pick radio group (emits a string array). Leave off for classic single-choice radio.",
        },

        // Note: no placeholder (InputField prop), no className props, no render/callback props.
    },
};
