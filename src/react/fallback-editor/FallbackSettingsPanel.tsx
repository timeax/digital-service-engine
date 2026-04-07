import React from "react";
import { InputField } from "@timeax/form-palette";
import type { FallbackSettings, RatePolicy } from "@/schema/validation";
import { useFallbackEditorContext } from "./FallbackEditorProvider";

export function FallbackSettingsPanel() {
    const { settings, saveSettings, settingsSaving } =
        useFallbackEditorContext();

    const [draft, setDraft] = React.useState<FallbackSettings>(settings);
    const [error, setError] = React.useState<string | null>(null);
    const [saved, setSaved] = React.useState(false);

    React.useEffect(() => {
        setDraft(settings);
        setSaved(false);
        setError(null);
    }, [settings]);

    const changed =
        JSON.stringify(draft ?? {}) !== JSON.stringify(settings ?? {});

    async function handleSave() {
        setError(null);
        setSaved(false);

        try {
            await saveSettings(draft);
            setSaved(true);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to save fallback settings.",
            );
        }
    }

    function setRatePolicy(next: RatePolicy) {
        setDraft((prev) => ({
            ...prev,
            ratePolicy: next,
        }));
    }

    const ratePolicy: RatePolicy = draft.ratePolicy ?? {
        kind: "lte_primary",
        pct: 5,
    };

    return (
        <section className="overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Fallback settings
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        These settings can be persisted by the host and returned
                        into the editor.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!changed || settingsSaving}
                    className={[
                        "rounded-xl px-3 py-2 text-sm font-medium transition",
                        !changed || settingsSaving
                            ? "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
                            : "bg-blue-600 text-white hover:bg-blue-700",
                    ].join(" ")}
                >
                    {settingsSaving ? "Saving..." : "Save settings"}
                </button>
            </div>

            <div className="space-y-4">
                <SettingRow
                    title="Require constraint fit"
                    hint="Reject or warn when a candidate does not match effective tag constraints."
                >
                    <InputField
                        variant="toggle"
                        value={Boolean(draft.requireConstraintFit)}
                        onChange={({ value }) =>
                            setDraft((prev) => ({
                                ...prev,
                                requireConstraintFit: Boolean(value),
                            }))
                        }
                        onText="Enabled"
                        offText="Disabled"
                    />
                </SettingRow>

                <SettingRow
                    title="Rate policy"
                    hint="Controls how fallback service rates are compared against the primary service."
                >
                    <div className="flex flex-col gap-2 md:items-end">
                        <InputField
                            variant="select"
                            value={ratePolicy.kind}
                            onChange={({ value }) => {
                                const kind = value as RatePolicy["kind"];

                                if (kind === "eq_primary") {
                                    setRatePolicy({ kind: "eq_primary" });
                                    return;
                                }

                                const currentPct =
                                    ratePolicy.kind === "eq_primary"
                                        ? 5
                                        : ratePolicy.pct;

                                if (kind === "lte_primary") {
                                    setRatePolicy({
                                        kind: "lte_primary",
                                        pct: currentPct,
                                    });
                                    return;
                                }

                                if (kind === "within_pct") {
                                    setRatePolicy({
                                        kind: "within_pct",
                                        pct: currentPct,
                                    });
                                    return;
                                }

                                setRatePolicy({
                                    kind: "at_least_pct_lower",
                                    pct: currentPct,
                                });
                            }}
                            options={[
                                { value: "eq_primary", label: "eq_primary" },
                                {
                                    value: "lte_primary",
                                    label: "lte_primary",
                                },
                                { value: "within_pct", label: "within_pct" },
                                {
                                    value: "at_least_pct_lower",
                                    label: "at_least_pct_lower",
                                },
                            ]}
                            clearable={false}
                        />

                        {ratePolicy.kind !== "eq_primary" && (
                            <div className="flex items-center gap-2">
                                <div className="w-32">
                                    <InputField
                                        variant="number"
                                        value={ratePolicy.pct}
                                        onChange={({ value }) => {
                                            const pct =
                                                typeof value === "number"
                                                    ? value
                                                    : Number(value ?? 0);

                                            setRatePolicy({
                                                ...ratePolicy,
                                                pct,
                                            });
                                        }}
                                        min={0}
                                        step={0.01}
                                        fullWidth
                                    />
                                </div>
                                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                                    %
                                </span>
                            </div>
                        )}
                    </div>
                </SettingRow>

                <SettingRow
                    title="Selection strategy"
                    hint="How valid fallback candidates are ordered in previews."
                >
                    <InputField
                        variant="select"
                        value={draft.selectionStrategy ?? "priority"}
                        onChange={({ value }) =>
                            setDraft((prev) => ({
                                ...prev,
                                selectionStrategy: value as
                                    | "priority"
                                    | "cheapest",
                            }))
                        }
                        options={[
                            { value: "priority", label: "priority" },
                            { value: "cheapest", label: "cheapest" },
                        ]}
                        clearable={false}
                    />
                </SettingRow>

                <SettingRow
                    title="Mode"
                    hint="Use strict for enforced filtering, dev for advisory feedback."
                >
                    <InputField
                        variant="select"
                        value={draft.mode ?? "strict"}
                        onChange={({ value }) =>
                            setDraft((prev) => ({
                                ...prev,
                                mode: value as "strict" | "dev",
                            }))
                        }
                        options={[
                            { value: "strict", label: "strict" },
                            { value: "dev", label: "dev" },
                        ]}
                        clearable={false}
                    />
                </SettingRow>
            </div>

            {saved && !error ? (
                <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-300">
                    Settings saved.
                </div>
            ) : null}

            {error ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
                    {error}
                </div>
            ) : null}
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
