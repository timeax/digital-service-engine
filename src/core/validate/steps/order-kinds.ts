import { resolveOrderKind } from "@/utils/order-kind";
import type { ValidationCtx } from "../shared";
import { withAffected } from "../shared";

export function validateOrderKinds(v: ValidationCtx): void {
    const selectedTriggerKeys = Array.from(v.selectedKeys ?? []);
    if (!selectedTriggerKeys.length) return;

    const resolved = resolveOrderKind({
        props: v.props,
        selectedTriggerKeys,
        nodeMap: v.nodeMap,
    });

    if (resolved.error !== "multiple_order_kinds_selected") return;

    const conflicts = resolved.conflictingKinds ?? [];
    const affected = resolved.conflictingNodeIds ?? [];

    v.errors.push({
        code: "multiple_order_kinds_selected",
        severity: "error",
        message:
            "Multiple selected triggers resolve to different order kinds. Select triggers that resolve to a single order kind.",
        details: withAffected(
            {
                conflictingKinds: conflicts,
                conflictingNodeIds: affected,
            },
            affected,
        ),
    });
}
