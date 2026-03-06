import React from "react";
import type { EditorSettings } from "./fallback-editor.types";

type Props = {
    value: EditorSettings;
    onChange: (next: EditorSettings) => void;
};

export function FallbackSettingsPanel({ value, onChange }: Props) {
    return (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Fallback settings
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Policy used for validation and candidate previews.
                </p>
            </div>

            <div className="space-y-4">
                <SettingRow
                    title="Require constraint fit"
                    hint="Reject or warn when a candidate does not match effective tag constraints."
                >
                    <button
                        type="button"
                        onClick={() =>
                            onChange({
                                ...value,
                                requireConstraintFit:
                                    !value.requireConstraintFit,
                            })
                        }
                        className={[
                            "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm",
                            value.requireConstraintFit
                                ? "border-green-300 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300"
                                : "border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
                        ].join(" ")}
                    >
                        <span>
                            {value.requireConstraintFit
                                ? "Enabled"
                                : "Disabled"}
                        </span>
                        <span
                            className={[
                                "h-2.5 w-2.5 rounded-full",
                                value.requireConstraintFit
                                    ? "bg-green-500"
                                    : "bg-zinc-400",
                            ].join(" ")}
                        />
                    </button>
                </SettingRow>

                <SettingRow
                    title="Rate policy"
                    hint="Defines how fallback rates are compared to the primary service."
                >
                    <select
                        value={value.ratePolicy}
                        onChange={(e) =>
                            onChange({
                                ...value,
                                ratePolicy: e.target
                                    .value as EditorSettings["ratePolicy"],
                            })
                        }
                        className="w-44 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                        <option value="lte_primary">lte_primary</option>
                        <option value="ignore">ignore</option>
                    </select>
                </SettingRow>

                <SettingRow
                    title="Selection strategy"
                    hint="How valid fallback candidates are ordered in previews."
                >
                    <select
                        value={value.selectionStrategy}
                        onChange={(e) =>
                            onChange({
                                ...value,
                                selectionStrategy: e.target
                                    .value as EditorSettings["selectionStrategy"],
                            })
                        }
                        className="w-44 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                        <option value="priority">priority</option>
                        <option value="cheapest">cheapest</option>
                    </select>
                </SettingRow>

                <SettingRow
                    title="Mode"
                    hint="Use strict for enforced filtering, dev for advisory feedback."
                >
                    <select
                        value={value.mode}
                        onChange={(e) =>
                            onChange({
                                ...value,
                                mode: e.target.value as EditorSettings["mode"],
                            })
                        }
                        className="w-44 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                        <option value="strict">strict</option>
                        <option value="dev">dev</option>
                    </select>
                </SettingRow>
            </div>
        </section>
    );
}

function SettingRow({
    title,
    hint,
    children,
}: {
    title: string;
    hint: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-3 border-b border-dashed border-zinc-200 pb-4 last:border-b-0 last:pb-0 dark:border-zinc-800 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {title}
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {hint}
                </div>
            </div>
            <div>{children}</div>
        </div>
    );
}
