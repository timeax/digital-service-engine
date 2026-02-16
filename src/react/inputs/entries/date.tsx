// src/react/inputs/registry/entries/date.ts
import { InputField } from "@timeax/form-palette";
import type { InputDescriptor } from "@/react";
import { sharedUi } from "./shared";

export const dateDescriptor: InputDescriptor = {
    Component: InputField as any,

    defaultProps: {
        variant: "date", // MUST

        // sensible defaults (matches the variant defaults shown in code)
        mode: "single",
        kind: "date",
        clearable: true,

        // text-ui bits that date supports
        joinControls: true,
        extendBoxToControls: true,
    },

    ui: {
        // shared text-like tuning (date reuses ShadcnTextVariantProps minus value/onValue/etc.)
        size: sharedUi.size,
        density: sharedUi.density,
        ...sharedUi.padding,
        joinControls: sharedUi.joinControls,
        extendBoxToControls: sharedUi.extendBoxToControls,

        mode: {
            type: "anyOf",
            label: "Mode",
            description: "Single date input or a date range picker.",
            items: [
                { type: "string", title: "Single", value: "single" },
                { type: "string", title: "Range", value: "range" },
            ],
        },

        kind: {
            type: "anyOf",
            label: "Kind",
            description:
                "Logical temporal kind. Controls default mask + formatting/parsing.",
            items: [
                { type: "string", title: "Date", value: "date" },
                { type: "string", title: "Date & time", value: "datetime" },
                { type: "string", title: "Time", value: "time" },
                { type: "string", title: "Hour", value: "hour" },
                { type: "string", title: "Month/Year", value: "monthYear" },
                { type: "string", title: "Year", value: "year" },
            ],
        },

        clearable: {
            type: "boolean",
            label: "Clearable",
            description: "Show a clear control to remove the selected value.",
        },

        showCalendar: {
            type: "boolean",
            label: "Show calendar",
            description:
                "Render the calendar popover. Defaults to true for date/datetime, false for time-only kinds.",
        },

        // Formatting / display
        formatSingle: {
            type: "string",
            label: "Single format",
            description:
                'Display pattern for single values (e.g. "yyyy-MM-dd", "yyyy-MM-dd HH:mm", "HH:mm").',
        },

        // NOTE: DateVariantProps allows formatRange as function too; builder exposes string only.
        formatRange: {
            type: "string",
            label: "Range format",
            description:
                "Pattern applied to both ends of the range (string form only).",
        },

        rangeSeparator: {
            type: "string",
            label: "Range separator",
            description:
                'Separator between from/to in range display (default " – ").',
        },

        stayOpenOnSelect: {
            type: "boolean",
            label: "Stay open on select",
            description:
                "Keep the calendar open after selection (range stays open until both ends are picked).",
        },

        inputMask: {
            type: "string",
            label: "Input mask",
            description:
                "Optional explicit mask for typed input. Uses mask tokens: 9=digit, a=letter, *=alphanumeric.",
        },

        // Intentionally excluded (non-builder-safe / non-serializable):
        // - placeholder (ReactNode)
        // - minDate/maxDate (Date objects)
        // - disabledDays (complex Calendar disabled type)
        // - open/onOpenChange (controlled popover)
    },
};
