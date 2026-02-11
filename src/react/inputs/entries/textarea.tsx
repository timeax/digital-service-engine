// src/react/inputs/registry/entries/textarea.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const textareaDescriptor: InputDescriptor = {
    Component: InputField as any,
    defaultProps: {
        variant: "textarea",
    },
    ui: {
        // box tuning shared with text
        size: sharedUi.size,
        density: sharedUi.density,
        ...sharedUi.padding,

        autoResize: {
            type: "boolean",
            label: "Auto resize",
            description: "Automatically grows/shrinks height based on content.",
        },

        rows: {
            type: "number",
            label: "Min rows",
            description:
                "Minimum number of visible rows (used when auto-resize is enabled).",
            minimum: 1,
        },

        maxRows: {
            type: "number",
            label: "Max rows",
            description:
                "Maximum number of visible rows (leave unset for unlimited).",
            minimum: 1,
        },

        extendBoxToControls: sharedUi.extendBoxToControls,

        extendBoxToToolbox: {
            type: "boolean",
            label: "Extend box to toolbox",
            description:
                "Extend the textarea box styling to the upper toolbox area when present.",
        },
    },
};
