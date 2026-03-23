import React from "react";
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
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
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
                    <button
                        type="button"
                        onClick={() =>
                            setDraft((prev) => ({
                                ...prev,
                                requireConstraintFit:
                                    !prev?.requireConstraintFit,
                            }))
                        }
                        className={[
                            "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm",
                            draft.requireConstraintFit
                                ? "border-green-300 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300"
                                : "border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
                        ].join(" ")}
                    >
                        <span>
                            {draft.requireConstraintFit
                                ? "Enabled"
                                : "Disabled"}
                        </span>
                        <span
                            className={[
                                "h-2.5 w-2.5 rounded-full",
                                draft.requireConstraintFit
                                    ? "bg-green-500"
                                    : "bg-zinc-400",
                            ].join(" ")}
                        />
                    </button>
                </SettingRow>

                <SettingRow
                    title="Rate policy"
                    hint="Controls how fallback service rates are compared against the primary service."
                >
                    <div className="flex flex-col gap-2 md:items-end">
                        <select
                            value={ratePolicy.kind}
                            onChange={(e) => {
                                const kind = e.target
                                    .value as RatePolicy["kind"];

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
                            className="w-56 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        >
                            <option value="eq_primary">eq_primary</option>
                            <option value="lte_primary">lte_primary</option>
                            <option value="within_pct">within_pct</option>
                            <option value="at_least_pct_lower">
                                at_least_pct_lower
                            </option>
                        </select>

                        {ratePolicy.kind !== "eq_primary" && (
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={ratePolicy.pct}
                                    onChange={(e) => {
                                        const pct = Number(e.target.value || 0);

                                        setRatePolicy({ ...ratePolicy, pct });
                                    }}
                                    className="w-32 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                                />
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
                    <select
                        value={draft.selectionStrategy ?? "priority"}
                        onChange={(e) =>
                            setDraft((prev) => ({
                                ...prev,
                                selectionStrategy: e.target.value as
                                    | "priority"
                                    | "cheapest",
                            }))
                        }
                        className="w-48 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
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
                        value={draft.mode ?? "strict"}
                        onChange={(e) =>
                            setDraft((prev) => ({
                                ...prev,
                                mode: e.target.value as "strict" | "dev",
                            }))
                        }
                        className="w-48 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                        <option value="strict">strict</option>
                        <option value="dev">dev</option>
                    </select>
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
