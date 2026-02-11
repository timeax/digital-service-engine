// src/core/visibility.ts
import type { Field, ServiceProps, Tag } from "@/schema";
import { buildNodeMap, type NodeMap, resolveTrigger } from "./node-map";

export type VisibilityOptions = {
    selectedKeys?: Set<string>;
};

/**
 * Single source of truth: selection-aware + lineage-aware visible field ids under a tag.
 * Returns ordered IDs.
 */
export function visibleFieldIdsUnder(
    props: ServiceProps,
    tagId: string,
    opts: VisibilityOptions = {},
): string[] {
    const tags = props.filters ?? [];
    const fields = props.fields ?? [];

    const tagById = new Map(tags.map((t) => [t.id, t]));
    const tag = tagById.get(tagId);
    if (!tag) return [];

    // Build node map (id => {kind,node,...})
    const nodeMap: NodeMap = buildNodeMap(props);

    // ---- lineage with depth: self=0, parent=1, grandparent=2 ...
    const lineageDepth = new Map<string, number>();
    {
        const guard = new Set<string>();
        let cur: Tag | undefined = tag;
        let d = 0;
        while (cur && !guard.has(cur.id)) {
            lineageDepth.set(cur.id, d++);
            guard.add(cur.id);
            const parentId: string | undefined = cur.bind_id;
            cur = parentId ? tagById.get(parentId) : undefined;
        }
    }

    const isTagInLineage = (id: string) => lineageDepth.has(id);

    const fieldById = new Map(fields.map((f) => [f.id, f]));

    const ownerDepthForField = (f: Field): number | undefined => {
        const b = f.bind_id;
        if (!b) return undefined;

        if (typeof b === "string") return lineageDepth.get(b);

        let best: number | undefined = undefined;
        for (const id of b) {
            const d = lineageDepth.get(id);
            if (d == null) continue;
            if (best == null || d < best) best = d;
        }
        return best;
    };

    const ownerDepthForTriggerKey = (
        triggerKey: string,
    ): number | undefined => {
        const t = resolveTrigger(triggerKey, nodeMap);
        if (!t) return undefined;

        // Composite trigger: fieldId::optionId
        if (t.kind === "composite") {
            const f = fieldById.get(t.fieldId);
            if (!f) return undefined;
            return ownerDepthForField(f);
        }

        // Field trigger (button field id)
        if (t.kind === "field") {
            const f = fieldById.get(t.id);
            if (!f || f.button !== true) return undefined;
            return ownerDepthForField(f);
        }

        // Option trigger (option id)
        if (t.kind === "option") {
            const f = t.fieldId ? fieldById.get(t.fieldId) : undefined;
            if (!f) return undefined;
            return ownerDepthForField(f);
        }

        // Tag trigger not used as a “button trigger”
        return undefined;
    };

    // ---- current tag includes/excludes (NOT inherited)
    const tagInclude = new Set(tag.includes ?? []);
    const tagExclude = new Set(tag.excludes ?? []);

    // ---- selection triggers (buttons + options)
    const selected = opts.selectedKeys ?? new Set<string>();
    const incMap = props.includes_for_buttons ?? {};
    const excMap = props.excludes_for_buttons ?? {};

    // Only apply triggers that belong to (self ∪ ancestors).
    // Preserve insertion order from the Set.
    const relevantTriggersInOrder: string[] = [];
    for (const key of selected) {
        const d = ownerDepthForTriggerKey(key);
        if (d == null) continue;
        relevantTriggersInOrder.push(key);
    }

    // ---- base candidates: bound fields inherited + current tag includes
    const visible = new Set<string>();

    const isBoundToLineage = (f: Field): boolean => {
        const b = f.bind_id;
        if (!b) return false;
        if (typeof b === "string") return isTagInLineage(b);
        for (const id of b) if (isTagInLineage(id)) return true;
        return false;
    };

    for (const f of fields) {
        if (isBoundToLineage(f)) visible.add(f.id);
        if (tagInclude.has(f.id)) visible.add(f.id);
    }

    // apply current tag excludes
    for (const id of tagExclude) visible.delete(id);

    // ---- button decisions with precedence:
    // closest depth wins; if same depth and conflict => exclude wins
    type ButtonDecision = { depth: number; kind: "include" | "exclude" };
    const decide = new Map<string, ButtonDecision>();

    const applyDecision = (fieldId: string, next: ButtonDecision) => {
        const prev = decide.get(fieldId);
        if (!prev) return void decide.set(fieldId, next);

        if (next.depth < prev.depth) return void decide.set(fieldId, next);
        if (next.depth > prev.depth) return;

        if (prev.kind === "include" && next.kind === "exclude") {
            decide.set(fieldId, next);
        }
    };

    // determinism: revealed order (in trigger order)
    const revealedOrder: string[] = [];
    const revealedSeen = new Set<string>();

    for (const triggerKey of relevantTriggersInOrder) {
        const depth = ownerDepthForTriggerKey(triggerKey);
        if (depth == null) continue;

        for (const id of incMap[triggerKey] ?? []) {
            applyDecision(id, { depth, kind: "include" });

            if (!revealedSeen.has(id)) {
                revealedSeen.add(id);
                revealedOrder.push(id);
            }
        }

        for (const id of excMap[triggerKey] ?? []) {
            applyDecision(id, { depth, kind: "exclude" });
        }
    }

    // apply button decisions (buttons override tag state)
    for (const [fid, d] of decide) {
        if (d.kind === "include") visible.add(fid);
        else visible.delete(fid);
    }

    // natural order (props.fields order)
    const base = fields.filter((f) => visible.has(f.id)).map((f) => f.id);

    // order_for_tags pins first (ordering only)
    const order = props.order_for_tags?.[tagId];
    if (order && order.length) {
        const ordered = order.filter((fid) => visible.has(fid));
        const orderedSet = new Set(ordered);
        const rest = base.filter((fid) => !orderedSet.has(fid));
        return [...ordered, ...rest];
    }

    // otherwise: revealed-first (only final-visible)
    const promoted = revealedOrder.filter((fid) => visible.has(fid));
    const promotedSet = new Set(promoted);
    const rest = base.filter((fid) => !promotedSet.has(fid));
    return [...promoted, ...rest];
}

/** Convenience: returns ordered Field[] instead of ids. */
export function visibleFieldsUnder(
    props: ServiceProps,
    tagId: string,
    opts: VisibilityOptions = {},
): Field[] {
    const ids = visibleFieldIdsUnder(props, tagId, opts);
    const fieldById = new Map((props.fields ?? []).map((f) => [f.id, f]));
    return ids.map((id) => fieldById.get(id)).filter(Boolean) as Field[];
}
