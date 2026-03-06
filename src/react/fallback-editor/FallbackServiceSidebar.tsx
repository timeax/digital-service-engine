import React, { useMemo, useState } from "react";
import type { ServiceIdRef } from "@/schema";
import type { RegistrationItem, ServiceSummary } from "./fallback-editor.types";

type Props = {
    services: ServiceSummary[];
    registrations: RegistrationItem[];
    activeServiceId?: ServiceIdRef;
    onSelect: (id: ServiceIdRef) => void;
};

export function FallbackServiceSidebar({
    services,
    registrations,
    activeServiceId,
    onSelect,
}: Props) {
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return services;
        return services.filter(
            (service) =>
                String(service.id).includes(q) ||
                service.name.toLowerCase().includes(q) ||
                (service.platform ?? "").toLowerCase().includes(q),
        );
    }, [query, services]);

    const countFor = (id: ServiceIdRef) =>
        registrations.filter((r) => String(r.primary) === String(id)).length;

    return (
        <aside className="flex min-h-0 flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Services
                </h2>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Select a primary service
                </p>
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-4">
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search service..."
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-0 placeholder:text-zinc-400 focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />

                <div className="mt-3 flex-1 space-y-2 overflow-auto">
                    {filtered.map((service) => {
                        const active =
                            String(service.id) === String(activeServiceId);
                        const count = countFor(service.id);

                        return (
                            <button
                                key={String(service.id)}
                                type="button"
                                onClick={() => onSelect(service.id)}
                                className={[
                                    "w-full rounded-2xl border p-3 text-left transition",
                                    active
                                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                                        : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700",
                                ].join(" ")}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                            #{String(service.id)} ·{" "}
                                            {service.name}
                                        </div>
                                        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                            {service.platform ??
                                                "Unknown platform"}
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
