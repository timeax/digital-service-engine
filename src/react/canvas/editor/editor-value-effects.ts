import { fieldOptionIdSet } from "@/core/options";
import type { Field, FieldValueEffect, Scalar, ServiceProps } from "@/schema";
import type { EditorModuleContext } from "./editor-types";
import { isActualButtonField } from "./editor-utils";

type ValueEffectPatch = FieldValueEffect | undefined | null;

function assertCanonicalId(id: string, label: string): void {
    if (!id || id.includes("::") || id.includes("/")) {
        throw new Error(
            `${label}: expected a raw field, tag, or option id, not a composite/path id`,
        );
    }
}

function isValueScalar(value: unknown): value is Scalar {
    if (value === null) return true;
    const type = typeof value;
    return type === "string" || type === "number" || type === "boolean";
}

function assertTrigger(ctx: EditorModuleContext, triggerId: string): void {
    assertCanonicalId(triggerId, "value effect trigger");
    const trigger = ctx.getNode(triggerId);
    if (trigger.kind === "tag" && trigger.data) return;
    if (trigger.kind === "option" && trigger.data) return;
    if (
        trigger.kind === "field" &&
        trigger.data &&
        isActualButtonField(trigger.data)
    ) {
        return;
    }
    throw new Error(
        "value effect trigger must be a tag id, option id, or button field id",
    );
}

function assertTargetField(props: ServiceProps, targetFieldId: string): Field {
    assertCanonicalId(targetFieldId, "value effect target");
    const field = (props.fields ?? []).find(
        (item) => item.id === targetFieldId,
    );
    if (!field) {
        throw new Error(
            `value effect target field not found: ${targetFieldId}`,
        );
    }
    return field;
}

function normalizePrimitiveValue(
    value: unknown,
): Scalar | Scalar[] | undefined {
    if (isValueScalar(value)) return value;
    if (Array.isArray(value)) {
        const out = value.filter(isValueScalar);
        return out.length ? out : undefined;
    }
    return undefined;
}

function normalizeSelectableValue(
    field: Field,
    value: unknown,
): Scalar | Scalar[] | undefined {
    const valid = fieldOptionIdSet(field);
    const raw = Array.isArray(value) ? value : [value];
    const out: string[] = [];

    for (const item of raw) {
        if (!isValueScalar(item)) continue;
        const id = String(item);
        assertCanonicalId(id, "value effect option");
        if (!valid.has(id)) {
            throw new Error(
                `value effect option not found under ${field.id}: ${id}`,
            );
        }
        if (!out.includes(id)) out.push(id);
    }

    if (!out.length) return undefined;
    return field.meta?.multi === true ? out : out[out.length - 1];
}

function normalizeEffectForTarget(
    field: Field,
    effect: ValueEffectPatch,
): FieldValueEffect | undefined {
    if (!effect) return undefined;
    const hasOptions = Array.isArray(field.options) && field.options.length > 0;
    const value = hasOptions
        ? normalizeSelectableValue(field, effect.value)
        : normalizePrimitiveValue(effect.value);
    if (value === undefined) return undefined;

    return {
        value,
        ...(effect.mode === "if_empty" || effect.mode === "always"
            ? { mode: effect.mode }
            : {}),
        ...(effect.clearOnDeactivate === true
            ? { clearOnDeactivate: true }
            : {}),
    };
}

function ensureTargetMap(
    props: ServiceProps,
    triggerId: string,
): Record<string, FieldValueEffect> {
    props.value_effects_for_triggers ??= {};
    props.value_effects_for_triggers[triggerId] ??= {};
    return props.value_effects_for_triggers[triggerId]!;
}

function pruneValueEffectMap(props: ServiceProps, triggerId?: string): void {
    const map = props.value_effects_for_triggers;
    if (!map) return;
    const keys = triggerId ? [triggerId] : Object.keys(map);
    for (const key of keys) {
        const targets = map[key];
        if (!targets || Object.keys(targets).length === 0) delete map[key];
    }
    if (Object.keys(map).length === 0) delete props.value_effects_for_triggers;
}

function validateEffect(
    ctx: EditorModuleContext,
    props: ServiceProps,
    triggerId: string,
    targetFieldId: string,
    effect: ValueEffectPatch,
): FieldValueEffect | undefined {
    assertTrigger(ctx, triggerId);
    const field = assertTargetField(props, targetFieldId);
    return normalizeEffectForTarget(field, effect);
}

export function setValueEffect(
    ctx: EditorModuleContext,
    triggerId: string,
    targetFieldId: string,
    effect: ValueEffectPatch,
): void {
    ctx.exec({
        name: "setValueEffect",
        do: () =>
            ctx.patchProps((props) => {
                const normalized = validateEffect(
                    ctx,
                    props,
                    triggerId,
                    targetFieldId,
                    effect,
                );
                if (!normalized) {
                    const map = props.value_effects_for_triggers?.[triggerId];
                    if (map) delete map[targetFieldId];
                    pruneValueEffectMap(props, triggerId);
                    return;
                }
                ensureTargetMap(props, triggerId)[targetFieldId] = normalized;
            }),
        undo: () => ctx.undo(),
    });
}

export function patchValueEffect(
    ctx: EditorModuleContext,
    triggerId: string,
    targetFieldId: string,
    patch: Partial<FieldValueEffect>,
): void {
    ctx.exec({
        name: "patchValueEffect",
        do: () =>
            ctx.patchProps((props) => {
                const current =
                    props.value_effects_for_triggers?.[triggerId]?.[
                        targetFieldId
                    ];
                const merged = {
                    ...(current ?? {}),
                    ...patch,
                } as FieldValueEffect;
                const normalized = validateEffect(
                    ctx,
                    props,
                    triggerId,
                    targetFieldId,
                    merged,
                );
                if (!normalized) {
                    const map = props.value_effects_for_triggers?.[triggerId];
                    if (map) delete map[targetFieldId];
                    pruneValueEffectMap(props, triggerId);
                    return;
                }
                ensureTargetMap(props, triggerId)[targetFieldId] = normalized;
            }),
        undo: () => ctx.undo(),
    });
}

export function clearValueEffect(
    ctx: EditorModuleContext,
    triggerId: string,
    targetFieldId: string,
): void {
    ctx.exec({
        name: "clearValueEffect",
        do: () =>
            ctx.patchProps((props) => {
                const map = props.value_effects_for_triggers?.[triggerId];
                if (!map) return;
                delete map[targetFieldId];
                pruneValueEffectMap(props, triggerId);
            }),
        undo: () => ctx.undo(),
    });
}

export function clearValueEffectsForTrigger(
    ctx: EditorModuleContext,
    triggerId: string,
): void {
    ctx.exec({
        name: "clearValueEffectsForTrigger",
        do: () =>
            ctx.patchProps((props) => {
                if (!props.value_effects_for_triggers) return;
                delete props.value_effects_for_triggers[triggerId];
                pruneValueEffectMap(props);
            }),
        undo: () => ctx.undo(),
    });
}

export function clearValueEffectsForTarget(
    ctx: EditorModuleContext,
    targetFieldId: string,
): void {
    ctx.exec({
        name: "clearValueEffectsForTarget",
        do: () =>
            ctx.patchProps((props) => {
                const map = props.value_effects_for_triggers;
                if (!map) return;
                for (const triggerId of Object.keys(map)) {
                    delete map[triggerId]?.[targetFieldId];
                }
                pruneValueEffectMap(props);
            }),
        undo: () => ctx.undo(),
    });
}
