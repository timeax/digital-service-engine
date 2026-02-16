// src/react/inputs/registry/entries/slider.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const sliderDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "slider", // MUST
        min: 0,
        max: 100,
        step: 1,
        showValue: true,
        valuePlacement: "end",
        joinControls: true,
        extendBoxToControls: true,
        controlVariant: "none",
    },

    ui: {
        // slider supports size + density but its density enum is compact/comfortable/loose
        size: sharedUi.size,

        density: {
            type: "anyOf",
            label: "Density",
            description: "Vertical padding preset for the slider container.",
            items: [
                { type: "string", title: "Compact", value: "compact" },
                { type: "string", title: "Comfortable", value: "comfortable" },
                { type: "string", title: "Loose", value: "loose" },
            ],
        },

        min: {
            type: "number",
            label: "Minimum",
            description: "Minimum value for the slider.",
        },

        max: {
            type: "number",
            label: "Maximum",
            description: "Maximum value for the slider.",
        },

        step: {
            type: "number",
            label: "Step",
            description: "Step between values.",
        },

        showValue: {
            type: "boolean",
            label: "Show value",
            description: "Show the current value as text next to the slider.",
        },

        valuePlacement: {
            type: "anyOf",
            label: "Value placement",
            description: 'Where the value label appears ("start" or "end").',
            items: [
                { type: "string", title: "Start", value: "start" },
                { type: "string", title: "End", value: "end" },
            ],
        },

        joinControls: sharedUi.joinControls,
        extendBoxToControls: sharedUi.extendBoxToControls,

        controlVariant: {
            type: "anyOf",
            label: "Built-in +/- controls",
            description:
                'Built-in step buttons around the slider ("none", "boxed", or "edge").',
            items: [
                { type: "string", title: "None", value: "none" },
                { type: "string", title: "Boxed", value: "boxed" },
                { type: "string", title: "Edge", value: "edge" },
            ],
        },

        controlStep: {
            type: "number",
            label: "Control step",
            description:
                "Step used when clicking the +/- controls. If unset, falls back to Step.",
        },
    },
};
