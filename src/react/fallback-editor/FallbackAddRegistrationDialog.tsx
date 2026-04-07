import React from "react";
import { InputField } from "@timeax/form-palette";
import type { FallbackScopeRef, ServiceIdRef, ServiceProps } from "@/schema";
import {
    useActiveFallbackRegistrations,
    useFallbackEditor,
} from "./useFallbackEditor";

type NodeTarget = {
    id: string;
    kind: "tag" | "field" | "option" | "node";
    label: string;
    serviceId: ServiceIdRef;
};

type Props = {
    open: boolean;
    onClose: () => void;
    onSelect: (context: FallbackScopeRef, primaryId: ServiceIdRef) => void;
};

type RegistrationMode = "snapshot" | "props" | "none";

export function FallbackAddRegistrationDialog({
    open,
    onClose,
    onSelect,
}: Props) {
    const { activeServiceId, serviceProps, snapshot } = useFallbackEditor();
    const registrations = useActiveFallbackRegistrations();

    const [scope, setScope] = React.useState<"global" | "node">("global");
    const [nodeId, setNodeId] = React.useState("");

    const mode = React.useMemo<RegistrationMode>(() => {
        if (snapshot) return "snapshot";
        if (serviceProps) return "props";
        return "none";
    }, [snapshot, serviceProps]);

    React.useEffect(() => {
        if (open) {
            setScope("global");
            setNodeId("");
        }
    }, [open]);

    const hasGlobal = React.useMemo(() => {
        return registrations.some((r) => r.scope === "global");
    }, [registrations]);

    const nodeTargets = React.useMemo<NodeTarget[]>(() => {
        if (activeServiceId === undefined || activeServiceId === null) {
            return [];
        }

        if (mode === "snapshot" && snapshot?.serviceMap) {
            const out: NodeTarget[] = [];

            for (const [id, primaryIds] of Object.entries(
                snapshot.serviceMap,
            )) {
                const matchesPrimary = (primaryIds ?? []).some(
                    (serviceId) =>
                        String(serviceId) === String(activeServiceId),
                );

                if (!matchesPrimary) continue;

                const meta = resolveNodeMeta(serviceProps, id);

                out.push({
                    id,
                    kind: meta.kind,
                    label: meta.label,
                    serviceId: activeServiceId,
                });
            }

            const activeTagId = snapshot.selection?.tag;

            out.sort((a, b) => {
                if (
                    activeTagId &&
                    a.id === activeTagId &&
                    b.id !== activeTagId
                ) {
                    return -1;
                }
                if (
                    activeTagId &&
                    b.id === activeTagId &&
                    a.id !== activeTagId
                ) {
                    return 1;
                }
                return a.label.localeCompare(b.label);
            });

            const seen = new Set<string>();
            return out.filter((item) => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
            });
        }

        if (mode === "props" && serviceProps) {
            const out: NodeTarget[] = [];

            for (const tag of serviceProps.filters ?? []) {
                if (tag?.service_id === undefined || tag?.service_id === null) {
                    continue;
                }

                if (String(tag.service_id) !== String(activeServiceId)) {
                    continue;
                }

                out.push({
                    id: tag.id,
                    kind: "tag",
                    label:
                        tag.label ??
                        (tag as { title?: string }).title ??
                        tag.id,
                    serviceId: tag.service_id,
                });
            }

            for (const field of serviceProps.fields ?? []) {
                if (
                    field?.service_id !== undefined &&
                    field?.service_id !== null &&
                    String(field.service_id) === String(activeServiceId)
                ) {
                    out.push({
                        id: field.id,
                        kind: "field",
                        label:
                            field.label ??
                            (field as { title?: string }).title ??
                            field.id,
                        serviceId: field.service_id,
                    });
                }

                for (const option of field.options ?? []) {
                    if (
                        option?.service_id === undefined ||
                        option?.service_id === null
                    ) {
                        continue;
                    }

                    if (String(option.service_id) !== String(activeServiceId)) {
                        continue;
                    }

                    out.push({
                        id: option.id,
                        kind: "option",
                        label:
                            option.label ??
                            (option as { title?: string }).title ??
                            String(
                                (option as { value?: unknown }).value ??
                                    option.id,
                            ),
                        serviceId: option.service_id,
                    });
                }
            }

            const seen = new Set<string>();
            return out.filter((item) => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
            });
        }

        return [];
    }, [mode, snapshot, serviceProps, activeServiceId]);

    React.useEffect(() => {
        if (hasGlobal && scope === "global") {
            setScope("node");
        }
    }, [hasGlobal, scope]);

    React.useEffect(() => {
        if (scope === "node" && nodeId) {
            const exists = nodeTargets.some((node) => node.id === nodeId);
            if (!exists) setNodeId("");
        }
    }, [scope, nodeId, nodeTargets]);

    function handleContinue() {
        if (activeServiceId === undefined || activeServiceId === null) return;

        if (scope === "global") {
            onSelect(
                {
                    scope: "global",
                    primary: activeServiceId,
                },
                activeServiceId,
            );
            return;
        }

        if (!nodeId) return;

        const node = nodeTargets.find((n) => n.id === nodeId);
        onSelect(
            {
                scope: "node",
                nodeId,
            },
            node?.serviceId ?? activeServiceId,
        );
    }

    if (!open) return null;

    const nodeScopeDisabled = nodeTargets.length === 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
                <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        Add registration
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        Choose the registration scope before selecting fallback
                        candidates.
                    </p>
                </div>

                <div className="space-y-4 p-4">
                    <div className="space-y-2">
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            Scope
                        </div>

                        <InputField
                            variant="radio"
                            value={scope}
                            onChange={({ value }) =>
                                setScope(value as "global" | "node")
                            }
                            options={[
                                ...(!hasGlobal
                                    ? [
                                          {
                                              value: "global",
                                              label: "Global",
                                          },
                                      ]
                                    : []),
                                {
                                    value: "node",
                                    label: nodeScopeDisabled
                                        ? "Node (Unavailable)"
                                        : "Node",
                                },
                            ]}
                        />

                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {scope === "global"
                                ? "Use one global registration for this primary service."
                                : mode === "snapshot"
                                  ? "Pick a node currently active in the order snapshot for this primary service."
                                  : mode === "props"
                                    ? "Pick a tag, field, or option from ServiceProps that maps to this primary service."
                                    : "Node-scoped registration is unavailable without OrderSnapshot or ServiceProps."}
                        </div>
                    </div>

                    {scope === "node" && (
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                Node id
                            </div>
                            <InputField
                                variant="select"
                                value={nodeId || undefined}
                                onChange={({ value }) =>
                                    setNodeId(String(value ?? ""))
                                }
                                options={nodeTargets.map((node) => ({
                                    value: node.id,
                                    label: `[${node.kind}] ${node.label} · #${String(node.serviceId)}`,
                                }))}
                                placeholder="Select node..."
                                searchable
                                clearable={false}
                                fullWidth
                            />

                            {nodeScopeDisabled ? (
                                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {mode === "snapshot"
                                        ? "No active snapshot nodes were found for this primary service."
                                        : mode === "props"
                                          ? "No ServiceProps nodes were found for this primary service."
                                          : "Node-scoped registration requires either OrderSnapshot or ServiceProps."}
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-800">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleContinue}
                        disabled={
                            activeServiceId === undefined ||
                            (scope === "node" && !nodeId)
                        }
                        className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Continue
                    </button>
                </div>
            </div>
        </div>
    );
}

function resolveNodeMeta(
    props: ServiceProps | undefined,
    nodeId: string,
): { kind: "tag" | "field" | "option" | "node"; label: string } {
    if (!props) {
        return { kind: "node", label: nodeId };
    }

    const tag = props.filters?.find((t) => t.id === nodeId);
    if (tag) {
        return {
            kind: "tag",
            label: tag.label ?? (tag as { title?: string }).title ?? tag.id,
        };
    }

    const field = props.fields?.find((f) => f.id === nodeId);
    if (field) {
        return {
            kind: "field",
            label:
                field.label ?? (field as { title?: string }).title ?? field.id,
        };
    }

    for (const fieldItem of props.fields ?? []) {
        const option = fieldItem.options?.find((o) => o.id === nodeId);
        if (option) {
            return {
                kind: "option",
                label:
                    option.label ??
                    (option as { title?: string }).title ??
                    String((option as { value?: unknown }).value ?? option.id),
            };
        }
    }

    return { kind: "node", label: nodeId };
}
