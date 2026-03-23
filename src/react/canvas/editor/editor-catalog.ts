// src/react/canvas/editor/editor-catalog.ts

import type {
    CatalogId,
    CatalogNode,
    CatalogServiceId,
    CatalogSmartRule,
    ServiceCatalogState,
} from "@/schema";

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function normalizeServiceIds(
    ids: Array<CatalogServiceId> | undefined,
): Array<CatalogServiceId> {
    if (!ids?.length) return [];
    const seen = new Set<string>();
    const out: Array<CatalogServiceId> = [];

    for (const id of ids) {
        const key = String(id);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(id);
    }

    return out;
}

function sortNodes(nodes: CatalogNode[]): CatalogNode[] {
    return [...nodes].sort((a, b) => {
        const ao = a.order ?? 0;
        const bo = b.order ?? 0;
        if (ao !== bo) return ao - bo;
        return a.label.localeCompare(b.label);
    });
}

export function createEmptyCatalog(): ServiceCatalogState {
    return {
        version: 1,
        nodes: [],
        activeNodeId: undefined,
        expandedIds: [],
        pinnedNodeIds: [],
        selectedServiceId: undefined,
        viewMode: "all",
    };
}

export function ensureCatalog(
    catalog?: ServiceCatalogState,
): ServiceCatalogState {
    return clone(catalog ?? createEmptyCatalog());
}

export function getCatalogNode(
    catalog: ServiceCatalogState | undefined,
    id: CatalogId,
): CatalogNode | undefined {
    return (catalog?.nodes ?? []).find((x) => x.id === id);
}

export function getCatalogChildren(
    catalog: ServiceCatalogState | undefined,
    parentId?: CatalogId,
): CatalogNode[] {
    return sortNodes(
        (catalog?.nodes ?? []).filter((x) => x.parentId === parentId),
    );
}

export function hasCatalogNode(
    catalog: ServiceCatalogState | undefined,
    id: CatalogId,
): boolean {
    return !!getCatalogNode(catalog, id);
}

export function createCatalogId(
    catalog: ServiceCatalogState | undefined,
    prefix = "cg",
): string {
    const taken = new Set((catalog?.nodes ?? []).map((x) => x.id));
    for (let i = 1; i < 10000; i++) {
        const id = `${prefix}:${i}`;
        if (!taken.has(id)) return id;
    }
    throw new Error("Unable to generate catalog id");
}

export function addCatalogGroup(
    catalog: ServiceCatalogState | undefined,
    input: {
        id?: string;
        label: string;
        parentId?: string;
        description?: string;
        serviceIds?: Array<CatalogServiceId>;
        collapsed?: boolean;
        order?: number;
        color?: string;
        icon?: string;
    },
): ServiceCatalogState {
    const next = ensureCatalog(catalog);
    const id = input.id ?? createCatalogId(next, "cg");

    next.nodes.push({
        id,
        kind: "group",
        label: input.label,
        parentId: input.parentId,
        description: input.description,
        serviceIds: normalizeServiceIds(input.serviceIds),
        collapsed: input.collapsed,
        order: input.order,
        color: input.color,
        icon: input.icon,
    });

    next.activeNodeId = id;
    return next;
}

export function addSmartCatalogGroup(
    catalog: ServiceCatalogState | undefined,
    input: {
        id?: string;
        label: string;
        parentId?: string;
        description?: string;
        rules: CatalogSmartRule[];
        match?: "all" | "any";
        collapsed?: boolean;
        order?: number;
        color?: string;
        icon?: string;
    },
): ServiceCatalogState {
    const next = ensureCatalog(catalog);
    const id = input.id ?? createCatalogId(next, "csg");

    next.nodes.push({
        id,
        kind: "smart-group",
        label: input.label,
        parentId: input.parentId,
        description: input.description,
        rules: clone(input.rules ?? []),
        match: input.match ?? "all",
        collapsed: input.collapsed,
        order: input.order,
        color: input.color,
        icon: input.icon,
    });

    next.activeNodeId = id;
    return next;
}

export function updateCatalogNode(
    catalog: ServiceCatalogState | undefined,
    id: CatalogId,
    patch: Partial<Omit<CatalogNode, "id" | "kind">>,
): ServiceCatalogState | undefined {
    if (!catalog) return catalog;

    const next = ensureCatalog(catalog);
    const idx = next.nodes.findIndex((x) => x.id === id);
    if (idx < 0) return next;

    const current = next.nodes[idx]!;
    next.nodes[idx] = {
        ...current,
        ...patch,
    } as CatalogNode;

    if (next.nodes[idx]?.kind === "group") {
        next.nodes[idx] = {
            ...next.nodes[idx],
            serviceIds: normalizeServiceIds(
                (next.nodes[idx] as Extract<CatalogNode, { kind: "group" }>)
                    .serviceIds,
            ),
        } as CatalogNode;
    }

    return next;
}

export function setActiveCatalogNode(
    catalog: ServiceCatalogState | undefined,
    id?: CatalogId,
): ServiceCatalogState {
    const next = ensureCatalog(catalog);
    next.activeNodeId = id;
    return next;
}

export function setCatalogViewMode(
    catalog: ServiceCatalogState | undefined,
    mode: ServiceCatalogState["viewMode"],
): ServiceCatalogState {
    const next = ensureCatalog(catalog);
    next.viewMode = mode;
    return next;
}

export function setSelectedCatalogService(
    catalog: ServiceCatalogState | undefined,
    serviceId?: CatalogServiceId,
): ServiceCatalogState {
    const next = ensureCatalog(catalog);
    next.selectedServiceId = serviceId;
    return next;
}

export function toggleCatalogExpanded(
    catalog: ServiceCatalogState | undefined,
    id: CatalogId,
): ServiceCatalogState {
    const next = ensureCatalog(catalog);
    const expanded = new Set(next.expandedIds ?? []);

    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);

    next.expandedIds = Array.from(expanded);
    return next;
}

export function setCatalogExpanded(
    catalog: ServiceCatalogState | undefined,
    id: CatalogId,
    expanded: boolean,
): ServiceCatalogState {
    const next = ensureCatalog(catalog);
    const set = new Set(next.expandedIds ?? []);

    if (expanded) set.add(id);
    else set.delete(id);

    next.expandedIds = Array.from(set);
    return next;
}

export function toggleCatalogPinned(
    catalog: ServiceCatalogState | undefined,
    id: CatalogId,
): ServiceCatalogState {
    const next = ensureCatalog(catalog);
    const pinned = new Set(next.pinnedNodeIds ?? []);

    if (pinned.has(id)) pinned.delete(id);
    else pinned.add(id);

    next.pinnedNodeIds = Array.from(pinned);
    return next;
}

export function assignServicesToCatalogGroup(
    catalog: ServiceCatalogState | undefined,
    nodeId: CatalogId,
    serviceIds: Array<CatalogServiceId>,
    mode: "append" | "replace" | "remove" = "append",
): ServiceCatalogState | undefined {
    if (!catalog) return catalog;

    const next = ensureCatalog(catalog);
    const node = next.nodes.find(
        (x) => x.id === nodeId && x.kind === "group",
    ) as Extract<CatalogNode, { kind: "group" }> | undefined;

    if (!node) return next;

    const incoming = normalizeServiceIds(serviceIds);
    const current = normalizeServiceIds(node.serviceIds);

    if (mode === "replace") {
        node.serviceIds = incoming;
        return next;
    }

    if (mode === "append") {
        node.serviceIds = normalizeServiceIds([...current, ...incoming]);
        return next;
    }

    node.serviceIds = current.filter(
        (id) => !incoming.some((x) => String(x) === String(id)),
    );
    return next;
}

export function clearCatalog(): ServiceCatalogState {
    return createEmptyCatalog();
}

export function removeCatalogNode(
    catalog: ServiceCatalogState | undefined,
    id: CatalogId,
    opts?: { cascade?: boolean },
): ServiceCatalogState | undefined {
    if (!catalog) return catalog;

    const next = ensureCatalog(catalog);

    const ids = new Set<string>([id]);

    if (opts?.cascade) {
        const queue = [id];
        while (queue.length) {
            const current = queue.shift()!;
            for (const child of next.nodes.filter(
                (x) => x.parentId === current,
            )) {
                if (!ids.has(child.id)) {
                    ids.add(child.id);
                    queue.push(child.id);
                }
            }
        }
    }

    next.nodes = next.nodes.filter((x) => !ids.has(x.id));

    if (next.activeNodeId && ids.has(next.activeNodeId)) {
        next.activeNodeId = undefined;
    }

    next.expandedIds = (next.expandedIds ?? []).filter((x) => !ids.has(x));
    next.pinnedNodeIds = (next.pinnedNodeIds ?? []).filter((x) => !ids.has(x));

    return next;
}

export function moveCatalogNode(
    catalog: ServiceCatalogState | undefined,
    nodeId: CatalogId,
    opts: {
        parentId?: CatalogId;
        beforeId?: CatalogId;
        afterId?: CatalogId;
        index?: number;
    },
): ServiceCatalogState | undefined {
    if (!catalog) return catalog;

    const next = ensureCatalog(catalog);
    const node = next.nodes.find((x) => x.id === nodeId);
    if (!node) return next;

    node.parentId = opts.parentId;

    const siblings = next.nodes
        .filter((x) => x.parentId === opts.parentId && x.id !== nodeId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    let dest = typeof opts.index === "number" ? opts.index : siblings.length;

    if (opts.beforeId) {
        const idx = siblings.findIndex((x) => x.id === opts.beforeId);
        if (idx >= 0) dest = idx;
    }

    if (opts.afterId) {
        const idx = siblings.findIndex((x) => x.id === opts.afterId);
        if (idx >= 0) dest = idx + 1;
    }

    const ordered = [...siblings];
    ordered.splice(dest, 0, node);

    ordered.forEach((item, i) => {
        item.order = i;
    });

    return next;
}

export function resolveSmartCatalogGroup(
    catalog: ServiceCatalogState | undefined,
    nodeId: CatalogId,
    candidates: Array<CatalogServiceId>,
    matchers: {
        serviceField?: (
            candidate: CatalogServiceId,
            rule: Extract<CatalogSmartRule, { type: "service-field" }>,
        ) => boolean;
        policyFamily?: (
            candidate: CatalogServiceId,
            rule: Extract<CatalogSmartRule, { type: "policy-family" }>,
        ) => boolean;
        compatibility?: (
            candidate: CatalogServiceId,
            rule: Extract<CatalogSmartRule, { type: "compatibility" }>,
        ) => boolean;
    },
): ServiceCatalogState | undefined {
    if (!catalog) return catalog;

    const next = ensureCatalog(catalog);
    const node = next.nodes.find(
        (x) => x.id === nodeId && x.kind === "smart-group",
    ) as Extract<CatalogNode, { kind: "smart-group" }> | undefined;

    if (!node) return next;

    const rules = node.rules ?? [];
    const mode = node.match ?? "all";

    const resolved = candidates.filter((candidate) => {
        const results = rules.map((rule) => {
            if (rule.type === "service-field") {
                return matchers.serviceField?.(candidate, rule) ?? false;
            }
            if (rule.type === "policy-family") {
                return matchers.policyFamily?.(candidate, rule) ?? false;
            }
            return matchers.compatibility?.(candidate, rule) ?? false;
        });

        return mode === "all" ? results.every(Boolean) : results.some(Boolean);
    });

    node.resolvedServiceIds = normalizeServiceIds(resolved);
    node.resolvedAt = Date.now();

    return next;
}
