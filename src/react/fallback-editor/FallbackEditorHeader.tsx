import React from "react";

type Props = {
    onReset?: () => void | Promise<void>;
    onValidate?: () => void | Promise<void>;
    onSave?: () => void | Promise<void>;
    resetting?: boolean;
    validating?: boolean;
    saving?: boolean;
};

export function FallbackEditorHeader({
    onReset,
    onValidate,
    onSave,
    resetting = false,
    validating = false,
    saving = false,
}: Props) {
    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-center md:justify-between">
            <div>
                <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Fallback Editor
                </h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Manage global and node-scoped fallback registrations with
                    live validation hints.
                </p>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={onReset}
                    disabled={resetting}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                    {resetting ? "Resetting..." : "Reset"}
                </button>
                <button
                    type="button"
                    onClick={onValidate}
                    disabled={validating}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                    {validating ? "Validating..." : "Validate"}
                </button>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {saving ? "Saving..." : "Save"}
                </button>
            </div>
        </div>
    );
}
