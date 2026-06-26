import {describe, it, expect} from 'vitest';
import {buildOrderSnapshot} from '../build-order-snapshot';

import {type Builder, createBuilder} from '../../core';
import type {ServiceProps, Field, FieldOption, Tag} from '../../schema';
import type {DgpServiceMap} from '../../schema/provider';

function mkPropsWithQuantityRule(rule: unknown): ServiceProps {
    const field: Field = {
        id: 'f_qty',
        type: 'text',
        bind_id: 'root',
        name: 'qty_input',
        label: 'Qty',
        meta: {quantity: rule as any},
        pricing_role: 'base',
    };
    return {
        filters: [{id: 'root', label: 'Root'}],
        fields: [field],
        schema_version: '1.0',
    };
}

function mkSelection(value: any) {
    return {
        activeTagId: 'root',
        formValuesByFieldId: {f_qty: value},
        optionSelectionsByFieldId: {},
    };
}

describe('buildOrderSnapshot – malformed quantity rules fallback', () => {
    it('falls back to host default when valueBy is unknown', () => {
        const hostDefault = 7;
        const props = mkPropsWithQuantityRule({valueBy: 'wat'}); // invalid
        const builder = createBuilder();
        builder.load(props);

        const snapshot = buildOrderSnapshot(
            props,
            builder,
            mkSelection(42),
            {}, // service map not needed for this test
            {mode: 'prod', hostDefaultQuantity: hostDefault}
        );

        expect(snapshot.quantity).toBe(hostDefault);
        expect(snapshot.quantitySource.kind).toBe('default');
        expect((snapshot.quantitySource as any).defaultedFromHost).toBe(true);
    });

    it('falls back to host default when valueBy="eval" but code is missing', () => {
        const hostDefault = 5;
        const props = mkPropsWithQuantityRule({valueBy: 'eval'}); // no code
        const builder = createBuilder();
        builder.load(props);

        const snapshot = buildOrderSnapshot(
            props,
            builder,
            mkSelection(123),
            {},
            {mode: 'prod', hostDefaultQuantity: hostDefault}
        );

        expect(snapshot.quantity).toBe(hostDefault);
        expect(snapshot.quantitySource.kind).toBe('default');
        expect((snapshot.quantitySource as any).defaultedFromHost).toBe(true);
    });

    it('falls back to host default when valueBy="eval" but code is not a string', () => {
        const hostDefault = 11;
        const props = mkPropsWithQuantityRule({valueBy: 'eval', code: 1337}); // bad type
        const builder = createBuilder();
        builder.load(props);

        const snapshot = buildOrderSnapshot(
            props,
            builder,
            mkSelection('9'),
            {},
            {mode: 'prod', hostDefaultQuantity: hostDefault}
        );

        expect(snapshot.quantity).toBe(hostDefault);
        expect(snapshot.quantitySource.kind).toBe('default');
        expect((snapshot.quantitySource as any).defaultedFromHost).toBe(true);
    });
});

/* ───────────────── helpers ───────────────── */

function makeBuilderVisibleFields(order: string[]): Builder {
    // Only visibleFields() is used by the snapshot builder here.
    return {
        visibleFields: (_tagId: string, _selected?: string[]) => order.slice(),
    } as unknown as Builder;
}

function tag(id: string, label: string, service_id?: number): Tag {
    return {
        id,
        label,
        ...(service_id !== undefined ? {service_id} : {}),
    } as Tag;
}

function fieldWithQuantity(
    id: string,
    bind_id: string | string[],
    quantity: {
        valueBy: 'value' | 'length' | 'eval';
        code?: string;
        multiply?: number;
        clamp?: {min?: number; max?: number};
        fallback?: number;
    },
    extra?: Partial<Field>
): Field {
    return {
        id,
        type: (extra?.type as string) ?? 'text',
        label: id,
        bind_id,
        ...(extra ?? {}),
        meta: {
            ...(extra?.meta ?? {}),
            quantity,
        },
    } as unknown as Field;
}

function plainField(id: string, bind_id: string | string[], extra?: Partial<Field>): Field {
    return {
        id,
        type: (extra?.type as string) ?? 'text',
        label: id,
        bind_id,
        ...(extra ?? {}),
    } as unknown as Field;
}

function propsOf(tags: Tag[], fields: Field[]): ServiceProps {
    return {filters: tags, fields, schema_version: '1.0'};
}

/* ───────────────── fixtures ───────────────── */

const svcMap: DgpServiceMap = {}; // services aren’t relevant for these tests

const ROOT = tag('t:root', 'Root');

/* ───────────────── tests ───────────────── */

describe('buildOrderSnapshot — quantity evaluation', () => {
    it('value rule: uses the numeric value (coerces string to number)', () => {
        const fQ = fieldWithQuantity('fQ', 't:root', {valueBy: 'value'});
        const props = propsOf([ROOT], [fQ]);
        const builder = makeBuilderVisibleFields(['fQ']);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {fQ: '5'}, // string "5" → 5
            optionSelectionsByFieldId: {},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 1,
        });

        expect(snap.quantity).toBe(5);
        expect(snap.quantitySource.kind).toBe('field');
        expect(snap.quantitySource).toMatchObject({id: 'fQ', rule: {valueBy: 'value'}});
    });

    it('length rule: uses string length', () => {
        const fQ = fieldWithQuantity('fLen', 't:root', {valueBy: 'length'});
        const props = propsOf([ROOT], [fQ]);
        const builder = makeBuilderVisibleFields(['fLen']);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {fLen: 'hello!'}, // length 6
            optionSelectionsByFieldId: {},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 1,
        });

        expect(snap.quantity).toBe(6);
        expect(snap.quantitySource.kind).toBe('field');
        expect(snap.quantitySource).toMatchObject({id: 'fLen', rule: {valueBy: 'length'}});
    });

    it('length rule: uses array length if the value is an array', () => {
        const fQ = fieldWithQuantity('fLenArr', 't:root', {valueBy: 'length'});
        const props = propsOf([ROOT], [fQ]);
        const builder = makeBuilderVisibleFields(['fLenArr']);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {fLenArr: [1, 2, 3, 4]}, // length 4
            optionSelectionsByFieldId: {},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 1,
        });

        expect(snap.quantity).toBe(4);
        expect(snap.quantitySource.kind).toBe('field');
    });

    it('eval rule: evaluates provided code against value/values', () => {
        const fQ = fieldWithQuantity('fEval', 't:root', {
            valueBy: 'eval',
            code: 'return Number(value) * 2;', // e.g. "3" → 6
        });
        const props = propsOf([ROOT], [fQ]);
        const builder = makeBuilderVisibleFields(['fEval']);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {fEval: '3'},
            optionSelectionsByFieldId: {},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 1,
        });

        expect(snap.quantity).toBe(6);
        expect(snap.quantitySource.kind).toBe('field');
        expect(snap.quantitySource).toMatchObject({id: 'fEval', rule: {valueBy: 'eval'}});
    });

    it('first visible field with a quantity rule takes precedence', () => {
        const f1 = fieldWithQuantity('f1', 't:root', {valueBy: 'value'});
        const f2 = fieldWithQuantity('f2', 't:root', {valueBy: 'value'});
        const props = propsOf([ROOT], [f1, f2]);

        // Order: f1 then f2
        const builder = makeBuilderVisibleFields(['f1', 'f2']);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {f1: '7', f2: '100'}, // f1 wins
            optionSelectionsByFieldId: {},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 1,
        });

        expect(snap.quantity).toBe(7);
        expect(snap.quantitySource).toMatchObject({kind: 'field', id: 'f1'});
    });

    it('does not fall through to later field rules when the first visible valid rule evaluates invalid', () => {
        const first = fieldWithQuantity('fFirst', 't:root', {valueBy: 'value'});
        const second = fieldWithQuantity('fSecond', 't:root', {valueBy: 'value'});
        const tagDefault: Tag = {
            ...ROOT,
            meta: {quantityDefault: 6} as any,
        };
        const props = propsOf([tagDefault], [first, second]);
        const builder = makeBuilderVisibleFields(['fFirst', 'fSecond']);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {fFirst: 'bad', fSecond: '9'},
            optionSelectionsByFieldId: {},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 1,
        });

        expect(snap.quantity).toBe(6);
        expect(snap.quantitySource).toMatchObject({kind: 'tag', id: 't:root'});
    });

    it('falls back to host default when quantity rule yields NaN/invalid', () => {
        const fQ = fieldWithQuantity('fBad', 't:root', {valueBy: 'value'});
        const props = propsOf([ROOT], [fQ]);
        const builder = makeBuilderVisibleFields(['fBad']);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {fBad: 'not-a-number'}, // → NaN
            optionSelectionsByFieldId: {},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 9,
        });

        expect(snap.quantity).toBe(9);
        expect(snap.quantitySource.kind).toBe('default');
        expect(snap.quantitySource).toMatchObject({defaultedFromHost: true});
    });

    it('falls back to host default when quantity rule result is ≤ 0', () => {
        const fQ = fieldWithQuantity('fZero', 't:root', {valueBy: 'value'});
        const props = propsOf([ROOT], [fQ]);
        const builder = makeBuilderVisibleFields(['fZero']);

        const selectionZero = {
            activeTagId: 't:root',
            formValuesByFieldId: {fZero: 0},
            optionSelectionsByFieldId: {},
        };

        const snapZero = buildOrderSnapshot(props, builder, selectionZero, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 3,
        });
        expect(snapZero.quantity).toBe(3);
        expect(snapZero.quantitySource.kind).toBe('default');

        const selectionNeg = {
            activeTagId: 't:root',
            formValuesByFieldId: {fZero: -5},
            optionSelectionsByFieldId: {},
        };
        const snapNeg = buildOrderSnapshot(props, builder, selectionNeg, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 4,
        });
        expect(snapNeg.quantity).toBe(4);
        expect(snapNeg.quantitySource.kind).toBe('default');
    });

    it('falls back to host default when no quantity rule exists on any visible field', () => {
        const fA = plainField('fA', 't:root');
        const fB = plainField('fB', 't:root');
        const props = propsOf([ROOT], [fA, fB]);
        const builder = makeBuilderVisibleFields(['fA', 'fB']);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {fA: '123', fB: '456'}, // irrelevant—no rules
            optionSelectionsByFieldId: {},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 2,
        });

        expect(snap.quantity).toBe(2);
        expect(snap.quantitySource.kind).toBe('default');
    });

    it('applies multiply and clamp to a field quantity rule', () => {
        const fQ = fieldWithQuantity('fScaled', 't:root', {
            valueBy: 'value',
            multiply: 2,
            clamp: {min: 3, max: 8},
        });
        const props = propsOf([ROOT], [fQ]);
        const builder = makeBuilderVisibleFields(['fScaled']);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {fScaled: '5'}, // 5 * 2 => 10, clamp max => 8
            optionSelectionsByFieldId: {},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 1,
        });

        expect(snap.quantity).toBe(8);
        expect(snap.quantitySource).toMatchObject({
            kind: 'field',
            id: 'fScaled',
            rule: {valueBy: 'value', multiply: 2, clamp: {min: 3, max: 8}},
        });
    });

    it('uses rule fallback when evaluation is invalid', () => {
        const fQ = fieldWithQuantity('fFallback', 't:root', {
            valueBy: 'value',
            fallback: 6,
        });
        const props = propsOf([ROOT], [fQ]);
        const builder = makeBuilderVisibleFields(['fFallback']);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {fFallback: 'bad'},
            optionSelectionsByFieldId: {},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 2,
        });

        expect(snap.quantity).toBe(6);
        expect(snap.quantitySource).toMatchObject({kind: 'field', id: 'fFallback'});
    });

    it('eval rule: if code throws or returns non-numeric → host default', () => {
        const fThrow = fieldWithQuantity('fThrow', 't:root', {
            valueBy: 'eval',
            code: 'throw new Error("boom");',
        });
        const fNan = fieldWithQuantity('fNan', 't:root', {
            valueBy: 'eval',
            code: 'return "nope";',
        });

        const props = propsOf([ROOT], [fThrow, fNan]);

        // Only first visible with a rule will be tested; make it the throwing one
        const builder = makeBuilderVisibleFields(['fThrow', 'fNan']);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {fThrow: 10, fNan: 10},
            optionSelectionsByFieldId: {},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 8,
        });

        expect(snap.quantity).toBe(8);
        expect(snap.quantitySource.kind).toBe('default');
    });

    it('uses selected option quantityDefault before tag default', () => {
        const options: FieldOption[] = [
            {
                id: 'o:std',
                label: 'Standard',
                value: 'standard',
                meta: {quantityDefault: 4} as any,
            },
        ];
        const field: Field = {
            id: 'f:opts',
            type: 'select',
            label: 'Options',
            bind_id: 't:root',
            options,
        } as Field;
        const rootWithDefault: Tag = {
            ...ROOT,
            meta: {quantityDefault: 9} as any,
        };
        const props = propsOf([rootWithDefault], [field]);
        const builder = makeBuilderVisibleFields(['f:opts']);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {},
            optionSelectionsByFieldId: {'f:opts': ['o:std']},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 1,
        });

        expect(snap.quantity).toBe(4);
        expect(snap.quantitySource).toMatchObject({kind: 'option', id: 'o:std'});
    });

    it('uses selected button field quantityDefault when no field rule or option default exists', () => {
        const buttonField: Field = {
            id: 'f:button',
            type: 'custom',
            label: 'Action',
            bind_id: 't:root',
            button: true,
            quantityDefault: 5,
        } as Field;
        const props = propsOf([ROOT], [buttonField]);
        const builder = makeBuilderVisibleFields(['f:button']);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {},
            optionSelectionsByFieldId: {},
            selectedKeys: ['f:button'],
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 1,
        });

        expect(snap.quantity).toBe(5);
        expect(snap.quantitySource).toMatchObject({kind: 'field', id: 'f:button'});
    });

    it('uses button-style option field quantityDefault when no field rule or option default exists', () => {
        const buttonContainer: Field = {
            id: 'f:mode',
            type: 'select',
            label: 'Mode',
            bind_id: 't:root',
            quantityDefault: 5,
            options: [{id: 'o:fast', label: 'Fast'}],
        } as Field;
        const tagDefault: Tag = {
            ...ROOT,
            meta: {quantityDefault: 8} as any,
        };
        const props = propsOf([tagDefault], [buttonContainer]);
        const builder = makeBuilderVisibleFields(['f:mode']);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {},
            optionSelectionsByFieldId: {'f:mode': ['o:fast']},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 1,
        });

        expect(snap.quantity).toBe(5);
        expect(snap.quantitySource).toMatchObject({kind: 'field', id: 'f:mode'});
    });

    it('uses tag quantityDefault when no field, option, or button source exists', () => {
        const tagDefault: Tag = {
            ...ROOT,
            meta: {quantityDefault: 7} as any,
        };
        const props = propsOf([tagDefault], []);
        const builder = makeBuilderVisibleFields([]);

        const selection = {
            activeTagId: 't:root',
            formValuesByFieldId: {},
            optionSelectionsByFieldId: {},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
            mode: 'prod',
            hostDefaultQuantity: 1,
        });

        expect(snap.quantity).toBe(7);
        expect(snap.quantitySource).toMatchObject({kind: 'tag', id: 't:root'});
    });
});

it('uses selected option quantityDefault from selectedKeys when legacy optionSelectionsByFieldId is empty', () => {
    const options: FieldOption[] = [
        {
            id: 'o:std',
            label: 'Standard',
            value: 'standard',
            meta: {quantityDefault: 4} as any,
        },
    ];
    const field: Field = {
        id: 'f:opts',
        type: 'select',
        label: 'Options',
        bind_id: 't:root',
        options,
    } as Field;
    const rootWithDefault: Tag = {
        ...ROOT,
        meta: {quantityDefault: 9} as any,
    };
    const props = propsOf([rootWithDefault], [field]);
    const builder = makeBuilderVisibleFields(['f:opts']);

    const selection = {
        activeTagId: 't:root',
        formValuesByFieldId: {},
        optionSelectionsByFieldId: {},
        selectedKeys: ['o:std'],
    };

    const snap = buildOrderSnapshot(props, builder, selection, svcMap, {
        mode: 'prod',
        hostDefaultQuantity: 1,
    });

    expect(snap.quantity).toBe(4);
    expect(snap.quantitySource).toMatchObject({kind: 'option', id: 'o:std'});
});
