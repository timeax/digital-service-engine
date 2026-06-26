// src/core/node-map.ts
import type { Field, FieldOption, ServiceProps, Tag } from "@/schema";
import { walkFieldOptions } from "@/core/options";

export type NodeKind = "tag" | "field" | "option";

export type NodeRef =
    | { kind: "tag"; id: string; node: Tag }
    | { kind: "field"; id: string; node: Field }
    | {
          kind: "option";
          id: string;
          node: FieldOption;
          fieldId: string; // parent field id
      };

export type NodeMap = Map<string, NodeRef>;

/**
 * Build a node map keyed by *actual ids* (no prefix assumptions).
 * Rule: ids are unique across tags/fields/options.
 *
 * If you ever violate uniqueness, the first wins by default; we can hard-throw if you want.
 */
export function buildNodeMap(props: ServiceProps): NodeMap {
    const map: NodeMap = new Map();

    for (const t of props.filters ?? []) {
        if (!map.has(t.id)) map.set(t.id, { kind: "tag", id: t.id, node: t });
    }

    for (const f of props.fields ?? []) {
        if (!map.has(f.id)) map.set(f.id, { kind: "field", id: f.id, node: f });

        for (const { option: o } of walkFieldOptions(f)) {
            if (!map.has(o.id))
                map.set(o.id, {
                    kind: "option",
                    id: o.id,
                    node: o,
                    fieldId: f.id,
                });
        }
    }

    return map;
}

/**
 * Resolve a trigger id into a direct node id (tag/field/option).
 *
 * IMPORTANT:
 * - We do NOT strip any prefixes like "o:".
 * - "o:on" is a perfectly valid *option id* if your data uses it.
 * - Nested option structure never creates derived/path ids; selection identity
 *   is always the option's own id.
 */
export type TriggerRef = {
    kind: NodeKind;
    triggerKey: string;
    id: string;
    fieldId?: string;
};

export function resolveTrigger(
    trigger: string,
    nodeMap: NodeMap,
): TriggerRef | undefined {
    // Direct node id (tag/field/option)
    const direct = nodeMap.get(trigger);
    if (!direct) return undefined;

    if (direct.kind === "option") {
        return {
            kind: "option",
            triggerKey: trigger,
            id: direct.id,
            fieldId: direct.fieldId,
        };
    }

    return { kind: direct.kind, triggerKey: trigger, id: direct.id };
}
