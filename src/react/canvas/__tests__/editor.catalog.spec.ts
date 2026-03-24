import { describe, expect, it, vi } from "vitest";
import { createBuilder } from "@/core";
import type {
    CatalogNode,
    CatalogServiceId,
    CatalogSmartRule,
    ServiceCatalogState,
    ServiceProps,
} from "@/schema";
import { CanvasAPI } from "../api";

function baseProps(): ServiceProps {
    return {
        schema_version: "1.0",
        filters: [{ id: "t:root", label: "Root" }],
        fields: [{ id: "f:seed", type: "text", bind_id: "t:root", label: "Seed" }],
    };
}

function setup() {
    const builder = createBuilder();
    builder.load(baseProps());
    const api = new CanvasAPI(builder, { autoEmitState: false });
    return { builder, api, editor: api.editor };
}

function getNode(
    catalog: ServiceCatalogState | undefined,
    id: string,
): CatalogNode | undefined {
    return catalog?.nodes.find((node) => node.id === id);
}

describe("Editor catalog API", () => {
    it("starts without a catalog, ensures a default catalog, and returns clones", () => {
        const { editor } = setup();

        expect(editor.getCatalog()).toBeUndefined();

        const ensured = editor.ensureCatalog();
        expect(ensured).toEqual({
            version: 1,
            nodes: [],
            activeNodeId: undefined,
            expandedIds: [],
            pinnedNodeIds: [],
            selectedServiceId: undefined,
            viewMode: "all",
        });

        const snapshot = editor.getCatalog();
        expect(snapshot).toEqual(ensured);

        snapshot!.nodes.push({
            id: "cg:mutated",
            kind: "group",
            label: "Mutated",
            serviceIds: [],
        });
        snapshot!.expandedIds?.push("cg:mutated");

        const fresh = editor.getCatalog();
        expect(fresh?.nodes).toHaveLength(0);
        expect(fresh?.expandedIds).toEqual([]);
    });

    it("sets, clears, and emits catalog change events without emitting editor:change", () => {
        const { api, editor } = setup();
        const onCatalogChange = vi.fn();
        const onEditorChange = vi.fn();
        api.on("catalog:change" as any, onCatalogChange);
        api.on("editor:change" as any, onEditorChange);

        const catalog: ServiceCatalogState = {
            version: 1,
            nodes: [
                {
                    id: "cg:seed",
                    kind: "group",
                    label: "Seed",
                    serviceIds: [101],
                },
            ],
            activeNodeId: "cg:seed",
            expandedIds: [],
            pinnedNodeIds: [],
            selectedServiceId: 101,
            viewMode: "grouped",
        };

        editor.setCatalog(catalog);
        const data = {
            layout: {
                canvas: {
                    graph: {
                        edges: [
                            {
                                from: "t:root",
                                kind: "bind",
                                to: "f:seed",
                            },
                        ],
                        nodes: [
                            {
                                id: "t:root",
                                kind: "tag",
                                label: "Root",
                            },
                            {
                                bind_type: "bound",
                                id: "f:seed",
                                kind: "field",
                                label: "Seed",
                            },
                        ],
                    },
                    highlighted: new Set(),
                    positions: {},
                    selection: new Set(),
                    version: 1,
                    viewport: {
                        x: 0,
                        y: 0,
                        zoom: 1,
                    },
                },
            },
            props: {
                fields: [
                    {
                        bind_id: "t:root",
                        id: "f:seed",
                        label: "Seed",
                        pricing_role: "base",
                        required: false,
                        type: "text",
                    },
                ],
                filters: [
                    {
                        constraints: undefined,
                        constraints_origin: undefined,
                        constraints_overrides: undefined,
                        id: "t:root",
                        label: "Root",
                    },
                ],
                order_for_tags: undefined,
                schema_version: "1.0",
            },
        };
        expect(editor.getCatalog()).toEqual(catalog);
        expect(onCatalogChange).toHaveBeenNthCalledWith(1, {
            catalog,
            reason: "catalog:set",
            snapshot: {
                catalog,
                ...data
            },
        });

        editor.clearCatalog();
        expect(editor.getCatalog()).toBeUndefined();
        expect(onCatalogChange).toHaveBeenNthCalledWith(2, {
            catalog: undefined,
            reason: "catalog:clear",
            snapshot: {
                catalog: undefined,
                ...data,
            },
        });
        expect(onEditorChange).not.toHaveBeenCalled();
    });

    it("creates groups, creates smart groups, updates nodes, and emits the expected reasons", () => {
        const { api, editor } = setup();
        const onCatalogChange = vi.fn();
        api.on("catalog:change" as any, onCatalogChange);

        const groupId = editor.createCatalogGroup({
            label: "Payments",
            serviceIds: [1, 1, "1", 2],
        });
        expect(groupId).toBe("cg:1");

        const smartRules: CatalogSmartRule[] = [
            { type: "policy-family", key: "risk", value: "safe" },
        ];
        const smartId = editor.createSmartCatalogGroup({
            label: "Safe",
            parentId: groupId,
            rules: smartRules,
        });

        editor.updateCatalogNode(groupId, {
            label: "Payments Updated",
            serviceIds: [2, 2, 3],
        } as Partial<Omit<CatalogNode, "id" | "kind">>);

        const catalog = editor.getCatalog();
        expect(catalog?.activeNodeId).toBe(smartId);
        expect(getNode(catalog, groupId)).toMatchObject({
            id: groupId,
            kind: "group",
            label: "Payments Updated",
            serviceIds: [2, 3],
        });
        expect(getNode(catalog, smartId)).toMatchObject({
            id: smartId,
            kind: "smart-group",
            parentId: groupId,
            label: "Safe",
            match: "all",
            rules: smartRules,
        });

        expect(onCatalogChange.mock.calls.map((call) => call[0].reason)).toEqual([
            "catalog:create-group",
            "catalog:create-smart-group",
            "catalog:update-node",
        ]);
    });

    it("assigns services, updates catalog view state, and emits active change events", () => {
        const { api, editor } = setup();
        const onCatalogChange = vi.fn();
        const onActiveChange = vi.fn();
        api.on("catalog:change" as any, onCatalogChange);
        api.on("catalog:active-change" as any, onActiveChange);

        const groupId = editor.createCatalogGroup({
            label: "Assigned",
            serviceIds: [10, 10],
        });

        editor.assignServicesToCatalogGroup(groupId, [11, "11", 12], "append");
        editor.assignServicesToCatalogGroup(groupId, [12], "remove");
        editor.assignServicesToCatalogGroup(groupId, [99, 99, 100], "replace");
        editor.setCatalogViewMode("assigned");
        editor.setSelectedCatalogService(100);
        editor.toggleCatalogExpanded(groupId);
        editor.setCatalogExpanded(groupId, false);
        editor.toggleCatalogPinned(groupId);
        editor.setActiveCatalogNode(groupId);

        const catalog = editor.getCatalog();
        expect(getNode(catalog, groupId)).toMatchObject({
            serviceIds: [99, 100],
        });
        expect(catalog?.viewMode).toBe("assigned");
        expect(catalog?.selectedServiceId).toBe(100);
        expect(catalog?.expandedIds).toEqual([]);
        expect(catalog?.pinnedNodeIds).toEqual([groupId]);
        expect(catalog?.activeNodeId).toBe(groupId);

        expect(onActiveChange).toHaveBeenCalledWith({ activeNodeId: groupId });
        expect(onCatalogChange.mock.calls.map((call) => call[0].reason)).toEqual([
            "catalog:create-group",
            "catalog:assign-services",
            "catalog:assign-services",
            "catalog:assign-services",
            "catalog:set-view-mode",
            "catalog:set-selected-service",
            "catalog:toggle-expanded",
            "catalog:set-expanded",
            "catalog:toggle-pinned",
            "catalog:set-active",
        ]);
    });

    it("moves nodes by index, beforeId, and afterId and removes cascaded descendants with cleanup", () => {
        const { editor } = setup();

        const parentId = editor.createCatalogGroup({ label: "Parent" });
        const childId = editor.createCatalogGroup({
            label: "Child",
            parentId,
        });
        const siblingA = editor.createCatalogGroup({ label: "Sibling A" });
        const siblingB = editor.createCatalogGroup({ label: "Sibling B" });
        const siblingC = editor.createCatalogGroup({ label: "Sibling C" });

        editor.toggleCatalogExpanded(parentId);
        editor.toggleCatalogExpanded(childId);
        editor.toggleCatalogPinned(parentId);
        editor.toggleCatalogPinned(childId);
        editor.setActiveCatalogNode(childId);

        editor.moveCatalogNode(siblingC, { index: 0 });
        editor.moveCatalogNode(siblingA, { afterId: siblingB });
        editor.moveCatalogNode(siblingB, { beforeId: siblingC });

        let catalog = editor.getCatalog();
        let rootNodes = catalog?.nodes
            .filter((node) => node.parentId === undefined)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((node) => node.id);
        expect(rootNodes).toEqual([siblingB, siblingC, parentId, siblingA]);

        editor.removeCatalogNode(parentId, { cascade: true });

        catalog = editor.getCatalog();
        expect(getNode(catalog, parentId)).toBeUndefined();
        expect(getNode(catalog, childId)).toBeUndefined();
        expect(catalog?.activeNodeId).toBeUndefined();
        expect(catalog?.expandedIds).toEqual([]);
        expect(catalog?.pinnedNodeIds).toEqual([]);
    });

    it("resolves smart groups for all and any match modes and persists the resolved ids", () => {
        const { editor } = setup();
        const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_717_171_717_000);

        try {
            const allId = editor.createSmartCatalogGroup({
                label: "All Match",
                rules: [
                    {
                        type: "service-field",
                        field: "tier",
                        op: "eq",
                        value: "gold",
                    },
                    {
                        type: "compatibility",
                        scope: "tag",
                        targetId: "t:root",
                        mode: "safe",
                    },
                ],
            });

            const anyId = editor.createSmartCatalogGroup({
                label: "Any Match",
                match: "any",
                rules: [
                    {
                        type: "service-field",
                        field: "tier",
                        op: "eq",
                        value: "gold",
                    },
                    { type: "policy-family", key: "family", value: "core" },
                ],
            });

            const candidates: CatalogServiceId[] = [1, 2, 3];
            const allResolved = editor.resolveSmartCatalogGroup(allId, candidates, {
                serviceField: (candidate) => candidate !== 2,
                compatibility: (candidate) => candidate === 1 || candidate === 3,
            });
            const anyResolved = editor.resolveSmartCatalogGroup(anyId, candidates, {
                serviceField: (candidate) => candidate === 2,
                policyFamily: (candidate) => candidate === 3,
            });

            const catalog = editor.getCatalog();
            expect(allResolved).toEqual([1, 3]);
            expect(getNode(catalog, allId)).toMatchObject({
                resolvedServiceIds: [1, 3],
                resolvedAt: 1_717_171_717_000,
            });

            expect(anyResolved).toEqual([2, 3]);
            expect(getNode(catalog, anyId)).toMatchObject({
                resolvedServiceIds: [2, 3],
                resolvedAt: 1_717_171_717_000,
            });
        } finally {
            nowSpy.mockRestore();
        }
    });

    it("keeps catalog state unchanged across undo and redo while normal editor history still works", () => {
        const { builder, editor } = setup();

        const groupId = editor.createCatalogGroup({
            label: "Stable Catalog",
            serviceIds: [101, 102],
        });
        editor.toggleCatalogPinned(groupId);
        editor.setCatalogViewMode("grouped");

        const catalogBeforeMutation = editor.getCatalog();

        editor.addTag({ label: "Undoable Tag" });
        expect(builder.getProps().filters.some((tag) => tag.label === "Undoable Tag")).toBe(
            true,
        );

        expect(editor.undo()).toBe(true);
        expect(builder.getProps().filters.some((tag) => tag.label === "Undoable Tag")).toBe(
            false,
        );
        expect(editor.getCatalog()).toEqual(catalogBeforeMutation);

        expect(editor.redo()).toBe(true);
        expect(builder.getProps().filters.some((tag) => tag.label === "Undoable Tag")).toBe(
            true,
        );
        expect(editor.getCatalog()).toEqual(catalogBeforeMutation);
    });
});
