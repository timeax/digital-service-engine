// fallback-editor/FallbackDetailsPanel.tsx
import React from "react";
import { useFallbackEditor } from "./useFallbackEditor";

export function FallbackDetailsPanel() {
    const { activeServiceId, editor, version, state } = useFallbackEditor();

    const services = React.useMemo(() => {
        const map = (editor as any).source?.()?.services;
        if (!map) return [];
        return Object.values(map) as Array<{
            id: string | number;
            name?: string;
            platform?: string;
            rate?: number;
        }>;
    }, [editor, version]);

    const service = React.useMemo(
        () => services.find((s) => String(s.id) === String(activeServiceId)),
        [services, activeServiceId],
    );

    return (
        <aside className="flex min-h-0 flex-col gap-4">
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Service info
                </h3>

                {!service ? (
                    <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                        No service selected.
                    </p>
                ) : (
                    <div className="mt-3 space-y-2 text-sm">
                        <Detail label="ID" value={String(service.id)} />
                        <Detail
                            label="Name"
                            value={service.name ?? "Unnamed"}
                        />
                        <Detail
                            label="Platform"
                            value={service.platform ?? "—"}
                        />
                        <Detail
                            label="Rate"
                            value={
                                typeof service.rate === "number"
                                    ? String(service.rate)
                                    : "—"
                            }
                        />
                        <Detail
                            label="Changed"
                            value={state.changed ? "yes" : "no"}
                        />
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Current payload
                </h3>

                <pre className="mt-3 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100">
                    {JSON.stringify(state.current, null, 2)}
                </pre>
            </section>
        </aside>
    );
}

function Detail({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4">
            <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
            <span className="text-right text-zinc-900 dark:text-zinc-100">
                {value}
            </span>
        </div>
    );
}
