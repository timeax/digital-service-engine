// src/react/workspace/context/use-canvas.ts

import * as React from "react";
import { useMemo } from "react";

import type { CanvasAPI } from "@/react";
import type { CanvasState } from "@/schema/canvas-types";
import type { GraphSnapshot } from "@/schema/graph";
import type { Field, FieldOption, ServiceProps, Tag } from "@/schema";

import { useCanvasAPI } from "../context";
import type { VisibleGroupResult } from "@/react/canvas/selection";
import { Builder, createNodeIndex, NodeIndex } from "@/core";

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
}

/** ---------------- helpers ---------------- */

const isTagId = (id: string) => id.startsWith("t:");
const isOptionId = (id: string) => id.startsWith("o:");

function deriveSelectionInfo(
    props: ServiceProps,
    ids: readonly string[],
): CanvasSelection {
    const tags: string[] = [];
    const fields: string[] = [];
    const options: string[] = [];

    const fieldById = new Map<string, Field>();
    for (const f of props.fields ?? []) fieldById.set(f.id, f);

    for (const id of ids) {
        if (isTagId(id)) {
            tags.push(id);
            continue;
        }

        if (isOptionId(id)) {
            options.push(id);
            continue;
        }

        // legacy option selection: "fieldId::legacyOptionId"
        if (id.includes("::")) {
            const [fid, legacyOid] = id.split("::");
            if (fid && legacyOid) {
                const host = fieldById.get(fid);
                const resolved =
                    host?.options?.find((o) => o.id === legacyOid)?.id ??
                    legacyOid;

                options.push(resolved);

                // often you still want the field id in fieldIds too
                if (fieldById.has(fid)) fields.push(fid);
            }
            continue;
        }

        // plain field selection (only if it exists as a field)
        if (fieldById.has(id)) {
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
        () => deriveSelectionInfo(props0, initialSelection),
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
            setSelectionInfo(deriveSelectionInfo(nextProps, nextSelection));

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

    const selector = useMemo(() => createNodeIndex(api.builder), [props]);

    return React.useMemo(
        () => ({
            api,
            graph,
            layers,
            props,
            selection,
            selectionInfo,
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
            selector,
            activeId,
            setActive,
        ],
    );
}
