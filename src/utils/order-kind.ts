import type { NodeMap } from "@/core/node-map";
import { buildNodeMap } from "@/core/node-map";
import type { ServiceProps } from "@/schema";

export type OrderKindNodeKind = "tag" | "field" | "option";

export type OrderKindSource = {
    nodeId: string;
    nodeKind: OrderKindNodeKind;
};

type NormalizedSelectedTrigger = {
    nodeId: string;
    nodeKind: "field" | "option";
};

export type ResolvedOrderKind = {
    kind: string | null;
    source: OrderKindSource | null;
    error?: "multiple_order_kinds_selected";
    conflictingKinds?: string[];
    conflictingNodeIds?: string[];
};

type ResolveOrderKindParams = {
    props: ServiceProps;
    activeTagId?: string;
    selectedTriggerKeys?: Iterable<string>;
    nodeMap?: NodeMap;
};

function normalizeSelectedTriggerKey(
    key: string,
    nodeMap: NodeMap,
): NormalizedSelectedTrigger | undefined {
    if (!key) return undefined;

    const ref = nodeMap.get(key);
    if (!ref) return undefined;
    if (ref.kind !== "field" && ref.kind !== "option") return undefined;

    return { nodeId: ref.id, nodeKind: ref.kind };
}

export function normalizeSelectedOrderKindTriggers(
    selectedTriggerKeys: Iterable<string> | undefined,
    nodeMap: NodeMap,
): NormalizedSelectedTrigger[] {
    if (!selectedTriggerKeys) return [];

    const out: NormalizedSelectedTrigger[] = [];
    const seen = new Set<string>();

    for (const rawKey of selectedTriggerKeys) {
        const key = String(rawKey ?? "");
        const normalized = normalizeSelectedTriggerKey(key, nodeMap);
        if (!normalized) continue;

        const dedupeKey = `${normalized.nodeKind}:${normalized.nodeId}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push(normalized);
    }

    return out;
}

export function resolveOrderKind(params: ResolveOrderKindParams): ResolvedOrderKind {
    const nodeMap = params.nodeMap ?? buildNodeMap(params.props);
    const orderKinds = params.props.orderKinds ?? {};
    const normalizedSelected = normalizeSelectedOrderKindTriggers(
        params.selectedTriggerKeys,
        nodeMap,
    );

    const selectedKindToSource = new Map<string, OrderKindSource>();
    const selectedNodeIdsForKinds = new Map<string, Set<string>>();

    for (const trigger of normalizedSelected) {
        const mappedKind = orderKinds[trigger.nodeId];
        if (typeof mappedKind !== "string") continue;

        if (!selectedKindToSource.has(mappedKind)) {
            selectedKindToSource.set(mappedKind, {
                nodeId: trigger.nodeId,
                nodeKind: trigger.nodeKind,
            });
        }

        if (!selectedNodeIdsForKinds.has(mappedKind)) {
            selectedNodeIdsForKinds.set(mappedKind, new Set<string>());
        }
        selectedNodeIdsForKinds.get(mappedKind)!.add(trigger.nodeId);
    }

    const selectedKinds = Array.from(selectedKindToSource.keys());
    if (selectedKinds.length > 1) {
        const conflictingNodeIds = Array.from(selectedNodeIdsForKinds.values())
            .flatMap((ids) => Array.from(ids))
            .filter((id, idx, arr) => arr.indexOf(id) === idx);

        return {
            kind: null,
            source: null,
            error: "multiple_order_kinds_selected",
            conflictingKinds: selectedKinds,
            conflictingNodeIds,
        };
    }

    if (selectedKinds.length === 1) {
        const selectedKind = selectedKinds[0]!;
        return {
            kind: selectedKind,
            source: selectedKindToSource.get(selectedKind)!,
        };
    }

    const activeTagId = params.activeTagId;
    if (activeTagId) {
        const tagKind = orderKinds[activeTagId];
        if (typeof tagKind === "string") {
            return {
                kind: tagKind,
                source: { nodeId: activeTagId, nodeKind: "tag" },
            };
        }
    }

    return { kind: null, source: null };
}
