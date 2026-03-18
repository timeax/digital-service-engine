import type { EditorOptions, Field, ServiceProps } from "@/schema";

export function ownerOfOption(
    props: ServiceProps,
    optionId: string,
): { fieldId: string; index: number } | null {
    for (const f of props.fields ?? []) {
        const idx = (f.options ?? []).findIndex((o) => o.id === optionId);
        if (idx >= 0) return { fieldId: f.id, index: idx };
    }
    return null;
}

export function hasFieldOptions(field: Partial<Field> | undefined): boolean {
    return Array.isArray(field?.options) && field.options.length > 0;
}

export function isActualButtonField(field: Partial<Field> | undefined): boolean {
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
