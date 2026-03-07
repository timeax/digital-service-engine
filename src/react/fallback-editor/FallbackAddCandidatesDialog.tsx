import React from "react";
import type { FallbackScopeRef, ServiceIdRef } from "@/schema";
import { useEligibleServiceList, useFallbackEditor } from "./useFallbackEditor";
import { VirtualServiceList } from "./VirtualServiceList";

type Props = {
    open: boolean;
    onClose: () => void;
    context: FallbackScopeRef | null;
    primaryId?: ServiceIdRef;
};

export function FallbackAddCandidatesDialog({
    open,
    onClose,
    context,
    primaryId,
}: Props) {
    const { eligible, addMany } = useFallbackEditor();
    const eligibleServices = useEligibleServiceList();

    const [query, setQuery] = React.useState("");
    const [filterEligibleOnly, setFilterEligibleOnly] = React.useState(true);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [submitting, setSubmitting] = React.useState(false);

    React.useEffect(() => {
        if (!open) {
            setQuery("");
            setFilterEligibleOnly(true);
            setSelected(new Set());
        }
    }, [open]);

    const allowedIds = React.useMemo(() => {
        if (!context) return null;
        if (!filterEligibleOnly) return null;
        return new Set(eligible(context).map((id) => String(id)));
    }, [context, filterEligibleOnly, eligible]);

    const items = React.useMemo(() => {
        const q = query.trim().toLowerCase();

        return eligibleServices.filter((service) => {
            if (
                primaryId !== undefined &&
                String(service.id) === String(primaryId)
            ) {
                return false;
            }

            if (allowedIds && !allowedIds.has(String(service.id))) {
                return false;
            }

            if (!q) return true;

            return (
                String(service.id).includes(q) ||
                String(service.name ?? "")
                    .toLowerCase()
                    .includes(q) ||
                String(service.platform ?? "")
                    .toLowerCase()
                    .includes(q)
            );
        });
    }, [eligibleServices, allowedIds, query, primaryId]);

    function toggle(id: ServiceIdRef) {
        setSelected((prev) => {
            const next = new Set(prev);
            const key = String(id);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    async function handleAdd() {
        if (!context || selected.size === 0) return;

        setSubmitting(true);
        try {
            const ids = items
                .filter((item) => selected.has(String(item.id)))
                .map((item) => item.id);

            addMany(context, ids);
            onClose();
        } finally {
            setSubmitting(false);
        }
    }

    if (!open || !context) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
                <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        Add fallback services
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        Search and select one or more eligible fallback
                        candidates.
                    </p>
                </div>

                <div className="flex flex-col gap-3 p-4">
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search eligible services..."
                        className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />

                    <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <input
                            type="checkbox"
                            checked={filterEligibleOnly}
                            onChange={(e) =>
                                setFilterEligibleOnly(e.target.checked)
                            }
                            className="h-4 w-4 rounded border-zinc-300"
                        />
                        Filter eligible only
                    </label>

                    <VirtualServiceList
                        items={items}
                        selected={selected}
                        onToggle={toggle}
                        emptyText="No eligible services found."
                    />
                </div>

                <div className="flex items-center justify-between border-t border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                        {selected.size} selected
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleAdd}
                            disabled={selected.size === 0 || submitting}
                            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {submitting ? "Adding..." : "Add selected"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
