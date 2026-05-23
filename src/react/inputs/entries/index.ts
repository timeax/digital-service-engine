// src/react/inputs/registry/entries/index.ts
import type {InputDescriptor, Registry} from "@/react";

import {textDescriptor} from "./text";
import {textareaDescriptor} from "./textarea";
import {phoneDescriptor} from "./phone";
import {toggleGroupDescriptor} from "./toggle-group";
import {numberDescriptor} from "./number";
import {passwordDescriptor} from "./password";
import {sliderDescriptor} from "./slider";
import {toggleDescriptor} from "./toggle";
import {treeSelectDescriptor} from "./treeselect";
import {multiSelectDescriptor} from "./multiselect";
import {selectDescriptor} from "./select";
import {radioDescriptor} from "./radio";
import {checkboxDescriptor, checkboxOptionsDescriptor} from "./checkbox";
import {chipsDescriptor} from "./chips";
import {colorDescriptor} from "./color";
import {dateDescriptor} from "./date";
import {keyValueDescriptor} from "./keyvalue";
import {editorDescriptor} from "./editor";
import {listerDescriptor} from "./lister";
import {fileDescriptor} from "./file";
import {Field, FieldOption, ServicePropsNotice, Ui} from "@/schema";

/**
 * InputField-level UI props (injected for every descriptor at registration time).
 * NOTE: keep this list tight—only props that truly belong to InputField itself.
 */
const inputFieldUi: Record<string, Ui> = {
    // --- Chrome / helper text (builder-friendly) ---
    sublabel: {
        type: "string",
        label: "Sublabel",
        description:
            "Secondary label text shown near the main label (if supported).",
    },

    description: {
        type: "string",
        label: "Description",
        description: "Helper description shown under the label.",
    },

    helpText: {
        type: "string",
        label: "Help text",
        description: "Additional helper text shown in the help slot.",
    },

    // --- Placement hints (layout-only; host decides exact behavior) ---
    labelPlacement: {
        type: "string",
        label: "Label placement",
        description: "Layout hint for where the label is rendered.",
    } as Ui,

    sublabelPlacement: {
        type: "string",
        label: "Sublabel placement",
        description: "Layout hint for where the sublabel is rendered.",
    } as Ui,

    descriptionPlacement: {
        type: "string",
        label: "Description placement",
        description: "Layout hint for where the description is rendered.",
    } as Ui,

    helpTextPlacement: {
        type: "string",
        label: "Help text placement",
        description: "Layout hint for where the help text is rendered.",
    } as Ui,

    tagPlacement: {
        type: "string",
        label: "Tag placement",
        description: "Layout hint for where tags are rendered.",
    } as Ui,

    // --- Tags (builder-safe subset; host maps to FieldTag) ---
    tags: {
        type: "array",
        label: "Tags",
        description:
            "Small tag badges shown near the label. Builder-safe subset (label/color/bgColor).",
        editable: true,
        item: {
            type: "object",
            label: "Tag",
            description: "A label tag.",
            editable: true,
            fields: {
                label: {
                    type: "string",
                    label: "Label",
                    description: "Tag text.",
                },
                color: {
                    type: "string",
                    label: "Text color",
                    description: 'CSS color value (e.g. "#fff" or "rgb(...)").',
                },
                bgColor: {
                    type: "string",
                    label: "Background color",
                    description: 'CSS color value (e.g. "#111").',
                },
            },
            order: ["label", "color", "bgColor"],
        } as Ui,
    } satisfies Ui,

    disabled: {
        type: "boolean",
        label: "Disabled",
        description: "Disable user interaction with the field.",
    },

    readOnly: {
        type: "boolean",
        label: "Read-only",
        description: "Prevent edits while still allowing focus/selection.",
    },

    // --- Layout flags ---
    inline: {
        type: "boolean",
        label: "Inline",
        description:
            "Render label + input in an inline row layout (if supported).",
    },

    fullWidth: {
        type: "boolean",
        label: "Full width",
        description:
            "Stretch the field to fill its container width (if supported).",
    },
};

function withInputFieldUi(desc: InputDescriptor): InputDescriptor {
    return {
        ...desc,
        adapter: {
            getValue(e: any) {
                return e.value;
            },
            valueProp: "value",
            changeProp: "onChange",
            getInputPropsFromField({ field, props }) {
                const severityPillClassMap = {
                    info: "border-blue-200 bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
                    warning:
                        "border-amber-200 bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
                    error: "border-red-200 bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
                } as const;

                const pillBaseClassName =
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium";

                const toTagPill = (tag: any) => ({
                    label: tag.title,
                    bgColor: tag.color,
                    className: `${pillBaseClassName} ${severityPillClassMap[tag.severity as keyof typeof severityPillClassMap] ?? severityPillClassMap.info}`,
                });

                const matchesNotice = (
                    target: Field | FieldOption,
                    notice: ServicePropsNotice,
                ) => {
                    const isNodeTargetMatch =
                        notice.target.scope === "node" &&
                        notice.target.node_id === target.id;
                    const isLegacyGlobalIdMatch =
                        notice.target.scope === "global" &&
                        notice.id === target.id;
                    const isServiceMatch =
                        !!target.service_id &&
                        String(target.service_id) === notice.id;

                    return (
                        isNodeTargetMatch ||
                        isLegacyGlobalIdMatch ||
                        isServiceMatch
                    );
                };

                const notices = props.notices ?? [];

                const fieldNotices = notices.filter((notice) =>
                    matchesNotice(field, notice),
                );

                return {
                    label: field.label,
                    tags: fieldNotices.map(toTagPill),
                    required: field.required,

                    ...(field.options?.length
                        ? {
                              options: field.options.map((item) => {
                                  // @ts-ignore
                                  const optionNotices = notices.filter(
                                      (notice) => matchesNotice(item, notice),
                                  );

                                  return {
                                      ...item,
                                      tags: optionNotices.map(toTagPill),
                                  };
                              }),
                          }
                        : {}),
                };
            },
            getSelectedOptions(next, currentt, ctx) {
                return ((next as any)?.detail?.selectedOptions ?? [])?.map(
                    (item: any) => item.id,
                );
            },

            isActive(stored, ctx) {
                return Boolean(stored);
            },
        },
        ui: {
            ...inputFieldUi,
            ...(desc.ui ?? {}),
        },
    };
}

function variantOf(desc: InputDescriptor): string {
    const v = (desc.defaultProps as any)?.variant;
    if (!v || typeof v !== "string") {
        throw new Error(
            `[inputs] Descriptor is missing defaultProps.variant: ${String(v)}`,
        );
    }
    return v;
}

/**
 * Register all built-in entries.
 * - You said "variant is the only thing necessary", so we treat kind as a constant.
 */
export function registerEntries(registry: Registry): void {
    const entries: InputDescriptor[] = [
        textDescriptor,
        textareaDescriptor,
        phoneDescriptor,
        toggleGroupDescriptor,
        numberDescriptor,
        passwordDescriptor,
        sliderDescriptor,
        toggleDescriptor,
        treeSelectDescriptor,
        multiSelectDescriptor,
        selectDescriptor,
        radioDescriptor,
        checkboxDescriptor,
        chipsDescriptor,
        colorDescriptor,
        dateDescriptor,
        keyValueDescriptor,
        editorDescriptor,
        listerDescriptor,
        fileDescriptor,
    ];

    const baseEntries = entries.map((descriptor) => {
        const finalDescriptor = withInputFieldUi(descriptor);
        const variant = variantOf(finalDescriptor);

        return {
            kind: variant,
            descriptor: finalDescriptor,
        };
    });

    const checkboxOptions = withInputFieldUi(checkboxOptionsDescriptor);

    registry.registerMany([
        ...baseEntries,
        {
            kind: "checkbox",
            descriptor: checkboxOptions,
            variant: "options",
        },
    ]);
}

// re-export entries (optional convenience)
export {
    textDescriptor,
    textareaDescriptor,
    phoneDescriptor,
    toggleGroupDescriptor,
    numberDescriptor,
    passwordDescriptor,
    sliderDescriptor,
    toggleDescriptor,
    treeSelectDescriptor,
    multiSelectDescriptor,
    selectDescriptor,
    radioDescriptor,
    checkboxDescriptor,
    checkboxOptionsDescriptor,
    chipsDescriptor,
    colorDescriptor,
    dateDescriptor,
    keyValueDescriptor,
    editorDescriptor,
    listerDescriptor,
    fileDescriptor,
};
