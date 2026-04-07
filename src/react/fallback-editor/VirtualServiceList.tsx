import React from "react";
import { Check } from "lucide-react";
import type { ServiceIdRef } from "@/schema";

type Item = {
    id: ServiceIdRef;
    name?: string;
    platform?: string;
    rate?: number;
};

type Props = {
    items: Item[];
    selected: Set<string>;
    onToggle: (id: ServiceIdRef) => void;
    height?: number;
    rowHeight?: number;
    emptyText?: string;
};

export function VirtualServiceList({
    items,
    selected,
    onToggle,
    height = 420,
    rowHeight = 52,
    emptyText = "No services found.",
}: Props) {
    const [scrollTop, setScrollTop] = React.useState(0);

    const total = items.length;
    const visibleCount = Math.ceil(height / rowHeight);
    const overscan = 8;

    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(total, start + visibleCount + overscan * 2);

    const visible = items.slice(start, end);

    if (total === 0) {
        return (
            <div
                className="flex items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
                style={{ height }}
            >
                {emptyText}
            </div>
        );
    }

    return (
        <div
            className="overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800"
            style={{ height }}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
            <div className="relative" style={{ height: total * rowHeight }}>
                {visible.map((item, i) => {
                    const index = start + i;
                    const key = String(item.id);
                    const checked = selected.has(key);

                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onToggle(item.id)}
                            className="absolute left-0 right-0 flex items-center justify-between border-b border-zinc-100 bg-white px-3 text-left transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                            style={{
                                top: index * rowHeight,
                                height: rowHeight,
                            }}
                        >
                            <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                    #{String(item.id)} ·{" "}
                                    {item.name ?? "Unnamed"}
                                </div>
                                <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                    {item.platform ?? "Unknown"}
                                    {typeof item.rate === "number"
                                        ? ` · rate ${item.rate}`
                                        : ""}
                                </div>
                            </div>

                            <span
                                className={[
                                    "inline-flex h-4 w-4 items-center justify-center rounded border transition",
                                    checked
                                        ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                                        : "border-zinc-300 bg-white text-transparent dark:border-zinc-700 dark:bg-zinc-800",
                                ].join(" ")}
                            >
                                <Check className="h-3 w-3" />
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
