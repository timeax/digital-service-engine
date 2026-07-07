import type { EditorOptions, Field, FieldOption, ServiceProps } from "@/schema";

export function ownerOfOption(
    props: ServiceProps,
    optionId: string,
): { fieldId: string; index: number } | null {
    for (const f of props.fields ?? []) {
        const found = findOptionLocationInField(f, optionId);
        if (found) return { fieldId: f.id, index: found.index };
    }
    return null;
}

export type MutableOptionLocation = {
    field: Field;
    option: FieldOption;
    siblings: FieldOption[];
    index: number;
    parent?: FieldOption;
};

export function findMutableOption(
    props: ServiceProps,
    optionId: string,
): MutableOptionLocation | undefined {
    for (const field of props.fields ?? []) {
        const found = findOptionLocationInField(field, optionId);
        if (found) return { field, ...found };
    }
    return undefined;
}

export function collectFieldOptionIds(field: Field | undefined): string[] {
    const out: string[] = [];
    const visit = (options: readonly FieldOption[] | undefined) => {
        for (const option of options ?? []) {
            out.push(String(option.id));
            visit(option.children);
        }
    };
    visit(field?.options);
    return out;
}

function findOptionLocationInField(
    field: Field,
    optionId: string,
): Omit<MutableOptionLocation, "field"> | undefined {
    const visit = (
        siblings: FieldOption[] | undefined,
        parent?: FieldOption,
    ): Omit<MutableOptionLocation, "field"> | undefined => {
        if (!siblings) return undefined;
        const index = siblings.findIndex((option) => option.id === optionId);
        if (index >= 0) {
            return {
                option: siblings[index]!,
                siblings,
                index,
                parent,
            };
        }
        for (const option of siblings) {
            const found = visit(option.children, option);
            if (found) return found;
        }
        return undefined;
    };
    return visit(field.options);
}

export function hasFieldOptions(field: Partial<Field> | undefined): boolean {
    return Array.isArray(field?.options) && field.options.length > 0;
}

export function isActualButtonField(
    field: Partial<Field> | undefined,
): boolean {
    return field?.button === true && !hasFieldOptions(field);
}

export function clearFieldButtonReceiverMaps(
    props: ServiceProps,
    fieldId: string,
): void {
    if (props.includes_for_buttons?.[fieldId]) {
        delete props.includes_for_buttons[fieldId];
    }
    if (props.excludes_for_buttons?.[fieldId]) {
        delete props.excludes_for_buttons[fieldId];
    }
    if (
        props.includes_for_buttons &&
        Object.keys(props.includes_for_buttons).length === 0
    ) {
        delete props.includes_for_buttons;
    }
    if (
        props.excludes_for_buttons &&
        Object.keys(props.excludes_for_buttons).length === 0
    ) {
        delete props.excludes_for_buttons;
    }
    if (props.option_effects_for_buttons?.[fieldId]) {
        delete props.option_effects_for_buttons[fieldId];
    }
    if (
        props.option_effects_for_buttons &&
        Object.keys(props.option_effects_for_buttons).length === 0
    ) {
        delete props.option_effects_for_buttons;
    }
    if (props.value_effects_for_triggers?.[fieldId]) {
        delete props.value_effects_for_triggers[fieldId];
    }
    if (
        props.value_effects_for_triggers &&
        Object.keys(props.value_effects_for_triggers).length === 0
    ) {
        delete props.value_effects_for_triggers;
    }
}

export function ensureServiceExists(opts: EditorOptions, id: any) {
    if (typeof opts.serviceExists === "function") {
        if (!opts.serviceExists(id)) {
            throw new Error(`service_not_found:${String(id)}`);
        }
        return;
    }
    if (opts.serviceMap) {
        if (!Object.prototype.hasOwnProperty.call(opts.serviceMap, id as any)) {
            throw new Error(`service_not_found:${String(id)}`);
        }
        return;
    }
    throw new Error("service_checker_missing");
}
