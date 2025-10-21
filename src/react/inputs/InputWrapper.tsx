import React, {useMemo} from 'react';
import type {Field, FieldOption} from '../../schema';
import type {Scalar} from '../../schema/order';
import {useInputs} from './InputsProvider';
import type {InputDescriptor, InputVariant, InputKind} from './InputRegistry';
import {resolveInputDescriptor} from './InputRegistry';
import {isMultiField} from '../../utils'; // your util from src/utils/index.ts
import {useOptionalFormApi} from './FormContext';

export type InputWrapperProps = {
    field: Field;
    disabled?: boolean;
    /** Extra props to forward to the host component (low priority, overridden by adapter wiring). */
    extraProps?: Record<string, unknown>;
};

function toKind(field: Field): InputKind {
    if (field.type === 'custom') {
        // Treat each custom component as a distinct kind
        const comp = (field.component ?? '').trim();
        return (`custom:${comp}`) as InputKind;
    }
    return field.type as InputKind;
}

function toVariant(field: Field): InputVariant | undefined {
    const v = (field as any).meta?.variant;
    return typeof v === 'string' && v.trim() ? (v as InputVariant) : undefined;
}

export function InputWrapper({field, disabled, extraProps}: InputWrapperProps) {
    const {registry} = useInputs();
    const form = useOptionalFormApi();

    const kind = toKind(field);
    const variant = toVariant(field);

    const descriptor: InputDescriptor | undefined = useMemo(
        () => resolveInputDescriptor(registry, kind, variant),
        [kind, registry, variant]
    );

    if (!descriptor) {
        // eslint-disable-next-line no-console
        console.warn('[InputWrapper] No descriptor for', {kind, variant, field});
        return null;
    }

    const {Component, adapter, defaultProps} = descriptor;
    const valueProp = adapter?.valueProp ?? 'value';
    const changeProp = adapter?.changeProp ?? 'onChange';

    // Derive current value
    const multi = !!(field.options?.length && isMultiField(field));
    const isOptionBased = Array.isArray(field.options) && field.options.length > 0;

    let current: Scalar | Scalar[] | undefined = undefined;
    let onChange: ((v: unknown) => void) | undefined = undefined;

    if (form) {
        if (isOptionBased) {
            const sel = form.getSelections(field.id);
            current = multi ? sel : (sel[0] ?? null);
            onChange = (next: unknown) => {
                const normalized = adapter?.getValue ? adapter.getValue(next, current) : (next as Scalar | Scalar[]);
                if (Array.isArray(normalized)) {
                    form.setSelections(field.id, normalized.map(String));
                } else if (normalized == null) {
                    form.setSelections(field.id, []);
                } else {
                    form.setSelections(field.id, [String(normalized)]);
                }
            };
        } else {
            current = form.get(field.id);
            onChange = (next: unknown) => {
                const normalized = adapter?.getValue ? adapter.getValue(next, current) : (next as Scalar | Scalar[]);
                form.set(field.id, normalized as Scalar | Scalar[]);
            };
        }
    }

    const hostProps: Record<string, unknown> = {
        id: field.id,
        field,
        disabled: !!disabled,
        ...(defaultProps ?? {}),
        ...(extraProps ?? {}),
        // Provide options for option-based inputs
        ...(isOptionBased ? {options: field.options as FieldOption[]} : {}),
    };

    if (form) {
        hostProps[valueProp] = current as unknown;
        hostProps[changeProp] = onChange as unknown;
    }

    return <Component {...hostProps} />;
}