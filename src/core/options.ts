import type { Field, FieldOption, ServiceProps } from "@/schema";

export type OptionVisit = {
    field: Field;
    fieldId: string;
    option: FieldOption;
    optionId: string;
    depth: number;
    parentId?: string;
};

export function walkFieldOptions(field: Field): OptionVisit[] {
    const out: OptionVisit[] = [];

    const visit = (
        options: readonly FieldOption[] | undefined,
        depth: number,
        parentId?: string,
    ) => {
        for (const option of options ?? []) {
            out.push({
                field,
                fieldId: field.id,
                option,
                optionId: option.id,
                depth,
                parentId,
            });
            visit(option.children, depth + 1, option.id);
        }
    };

    visit(field.options, 0);
    return out;
}

export function walkOptions(props: ServiceProps): OptionVisit[] {
    return (props.fields ?? []).flatMap((field) => walkFieldOptions(field));
}

export function fieldOptionIds(field: Field): string[] {
    return walkFieldOptions(field).map((visit) => visit.optionId);
}

export function fieldOptionIdSet(field: Field): Set<string> {
    return new Set(fieldOptionIds(field));
}

export function findFieldOption(
    field: Field | undefined,
    optionId: string,
): FieldOption | undefined {
    if (!field) return undefined;
    return walkFieldOptions(field).find((visit) => visit.optionId === optionId)
        ?.option;
}

export function findOptionOwnerField(
    fields: Iterable<Field>,
    optionId: string,
): Field | undefined {
    for (const field of fields) {
        if (findFieldOption(field, optionId)) return field;
    }
    return undefined;
}

export function optionOwnerMap(
    fields: Iterable<Field>,
): Map<string, { fieldId: string; option: FieldOption }> {
    const out = new Map<string, { fieldId: string; option: FieldOption }>();
    for (const field of fields) {
        for (const visit of walkFieldOptions(field)) {
            if (!out.has(visit.optionId)) {
                out.set(visit.optionId, {
                    fieldId: field.id,
                    option: visit.option,
                });
            }
        }
    }
    return out;
}

export function filterFieldOptionsById(
    options: readonly FieldOption[] | undefined,
    allowed: ReadonlySet<string>,
): FieldOption[] | undefined {
    if (!Array.isArray(options)) return undefined;

    const out: FieldOption[] = [];
    for (const option of options) {
        const children = filterFieldOptionsById(option.children, allowed);
        if (!allowed.has(option.id) && (!children || children.length === 0)) {
            continue;
        }

        out.push({
            ...option,
            ...(children ? { children } : {}),
        });
    }

    return out;
}
