// src/react/inputs/registry/entries/file.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const fileDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "file", // MUST

        // sensible defaults (optional)
        multiple: false,
        mergeMode: "append",
        showDropArea: false,
        showCheckboxes: true,
        custom: false,
        // placeholder exists on the variant, but per your rule we DON'T declare it here
    },

    ui: {
        size: sharedUi.size,

        // file has its own density union
        density: {
            type: "anyOf",
            label: "Density",
            description: "Spacing preset for the trigger + list UI.",
            items: [
                { type: "string", title: "Compact", value: "compact" },
                { type: "string", title: "Comfortable", value: "comfortable" },
                { type: "string", title: "Loose", value: "loose" },
            ],
        },

        multiple: {
            type: "boolean",
            label: "Multiple",
            description: "Allow selecting multiple files.",
        },

        accept: {
            type: "array",
            label: "Accepted types",
            description:
                'Accepted MIME types / extensions (e.g. "image/*", ".png", "application/pdf").',
            editable: true,
            item: {
                type: "string",
                label: "Type",
                description: "A MIME type or extension.",
            },
        },

        maxFiles: {
            type: "number",
            label: "Max files",
            description:
                "Maximum number of files allowed (leave unset for unlimited).",
            minimum: 1,
        },

        maxTotalSize: {
            type: "number",
            label: "Max total size (bytes)",
            description:
                "Maximum total size across all selected files in bytes (leave unset for unlimited).",
            minimum: 1,
        },

        mergeMode: {
            type: "anyOf",
            label: "Merge mode",
            description:
                'How new picks are merged into the current selection ("append" or "replace").',
            items: [
                { type: "string", title: "Append", value: "append" },
                { type: "string", title: "Replace", value: "replace" },
            ],
        },

        showDropArea: {
            type: "boolean",
            label: "Show drop area",
            description: "Show a drag-and-drop area inside the picker.",
        },

        // these are ReactNode in the variant, but strings are safe + useful in builder
        dropTitle: {
            type: "string",
            label: "Drop title",
            description: "Title text shown in the drop area.",
        },

        dropDescription: {
            type: "string",
            label: "Drop description",
            description: "Supporting text shown in the drop area.",
        },

        custom: {
            type: "boolean",
            label: "Custom loader",
            description:
                "Enable a host-provided custom loader (host must wire customLoader at runtime).",
        },

        showCheckboxes: {
            type: "boolean",
            label: "Show checkboxes",
            description:
                "Show selection checkboxes for file rows inside the picker.",
        },

        asRaw: {
            type: "boolean",
            label: "As raw (legacy)",
            description:
                "Legacy compatibility flag. The submitted value is still File|string; raw items are available via change detail meta.",
        },

        // intentionally excluded:
        // - placeholder (InputField prop, injected by your registry helper)
        // - dropIcon (ReactNode)
        // - renderDropArea / renderFileItem (functions)
        // - customLoader (function)
        // - formatFileName / formatFileSize (functions)
        // - all *ClassName props (not allowed)
        // - button mode trigger props (ReactNode/functions)
    },
};
