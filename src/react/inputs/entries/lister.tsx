// src/react/inputs/registry/entries/lister.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";
import type { Ui } from "@/schema";

const listerUi = {
    // ─────────────────────────────────────────────
    // Selection behaviour
    // ─────────────────────────────────────────────
    mode: {
        type: "anyOf",
        label: "Selection mode",
        description: 'Whether the lister selects one value ("single") or many ("multiple").',
        items: [
            { type: "string", title: "Single", value: "single" },
            { type: "string", title: "Multiple", value: "multiple" },
        ],
    } satisfies Ui,

    confirm: {
        type: "boolean",
        label: "Confirm",
        description:
            'When enabled (single-mode only), require confirmation before committing selection.',
    } satisfies Ui,

    remoteDebounceMs: {
        type: "number",
        label: "Remote debounce (ms)",
        description: "Debounce duration for remote search requests.",
        minimum: 0,
    } satisfies Ui,

    // permissions?: string[] (primitive array)
    permissions: {
        type: "array",
        label: "Permissions",
        description: "Optional permission keys passed to the lister provider/open UI.",
        editable: true,
        item: {
            type: "string",
            label: "Permission",
            description: "One permission key.",
        } satisfies Ui,
    } satisfies Ui,

    // ─────────────────────────────────────────────
    // Inline source (when not using a base `def`)
    // ─────────────────────────────────────────────
    endpoint: {
        type: "string",
        label: "Endpoint",
        description: "Inline endpoint for fetching options (standalone mode).",
    } satisfies Ui,

    method: {
        type: "anyOf",
        label: "HTTP method",
        description: "HTTP method for inline endpoint requests.",
        items: [
            { type: "string", title: "GET", value: "GET" },
            { type: "string", title: "POST", value: "POST" },
        ],
    } satisfies Ui,

    selector: {
        type: "string",
        label: "Selector",
        description:
            'Selector key/path for extracting the list from a response (e.g. "data").',
    } satisfies Ui,

    // ─────────────────────────────────────────────
    // Mapping (ctx-aware in code, but schema-configurable as keys)
    // ─────────────────────────────────────────────
    optionValue: {
        type: "string",
        label: "Option value key",
        description: "Key to read the value/id from each raw option object.",
    } satisfies Ui,

    optionLabel: {
        type: "string",
        label: "Option label key",
        description: "Key to read the display label from each raw option object.",
    } satisfies Ui,

    optionDescription: {
        type: "string",
        label: "Option description key",
        description: "Key to read the description line from each raw option object.",
    } satisfies Ui,

    optionDisabled: {
        type: "string",
        label: "Option disabled key",
        description: "Key to determine if an option is disabled.",
    } satisfies Ui,

    optionIcon: {
        type: "string",
        label: "Option icon key",
        description: "Key to read an icon value from each raw option object.",
    } satisfies Ui,

    optionGroup: {
        type: "string",
        label: "Option group key",
        description: "Key used to group options (if grouping is supported by the open UI).",
    } satisfies Ui,

    // ─────────────────────────────────────────────
    // Search spec / open options (primitive-friendly subset)
    // ─────────────────────────────────────────────
    title: {
        type: "string",
        label: "Title",
        description: "Title shown on the open/picker UI.",
    } satisfies Ui,

    searchMode: {
        type: "string",
        label: "Search mode",
        description: "Search behaviour/mode for the open UI (provider-defined).",
    } satisfies Ui,

    initialQuery: {
        type: "string",
        label: "Initial query",
        description: "Initial query state for the open UI.",
    } satisfies Ui,

    showRefresh: {
        type: "boolean",
        label: "Show refresh",
        description: "Show refresh button in the open UI.",
    } satisfies Ui,

    refreshMode: {
        type: "string",
        label: "Refresh mode",
        description: "Refresh behaviour/mode (provider-defined).",
    } satisfies Ui,

    // ─────────────────────────────────────────────
    // Trigger display (primitive subset)
    // ─────────────────────────────────────────────
    placeholder: {
        type: "string",
        label: "Placeholder",
        description: "Placeholder text shown when no value is selected.",
    } satisfies Ui,

    maxDisplayItems: {
        type: "number",
        label: "Max display items",
        description:
            "Maximum number of selected items to render in the closed trigger summary.",
        minimum: 0,
    } satisfies Ui,

    clearable: {
        type: "boolean",
        label: "Clearable",
        description: "Allow clearing the current selection.",
    } satisfies Ui,

    // IMPORTANT: trigger style is documented in README as `mode`,
    // but `mode` is already selection mode in the real prop surface.
    triggerMode: {
        type: "anyOf",
        label: "Trigger style",
        description: 'Trigger style: "default" (input-like) or "button" (custom trigger).',
        items: [
            { type: "string", title: "Default", value: "default" },
            { type: "string", title: "Button", value: "button" },
        ],
    } satisfies Ui,

    // ─────────────────────────────────────────────
    // Shared layout knobs you *do* want exposed
    // ─────────────────────────────────────────────
    joinControls: sharedUi.joinControls,
    extendBoxToControls: sharedUi.extendBoxToControls,
    size: sharedUi.size,
    density: sharedUi.density,
    padding: {
        type: "object",
        label: "Padding",
        description: "Padding overrides.",
        editable: false,
        fields: {
            px: sharedUi.padding.px,
            py: sharedUi.padding.py,
            ps: sharedUi.padding.ps,
            pe: sharedUi.padding.pe,
            pb: sharedUi.padding.pb,
        },
    } satisfies Ui,
} as const;

export const listerDescriptor: InputDescriptor = {
    Component: InputField as any,
    defaultProps: { variant: "lister" },
    ui: listerUi,
};