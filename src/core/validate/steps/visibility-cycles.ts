import type { Field } from "@/schema";
import { optionOwnerMap, walkFieldOptions } from "@/core/options";
import type { ValidationCtx } from "../shared";
import { withAffected } from "../shared";

const MAX_VISIBILITY_CYCLE_DEPTH = 20;

type TriggerInfo =
    | {
          kind: "field";
          id: string;
          ownerFieldId: string;
      }
    | {
          kind: "option";
          id: string;
          ownerFieldId: string;
      };

type RequiredState = {
    triggers: Set<string>;
    ownerFields: Set<string>;
};

type Invalidation = {
    invalidatedId: string;
};

export function validateVisibilityCycles(v: ValidationCtx): void {
    const triggerById = buildTriggerIndex(v.fields);
    if (!triggerById.size) return;

    const fieldTriggers = buildFieldTriggerIndex(v.fields);
    const revealTargetsByTrigger = buildRevealIndex(v, triggerById);
    const reported = new Set<string>();

    for (const rootTriggerId of Array.from(triggerById.keys()).sort()) {
        const required = makeRequiredState(triggerById, [rootTriggerId]);
        walkFromTrigger({
            v,
            triggerById,
            fieldTriggers,
            revealTargetsByTrigger,
            rootTriggerId,
            currentTriggerId: rootTriggerId,
            required,
            path: [rootTriggerId],
            visited: new Set<string>(),
            reported,
            depth: 0,
        });
    }
}

function buildTriggerIndex(fields: readonly Field[]): Map<string, TriggerInfo> {
    const out = new Map<string, TriggerInfo>();
    const owners = optionOwnerMap(fields);

    for (const field of fields) {
        if ((field as any).button === true) {
            out.set(field.id, {
                kind: "field",
                id: field.id,
                ownerFieldId: field.id,
            });
        }
    }

    for (const [optionId, owner] of owners) {
        out.set(optionId, {
            kind: "option",
            id: optionId,
            ownerFieldId: owner.fieldId,
        });
    }

    return out;
}

function buildFieldTriggerIndex(
    fields: readonly Field[],
): Map<string, string[]> {
    const out = new Map<string, string[]>();

    for (const field of fields) {
        const triggers: string[] = [];
        if ((field as any).button === true) triggers.push(field.id);

        for (const visit of walkFieldOptions(field)) {
            triggers.push(visit.optionId);
        }

        out.set(field.id, triggers);
    }

    return out;
}

function buildRevealIndex(
    v: ValidationCtx,
    triggerById: ReadonlyMap<string, TriggerInfo>,
): Map<string, string[]> {
    const out = new Map<string, Set<string>>();

    const addReveal = (triggerId: string, targetFieldId: string) => {
        if (!triggerById.has(triggerId)) return;
        if (!v.fieldById.has(targetFieldId)) return;
        const set = out.get(triggerId) ?? new Set<string>();
        set.add(targetFieldId);
        out.set(triggerId, set);
    };

    for (const [triggerId, targetIds] of Object.entries(
        v.props.includes_for_buttons ?? {},
    )) {
        for (const targetId of targetIds ?? []) addReveal(triggerId, targetId);
    }

    for (const [triggerId, targets] of Object.entries(
        v.props.option_effects_for_buttons ?? {},
    )) {
        for (const [targetFieldId, effect] of Object.entries(targets ?? {})) {
            if (effect?.forceVisible === true)
                addReveal(triggerId, targetFieldId);
        }
    }

    return new Map(
        Array.from(out.entries()).map(([triggerId, fieldIds]) => [
            triggerId,
            Array.from(fieldIds).sort(),
        ]),
    );
}

function walkFromTrigger(args: {
    v: ValidationCtx;
    triggerById: ReadonlyMap<string, TriggerInfo>;
    fieldTriggers: ReadonlyMap<string, string[]>;
    revealTargetsByTrigger: ReadonlyMap<string, string[]>;
    rootTriggerId: string;
    currentTriggerId: string;
    required: RequiredState;
    path: string[];
    visited: Set<string>;
    reported: Set<string>;
    depth: number;
}): void {
    if (args.depth >= MAX_VISIBILITY_CYCLE_DEPTH) return;

    const visitedKey = `${args.rootTriggerId}::${args.currentTriggerId}::${args.path.join(">")}`;
    if (args.visited.has(visitedKey)) return;
    args.visited.add(visitedKey);

    const revealedFieldIds =
        args.revealTargetsByTrigger.get(args.currentTriggerId) ?? [];

    for (const revealedFieldId of revealedFieldIds) {
        const reachableTriggers =
            args.fieldTriggers.get(revealedFieldId)?.slice().sort() ?? [];

        for (const reachableTriggerId of reachableTriggers) {
            const invalidation = invalidatesRequiredPath(
                args.v,
                args.triggerById,
                reachableTriggerId,
                args.required,
            );

            if (invalidation) {
                emitCycleError({
                    v: args.v,
                    rootTriggerId: args.rootTriggerId,
                    revealedFieldId,
                    conflictingTriggerId: reachableTriggerId,
                    invalidatedId: invalidation.invalidatedId,
                    path: [...args.path, reachableTriggerId],
                    reported: args.reported,
                });
            }

            if (args.path.includes(reachableTriggerId)) continue;

            walkFromTrigger({
                ...args,
                currentTriggerId: reachableTriggerId,
                required: addRequiredTrigger(
                    args.triggerById,
                    args.required,
                    reachableTriggerId,
                ),
                path: [...args.path, reachableTriggerId],
                depth: args.depth + 1,
            });
        }
    }
}

function makeRequiredState(
    triggerById: ReadonlyMap<string, TriggerInfo>,
    triggerIds: readonly string[],
): RequiredState {
    let required: RequiredState = {
        triggers: new Set<string>(),
        ownerFields: new Set<string>(),
    };

    for (const triggerId of triggerIds) {
        required = addRequiredTrigger(triggerById, required, triggerId);
    }

    return required;
}

function addRequiredTrigger(
    triggerById: ReadonlyMap<string, TriggerInfo>,
    current: RequiredState,
    triggerId: string,
): RequiredState {
    const next: RequiredState = {
        triggers: new Set(current.triggers),
        ownerFields: new Set(current.ownerFields),
    };

    const trigger = triggerById.get(triggerId);
    if (!trigger) return next;

    next.triggers.add(triggerId);
    next.ownerFields.add(trigger.ownerFieldId);
    return next;
}

function invalidatesRequiredPath(
    v: ValidationCtx,
    triggerById: ReadonlyMap<string, TriggerInfo>,
    conflictingTriggerId: string,
    required: RequiredState,
): Invalidation | undefined {
    for (const targetId of v.props.excludes_for_buttons?.[
        conflictingTriggerId
    ] ?? []) {
        if (required.ownerFields.has(targetId)) {
            return { invalidatedId: targetId };
        }

        const targetTrigger = triggerById.get(targetId);
        if (
            targetTrigger?.kind === "option" &&
            required.triggers.has(targetId)
        ) {
            return { invalidatedId: targetId };
        }
    }

    const effects =
        v.props.option_effects_for_buttons?.[conflictingTriggerId] ?? {};
    for (const [targetFieldId, effect] of Object.entries(effects)) {
        if (!v.fieldById.has(targetFieldId)) continue;

        if (effect?.exclude?.length) {
            const excluded = new Set(effect.exclude);
            for (const requiredTriggerId of required.triggers) {
                const requiredTrigger = triggerById.get(requiredTriggerId);
                if (requiredTrigger?.kind !== "option") continue;
                if (requiredTrigger.ownerFieldId !== targetFieldId) continue;
                if (excluded.has(requiredTriggerId)) {
                    return { invalidatedId: requiredTriggerId };
                }
            }
        }

        if (effect?.include?.length) {
            const included = new Set(effect.include);
            for (const requiredTriggerId of required.triggers) {
                const requiredTrigger = triggerById.get(requiredTriggerId);
                if (requiredTrigger?.kind !== "option") continue;
                if (requiredTrigger.ownerFieldId !== targetFieldId) continue;
                if (!included.has(requiredTriggerId)) {
                    return { invalidatedId: requiredTriggerId };
                }
            }
        }
    }

    return undefined;
}

function emitCycleError(args: {
    v: ValidationCtx;
    rootTriggerId: string;
    revealedFieldId: string;
    conflictingTriggerId: string;
    invalidatedId: string;
    path: string[];
    reported: Set<string>;
}): void {
    const key = [
        args.rootTriggerId,
        args.conflictingTriggerId,
        args.invalidatedId,
        args.path.join(">"),
    ].join("::");
    if (args.reported.has(key)) return;
    args.reported.add(key);

    args.v.errors.push({
        code: "visibility_dependency_cycle",
        severity: "error",
        message: `Visibility dependency cycle: trigger "${args.rootTriggerId}" reveals "${args.revealedFieldId}", but reachable trigger "${args.conflictingTriggerId}" can hide or remove "${args.invalidatedId}".`,
        nodeId: args.conflictingTriggerId,
        details: withAffected(
            {
                rootTriggerId: args.rootTriggerId,
                conflictingTriggerId: args.conflictingTriggerId,
                invalidatedId: args.invalidatedId,
                path: args.path,
            },
            [
                args.rootTriggerId,
                args.revealedFieldId,
                args.conflictingTriggerId,
                args.invalidatedId,
            ],
        ),
    });
}
