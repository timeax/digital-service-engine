// src/react/inputs/registry/entries/toggle.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const toggleDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "toggle", // MUST
        // optional defaults (the variant already defaults these)
        // size: "md",
        // density: "default",
        // controlPlacement: "left",
    },

    ui: {
        // toggle supports the same size union as text
        size: sharedUi.size,

        // but density is different from your text density union
        density: {
            type: "anyOf",
            label: "Density",
            description: "Row density (vertical padding & gap).",
            items: [
                { type: "string", title: "Default", value: "default" },
                { type: "string", title: "Dense", value: "dense" },
            ],
        },

        controlPlacement: {
            type: "anyOf",
            label: "Control placement",
            description:
                "Place the switch on the left or right of the state text.",
            items: [
                { type: "string", title: "Left", value: "left" },
                { type: "string", title: "Right", value: "right" },
            ],
        },
    },
};
