// src/react/inputs/registry/entries/color.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const colorDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "color", // MUST

        // sensible defaults (matches variant defaults)
        showPreview: true,
        showPickerToggle: true,
        previewSize: 18,

        // forwarded from text UI
        joinControls: true,
        extendBoxToControls: true,
    },

    ui: {
        // color inherits most text UI props (but we still only expose the shared-safe ones)
        size: sharedUi.size,
        density: sharedUi.density,
        ...sharedUi.padding,

        joinControls: sharedUi.joinControls,
        extendBoxToControls: sharedUi.extendBoxToControls,

        showPreview: {
            type: "boolean",
            label: "Show preview",
            description: "Show the color swatch preview control.",
        },

        showPickerToggle: {
            type: "boolean",
            label: "Show picker toggle",
            description: "Show the picker toggle control/icon.",
        },

        previewSize: {
            type: "number",
            label: "Preview size",
            description: "Size of the color swatch in pixels.",
            minimum: 8,
            maximum: 64,
        },
    },
};
