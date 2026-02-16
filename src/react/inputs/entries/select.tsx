// src/react/inputs/registry/entries/select.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const selectDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "select", // MUST

        // sensible defaults (optional)
        searchable: true,
        clearable: true,
        autoCap: false,

        joinControls: true,
        extendBoxToControls: true,
    },

    ui: {
        // common tuning
        size: sharedUi.size,
        density: sharedUi.density,

        // options + mapping
        ...sharedUi.optionMapping,

        // search UX
        ...sharedUi.searchUx,

        // picker basics (allowed)
        clearable: {
            type: "boolean",
            label: "Clearable",
            description: "Allow clearing the current selection.",
        },

        // layout knobs (allowed)
        joinControls: sharedUi.joinControls,
        extendBoxToControls: sharedUi.extendBoxToControls,
    },
};
