// src/react/workspace/context/use-canvas.ts

import * as React from "react";
import { useMemo } from "react";

import type { CanvasAPI } from "@/react";
import type { CanvasState } from "@/schema/canvas-types";
import type { GraphSnapshot } from "@/schema/graph";
import type {
    Field,
    FieldOption,
    ServiceProps,
    ServicePropsNotice,
    Tag,
} from "@/schema";

import { useCanvasAPI } from "../context";
import type { VisibleGroupResult } from "@/react/canvas/selection";
import { createNodeIndex, NodeIndex } from "@/core";
import { NodeMap } from "@/core/node-map";

/** Tree node */
export interface TreeNode<T = unknown> {
    id: string | number;
    title: string;
    children?:
        | Array<TreeNode<T>>
        | (() => Array<TreeNode<T>> | Promise<Array<TreeNode<T>>>);
    data?: T;
}

export type CanvasSelection = {
    /** raw ids from CanvasState.selection */
    ids: readonly string[];
    tagIds: readonly string[];
    fieldIds: readonly string[];
    optionIds: readonly string[];
};

export interface UseCanvasReturn {
    layers: {
        tags: Array<TreeNode<Tag & { active: boolean }>>;
        fields: Array<TreeNode<Field | FieldOption>>; // visible fields (+ option children)
    };

    selector: NodeIndex;

    /** selection (stateful, raw) */
    selection: readonly string[];

    /** selection (stateful, derived) */
    selectionInfo: CanvasSelection;

    /** active (last-selected / focused) id (stateful) */
    activeId: string | null;

    /** imperative active setter (does NOT select; just “preference”) */
    setActive: (id: string | null) => void;

    graph: GraphSnapshot;
    api: CanvasAPI;
    props?: ServiceProps;
    selectionCapabilities: SelectionCapabilities;
}

export type SelectionCapabilities = {
    hasTags: boolean;
    hasFields: boolean;
    hasOptions: boolean;
    hasServiceBearingNodes: boolean;
    hasSelectedFieldWithOptions: boolean;
    hasNoticesForSelection: boolean;
    canIncludeExcludeTargets: boolean;
    canRebind: boolean;
};

/** ---------------- helpers ---------------- */
function deriveSelectionInfo(
    nodeMap: NodeMap,
    ids: readonly string[],
): CanvasSelection {
    const tags: string[] = [];
    const fields: string[] = [];
    const options: string[] = [];

    for (const id of ids) {
        const node = nodeMap.get(id);
        if (!node) continue;

        if (node.kind == "tag") {
            tags.push(id);
            continue;
        }

        if (node.kind == "option") {
            options.push(id);
            continue;
        }

        if (node.kind == "field") {
            fields.push(id);
        }
    }

    // de-dupe while keeping order
    const uniq = (arr: string[]) => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const x of arr) if (!seen.has(x)) (seen.add(x), out.push(x));
        return out;
    };

    return {
        ids,
        tagIds: uniq(tags),
        fieldIds: uniq(fields),
        optionIds: uniq(options),
    };
}

function noticeTargetsSelection(
    notice: ServicePropsNotice,
    selected: ReadonlySet<string>,
): boolean {
    const target = notice.target;
    if (target.scope === "global") return false;
    return selected.has(String(target.node_id));
}

export function deriveSelectionCapabilities(
    props: ServiceProps | undefined,
    selectionInfo: CanvasSelection,
): SelectionCapabilities {
    const selected = new Set(selectionInfo.ids.map(String));
    const fields = props?.fields ?? [];
    const tags = props?.filters ?? [];
    const notices = props?.notices ?? [];

    const hasSelectedFieldWithOptions = fields.some(
        (f) => selected.has(String(f.id)) && (f.options?.length ?? 0) > 0,
    );

    const hasServiceBearingNodes =
        tags.some(
            (t) =>
                selected.has(String(t.id)) &&
                t.service_id !== undefined &&
                t.service_id !== null,
        ) ||
        fields.some(
            (f) =>
                selected.has(String(f.id)) &&
                (f as Field).service_id !== undefined &&
                (f as Field).service_id !== null,
        ) ||
        fields.some((f) =>
            (f.options ?? []).some(
                (o) =>
                    selected.has(String(o.id)) &&
                    o.service_id !== undefined &&
                    o.service_id !== null,
            ),
        );

    const hasNoticesForSelection = notices.some((n) =>
        noticeTargetsSelection(n, selected),
    );

    return {
        hasTags: selectionInfo.tagIds.length > 0,
        hasFields: selectionInfo.fieldIds.length > 0,
        hasOptions: selectionInfo.optionIds.length > 0,
        hasServiceBearingNodes,
        hasSelectedFieldWithOptions,
        hasNoticesForSelection,
        canIncludeExcludeTargets:
            selectionInfo.tagIds.length +
                selectionInfo.fieldIds.length +
                selectionInfo.optionIds.length >
            0,
        canRebind:
            selectionInfo.fieldIds.length > 0 || selectionInfo.tagIds.length > 0,
    };
}

function tagBindIds(tag: Tag): string[] {
    const bind = (tag as any).bind_id as undefined | string | string[];
    if (!bind) return [];
    return Array.isArray(bind) ? bind : [bind];
}

function buildTagTree(
    tags: readonly Tag[],
    isActive: (tagId: string) => boolean,
): Array<TreeNode<Tag & { active: boolean }>> {
    const nodeById = new Map<string, TreeNode<Tag & { active: boolean }>>();
    const childrenByParent = new Map<
        string,
        Array<TreeNode<Tag & { active: boolean }>>
    >();

    for (const t of tags) {
        nodeById.set(t.id, {
            id: t.id,
            title: t.label,
            data: { ...t, active: isActive(t.id) },
        });
    }

    for (const t of tags) {
        const child = nodeById.get(t.id);
        if (!child) continue;

        for (const parentId of tagBindIds(t)) {
            if (!nodeById.has(parentId)) continue;
            const list = childrenByParent.get(parentId) ?? [];
            list.push(child);
            childrenByParent.set(parentId, list);
        }
    }

    for (const [parentId, kids] of childrenByParent) {
        const parent = nodeById.get(parentId);
        if (parent) parent.children = kids;
    }

    const roots: Array<TreeNode<Tag & { active: boolean }>> = [];
    for (const t of tags) {
        const parents = tagBindIds(t).filter((pid) => nodeById.has(pid));
        if (parents.length === 0) roots.push(nodeById.get(t.id)!);
    }

    return roots;
}

function buildFieldTree(fields: Field[]): Array<TreeNode<Field | FieldOption>> {
    return fields.map((f) => {
        const node: TreeNode<Field | FieldOption> = {
            id: f.id,
            title: f.label,
            data: f,
        };

        // children must exist if field supports options (options prop exists), even if []
        if ("options" in f) {
            const opts = Array.isArray(f.options) ? f.options : [];
            node.children = opts.map((opt) => ({
                id: opt.id,
                title: opt.label,
                data: opt,
            }));
        }

        return node;
    });
}

function computeLayersFromVisibleGroup(
    props: ServiceProps,
    vg: VisibleGroupResult,
): UseCanvasReturn["layers"] {
    const activeTagIds = new Set<string>();
    let fields: Field[];

    if (vg.kind === "single") {
        if (vg.group.tagId) activeTagIds.add(vg.group.tagId);
        fields = vg.group.fields ?? [];
    } else {
        for (const id of vg.groups) {
            if (typeof id === "string" && id.startsWith("t:"))
                activeTagIds.add(id);
        }
        fields = [];
    }

    return {
        tags: buildTagTree(props.filters ?? [], (id) => activeTagIds.has(id)),
        fields: buildFieldTree(fields),
    };
}

/** active id resolution */
function findNewId(
    prev: readonly string[],
    next: readonly string[],
): string | undefined {
    const prevSet = new Set(prev);
    for (const id of next) if (!prevSet.has(id)) return id;
    return undefined;
}

function resolveActiveId(
    desiredActive: string | null,
    prevSel: readonly string[],
    nextSel: readonly string[],
): string | null {
    // 1) keep desired if it’s still selected
    if (desiredActive && nextSel.includes(desiredActive)) return desiredActive;

    // 2) prefer the “new guy” (first id that wasn’t in prev)
    const added = findNewId(prevSel, nextSel);
    if (added) return added;

    // 3) fallback: last selection
    if (nextSel.length) return nextSel[nextSel.length - 1] ?? null;

    return null;
}

/** ---------------- hook ---------------- */

export function useCanvas(): UseCanvasReturn {
    const api = useCanvasAPI();

    const snap0 = api.snapshot();
    const props0 = api.editor.getProps() as ServiceProps;

    const initialSelection = Array.from(snap0.selection as ReadonlySet<string>);

    const [graph, setGraph] = React.useState<GraphSnapshot>(snap0.graph);
    const [props, setProps] = React.useState<ServiceProps>(props0);

    const [selection, setSelection] =
        React.useState<readonly string[]>(initialSelection);

    const [selectionInfo, setSelectionInfo] = React.useState<CanvasSelection>(
        () => deriveSelectionInfo(api.builder.getNodeMap(), initialSelection),
    );

    const [layers, setLayers] = React.useState<UseCanvasReturn["layers"]>(() =>
        computeLayersFromVisibleGroup(props0, api.selection.visibleGroup()),
    );

    // --- imperative active controller
    const desiredActiveRef = React.useRef<string | null>(null);
    const prevSelectionRef = React.useRef<readonly string[]>(initialSelection);

    const [activeId, setActiveId] = React.useState<string | null>(() => {
        return initialSelection.length
            ? initialSelection[initialSelection.length - 1]
            : null;
    });

    const setActive = React.useCallback(
        (id: string | null) => {
            desiredActiveRef.current = id;

            // if already selected, reflect immediately
            if (id && selection.includes(id)) setActiveId(id);
            if (id === null) setActiveId(null);
        },
        [selection],
    );

    React.useEffect(() => {
        const off = api.on("state:change", (snap: CanvasState) => {
            setGraph(snap.graph);

            const nextProps = api.editor.getProps() as ServiceProps;
            setProps(nextProps);

            const nextSelection = Array.from(
                snap.selection as ReadonlySet<string>,
            ) as readonly string[];

            setSelection(nextSelection);
            const nodemap = api.builder.getNodeMap();
            setSelectionInfo(deriveSelectionInfo(nodemap, nextSelection));

            setLayers(
                computeLayersFromVisibleGroup(
                    nextProps,
                    api.selection.visibleGroup(),
                ),
            );

            // reconcile active
            const prevSel = prevSelectionRef.current;
            const desired = desiredActiveRef.current;
            const nextActive = resolveActiveId(desired, prevSel, nextSelection);

            prevSelectionRef.current = nextSelection;
            setActiveId(nextActive);
        });

        return off;
    }, [api]);

    const selector = useMemo(() => createNodeIndex(api.builder), [api.builder, props]);

    const selectionCapabilities = React.useMemo(
        () => deriveSelectionCapabilities(props, selectionInfo),
        [props, selectionInfo],
    );

    return React.useMemo(
        () => ({
            api,
            graph,
            layers,
            props,
            selection,
            selectionInfo,
            selectionCapabilities,
            selector,
            activeId,
            setActive,
        }),
        [
            api,
            graph,
            layers,
            props,
            selection,
            selectionInfo,
            selectionCapabilities,
            selector,
            activeId,
            setActive,
        ],
    );
}
