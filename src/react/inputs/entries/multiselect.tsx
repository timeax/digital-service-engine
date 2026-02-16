// src/react/inputs/registry/entries/multi-select.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const multiSelectDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "multi-select", // MUST

        // sensible defaults (optional)
        searchable: true,
        clearable: true,
        autoCap: false,

        joinControls: true,
        extendBoxToControls: true,
    },

    ui: {
        // shared tuning
        size: sharedUi.size,
        density: sharedUi.density,

        // shared: options mapping
        ...sharedUi.optionMapping,

        // shared: search ux
        ...sharedUi.searchUx,

        // common picker knobs (allowed)
        clearable: {
            type: "boolean",
            label: "Clearable",
            description: "Allow clearing all selected values.",
        },

        // multi-select behavior knobs (safe)
        closeOnSelect: {
            type: "boolean",
            label: "Close on select",
            description:
                "If enabled, the dropdown closes after selecting an option.",
        },

        maxSelected: {
            type: "number",
            label: "Max selected",
            description:
                "Maximum number of selections allowed (leave unset for unlimited).",
            minimum: 1,
        },

        // shared layout knobs
        joinControls: sharedUi.joinControls,
        extendBoxToControls: sharedUi.extendBoxToControls,
    },
};
