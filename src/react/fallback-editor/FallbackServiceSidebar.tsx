import React, { useMemo, useState } from "react";
import { InputField } from "@timeax/form-palette";
import { Search } from "lucide-react";
import { useFallbackEditor, usePrimaryServiceList } from "./useFallbackEditor";

export function FallbackServiceSidebar() {
    const { activeServiceId, setActiveServiceId, get } = useFallbackEditor();
    const services = usePrimaryServiceList();
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return services;

        return services.filter(
            (service) =>
                String(service.id).includes(q) ||
                String(service.name ?? "")
                    .toLowerCase()
                    .includes(q) ||
                String(service.platform ?? "")
                    .toLowerCase()
                    .includes(q),
        );
    }, [query, services]);

    return (
        <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Primary services
                </h2>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Services currently active in the builder/runtime context.
                </p>
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-4">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-2 dark:border-zinc-800 dark:bg-zinc-950/80">
                    <InputField
                        variant="text"
                        value={query}
                        onChange={({ value }) => setQuery(String(value ?? ""))}
                        placeholder="Search primary service..."
                        leadingControl={
                            <Search className="h-4 w-4 text-zinc-400" />
                        }
                        joinControls
                        extendBoxToControls
                        fullWidth
                    />
                </div>

                <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
                    {filtered.map((service) => {
                        const active =
                            String(service.id) === String(activeServiceId);
                        const count = get(service.id).length;

                        return (
                            <button
                                key={String(service.id)}
                                type="button"
                                onClick={() => setActiveServiceId(service.id)}
                                className={[
                                    "w-full rounded-2xl border p-3 text-left transition",
                                    active
                                        ? "border-blue-500 bg-blue-50 dark:border-blue-500/70 dark:bg-blue-950/30"
                                        : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900",
                                ].join(" ")}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                            #{String(service.id)} ·{" "}
                                            {service.name ?? "Unnamed"}
                                        </div>
                                        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                            {service.platform ?? "Unknown"}
                                            {typeof service.rate === "number"
                                                ? ` · rate ${service.rate}`
                                                : ""}
                                        </div>
                                    </div>

                                    <span className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                                        {count} reg
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </aside>
    );
}
