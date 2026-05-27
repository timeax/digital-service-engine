import {describe, it, expect} from 'vitest';

import {buildOrderSnapshot} from '../build-order-snapshot';
import type {BuildOrderSelection} from '../build-order-snapshot';

import type {Builder} from '../../core';
import type {ServiceIdRef, ServiceProps, Field, FieldOption, Tag} from '../../schema';
import type {DgpServiceMap} from '../../schema/provider';

/* ───────────────── helpers ───────────────── */

function makeBuilderVisibleFields(visible: string[]): Builder {
    // We only need visibleFields() for these tests
    const b = {
        visibleFields: (tagId: string, _selected?: string[]) => visible.slice(),
    } as unknown as Builder;
    return b;
}

function tag(id: string, label: string, service_id?: ServiceIdRef): Tag {
    return {
        id,
        label,
        ...(service_id !== undefined ? {service_id} : {}),
    } as Tag;
}

function field(
    id: string,
    bind_id: string | string[],
    options?: FieldOption[],
): Field {
    return {
        id,
        type: 'select',
        bind_id,
        label: id,
        options: options ?? [],
    } as Field;
}

function opt(id: string, label: string, service_id?: ServiceIdRef, pricing_role: 'base' | 'utility' = 'base'): FieldOption {
    const o: FieldOption = {id, label, ...(service_id !== undefined ? {service_id} : {}), pricing_role};
    return o;
}

function baseProps(tags: Tag[], fields: Field[]): ServiceProps {
    return {
        filters: tags,
        fields,
        schema_version: '1.0',
        // no fallbacks here; we’re testing service composition only
    };
}

/* ───────────────── fixtures ───────────────── */

const svcMap: DgpServiceMap = {
    1: {id: 1, rate: 100},
    10: {id: 10, rate: 90},
    11: {id: 11, rate: 80},
    99: {id: 99, rate: 70},
};

/* ───────────────── tests ───────────────── */

describe('buildOrderSnapshot — service composition', () => {
    it('uses tag service as default when no option with service_id is selected', () => {
        const tags = [tag('t:root', 'Root', 1)];
        const fA = field('fA', 't:root', [opt('o:A1', 'A1'), opt('o:A2', 'A2')]); // no service ids
        const props = baseProps(tags, [fA]);

        const builder = makeBuilderVisibleFields(['fA']);
        const selection: BuildOrderSelection = {
            activeTagId: 't:root',
            formValuesByFieldId: {},
            optionSelectionsByFieldId: {fA: ['o:A1']}, // selected but no service_id on option
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {mode: 'prod'});

        expect(snap.services).toEqual([1]);
        expect(snap.serviceMap).toEqual({'t:root': [1]});
    });

    it('first selected option with service_id overrides tag default as primary; others append (selection order)', () => {
        const tags = [tag('t:root', 'Root', 1)];
        const fA = field('fA', 't:root', [
            opt('o:A1', 'A1', 10), // has service → should become primary, overrides tag default
            opt('o:A2', 'A2', 11), // appended after
        ]);
        const props = baseProps(tags, [fA]);

        const builder = makeBuilderVisibleFields(['fA']);

        const selection: BuildOrderSelection = {
            activeTagId: 't:root',
            formValuesByFieldId: {},
            optionSelectionsByFieldId: {fA: ['o:A1', 'o:A2']},
            optionTraversalOrder: [
                {fieldId: 'fA', optionId: 'o:A1'},
                {fieldId: 'fA', optionId: 'o:A2'},
            ],
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {mode: 'prod'});

        // primary is 10 (o:A1), then 11 (o:A2)
        expect(snap.services).toEqual([10, 11]);
        // serviceMap records true origins; tag default is NOT kept because it was overridden
        expect(snap.serviceMap).toEqual({
            'o:A1': [10],
            'o:A2': [11],
        });
        // ensure tag->service mapping is absent when overridden
        expect(Object.keys(snap.serviceMap)).not.toContain('t:root');
    });

    it('ignores options from non-visible fields', () => {
        const tags = [tag('t:root', 'Root', 1), tag('t:other', 'Other')];
        const fA = field('fA', 't:root', [opt('o:A1', 'A1', 10)]);
        const fB = field('fB', 't:other', [opt('o:B1', 'B1', 99)]); // not visible for t:root
        const props = baseProps(tags, [fA, fB]);

        const builder = makeBuilderVisibleFields(['fA']); // ONLY fA visible in this context

        const selection: BuildOrderSelection = {
            activeTagId: 't:root',
            formValuesByFieldId: {},
            optionSelectionsByFieldId: {
                fA: ['o:A1'],
                fB: ['o:B1'], // should be ignored (field not visible for active tag)
            },
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {mode: 'prod'});

        expect(snap.services).toEqual([10]); // o:B1(99) ignored
        expect(snap.serviceMap).toEqual({'o:A1': [10]});
        expect(Object.keys(snap.serviceMap)).not.toContain('o:B1');
    });

    it('dedupes services list when multiple selected options map to the same service_id', () => {
        const tags = [tag('t:root', 'Root')];
        const fA = field('fA', 't:root', [
            opt('o:A1', 'A1', 10),
            opt('o:A2', 'A2', 10), // same service id as A1
        ]);
        const props = baseProps(tags, [fA]);

        const builder = makeBuilderVisibleFields(['fA']);
        const selection: BuildOrderSelection = {
            activeTagId: 't:root',
            formValuesByFieldId: {},
            optionSelectionsByFieldId: {fA: ['o:A1', 'o:A2']},
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {mode: 'prod'});

        // Services list is deduped (single 10), but serviceMap keeps both origins
        expect(snap.services).toEqual([10]);
        expect(snap.serviceMap).toEqual({
            'o:A1': [10],
            'o:A2': [10],
        });
    });

    it('ignores misconfigured utilities that carry a service_id (defensive guard)', () => {
        const tags = [tag('t:root', 'Root', 1)];
        const fA = field('fA', 't:root', [
            opt('o:U1', 'U1', 10, 'utility'), // should be ignored (utility with service_id)
            opt('o:B1', 'B1', 11, 'base'),    // valid service
        ]);
        const props = baseProps(tags, [fA]);

        const builder = makeBuilderVisibleFields(['fA']);
        const selection: BuildOrderSelection = {
            activeTagId: 't:root',
            formValuesByFieldId: {},
            optionSelectionsByFieldId: {fA: ['o:U1', 'o:B1']},
            optionTraversalOrder: [
                {fieldId: 'fA', optionId: 'o:U1'},
                {fieldId: 'fA', optionId: 'o:B1'},
            ],
        };

        const snap = buildOrderSnapshot(props, builder, selection, svcMap, {mode: 'prod'});

        // Only the base-role option contributes a service; tag default is overridden
        expect(snap.services).toEqual([11]);
        expect(snap.serviceMap).toEqual({'o:B1': [11]});
        expect(Object.keys(snap.serviceMap)).not.toContain('o:U1');
        expect(Object.keys(snap.serviceMap)).not.toContain('t:root');
    });

    it('preserves string service ids and the full fallback rate policy in snapshot context', () => {
        const tags = [tag('t:root', 'Root', 'svc:root')];
        const fA = field('fA', 't:root', [opt('o:A1', 'A1', 'svc:child')]);
        const props = baseProps(tags, [fA]);
        const builder = makeBuilderVisibleFields(['fA']);
        const services: DgpServiceMap = {
            'svc:root': {id: 'svc:root', rate: 100, min: 1, max: 10},
            'svc:child': {id: 'svc:child', rate: 95, min: 1, max: 10},
        } as DgpServiceMap;

        const snap = buildOrderSnapshot(
            props,
            builder,
            {
                activeTagId: 't:root',
                formValuesByFieldId: {},
                optionSelectionsByFieldId: {fA: ['o:A1']},
            },
            services,
            {
                mode: 'prod',
                fallback: {
                    ratePolicy: {kind: 'eq_primary'},
                },
            },
        );

        expect(snap.services).toEqual(['svc:child']);
        expect(snap.serviceMap).toEqual({'o:A1': ['svc:child']});
        expect(snap.meta?.context?.policy.ratePolicy).toEqual({kind: 'eq_primary'});
    });

    it('carries utility percentBase and label for percent utilities', () => {
        const tags = [tag('t:root', 'Root')];
        const percentField: Field = {
            id: 'f:percent',
            type: 'text',
            bind_id: 't:root',
            label: 'Percent utility',
            pricing_role: 'utility',
            meta: {
                utility: {
                    rate: 12,
                    mode: 'percent',
                    percentBase: 'service_total',
                    label: 'Rush uplift',
                },
            } as any,
        } as Field;
        const props = baseProps(tags, [percentField]);
        const builder = makeBuilderVisibleFields(['f:percent']);

        const snap = buildOrderSnapshot(
            props,
            builder,
            {
                activeTagId: 't:root',
                formValuesByFieldId: {},
                optionSelectionsByFieldId: {},
            },
            svcMap,
            {mode: 'prod', hostDefaultQuantity: 3},
        );

        expect(snap.utilities).toEqual([
            {
                nodeId: 'f:percent',
                mode: 'percent',
                rate: 12,
                percentBase: 'service_total',
                label: 'Rush uplift',
                inputs: {quantity: 3},
            },
        ]);
    });

    it('uses the parent field value for option per_value utilities', () => {
        const tags = [tag('t:root', 'Root')];
        const utilityOption: FieldOption = {
            id: 'o:length',
            label: 'By length',
            pricing_role: 'utility',
            meta: {
                utility: {
                    rate: 2,
                    mode: 'per_value',
                    valueBy: 'length',
                },
            } as any,
        };
        const inputField: Field = {
            id: 'f:input',
            type: 'select',
            bind_id: 't:root',
            label: 'Input',
            options: [utilityOption],
        } as Field;
        const props = baseProps(tags, [inputField]);
        const builder = makeBuilderVisibleFields(['f:input']);

        const snap = buildOrderSnapshot(
            props,
            builder,
            {
                activeTagId: 't:root',
                formValuesByFieldId: {'f:input': 'hello'},
                optionSelectionsByFieldId: {'f:input': ['o:length']},
            },
            svcMap,
            {mode: 'prod', hostDefaultQuantity: 2},
        );

        expect(snap.utilities).toEqual([
            {
                nodeId: 'o:length',
                mode: 'per_value',
                rate: 2,
                inputs: {
                    quantity: 2,
                    valueBy: 'length',
                    value: 5,
                },
            },
        ]);
    });
});

describe('buildOrderSnapshot — order kind resolution', () => {
    const tags = [tag('t:subscription', 'Subscription', 1)];
    const buttonField: Field = {
        id: 'f:instant-order',
        type: 'checkbox',
        bind_id: 't:subscription',
        label: 'Instant order',
        button: true,
    } as Field;
    const optionField = field('f:term', 't:subscription', [
        opt('o:contract-12m', '12 months', 10),
        opt('o:quote', 'Quote', 11),
    ]);

    const builder = makeBuilderVisibleFields(['f:instant-order', 'f:term']);
    const base: ServiceProps = {
        ...baseProps(tags, [buttonField, optionField]),
        orderKinds: {
            't:subscription': 'subscription',
            'f:instant-order': 'contract',
            'o:contract-12m': 'contract',
            'o:quote': 'quote',
            'unknown-node': 'ignored',
        },
    };

    it('resolves tag-only order kind when no selected override exists', () => {
        const snap = buildOrderSnapshot(
            base,
            builder,
            {
                activeTagId: 't:subscription',
                formValuesByFieldId: {},
                optionSelectionsByFieldId: {},
            },
            svcMap,
            {mode: 'prod'},
        );

        expect(snap.orderKind).toBe('subscription');
        expect(snap.orderKindSource).toEqual({
            nodeId: 't:subscription',
            nodeKind: 'tag',
        });
    });

    it('resolves button override over tag mapping', () => {
        const snap = buildOrderSnapshot(
            base,
            builder,
            {
                activeTagId: 't:subscription',
                formValuesByFieldId: {},
                optionSelectionsByFieldId: {},
                selectedKeys: ['f:instant-order'],
            },
            svcMap,
            {mode: 'prod'},
        );

        expect(snap.orderKind).toBe('contract');
        expect(snap.orderKindSource).toEqual({
            nodeId: 'f:instant-order',
            nodeKind: 'field',
        });
    });

    it('resolves option override over tag mapping', () => {
        const snap = buildOrderSnapshot(
            base,
            builder,
            {
                activeTagId: 't:subscription',
                formValuesByFieldId: {},
                optionSelectionsByFieldId: {'f:term': ['o:quote']},
            },
            svcMap,
            {mode: 'prod'},
        );

        expect(snap.orderKind).toBe('quote');
        expect(snap.orderKindSource).toEqual({
            nodeId: 'o:quote',
            nodeKind: 'option',
        });
    });

    it('allows multiple selected triggers resolving to the same kind', () => {
        const snap = buildOrderSnapshot(
            base,
            builder,
            {
                activeTagId: 't:subscription',
                formValuesByFieldId: {},
                optionSelectionsByFieldId: {'f:term': ['o:contract-12m']},
                selectedKeys: ['f:instant-order', 'o:contract-12m'],
            },
            svcMap,
            {mode: 'prod'},
        );

        expect(snap.orderKind).toBe('contract');
        expect(snap.orderKindSource).toEqual({
            nodeId: 'f:instant-order',
            nodeKind: 'field',
        });
    });

    it('falls back to null when no mapped trigger is active', () => {
        const props: ServiceProps = {
            ...base,
            orderKinds: {},
        };
        const snap = buildOrderSnapshot(
            props,
            builder,
            {
                activeTagId: 't:subscription',
                formValuesByFieldId: {},
                optionSelectionsByFieldId: {},
            },
            svcMap,
            {mode: 'prod'},
        );

        expect(snap.orderKind).toBeNull();
        expect(snap.orderKindSource).toBeNull();
    });

    it('normalizes composite/internal selection tokens to option ids for lookup', () => {
        const snap = buildOrderSnapshot(
            base,
            builder,
            {
                activeTagId: 't:subscription',
                formValuesByFieldId: {},
                optionSelectionsByFieldId: {},
                selectedKeys: ['f:term::o:quote'],
            },
            svcMap,
            {mode: 'prod'},
        );

        expect(snap.orderKind).toBe('quote');
        expect(snap.orderKindSource).toEqual({
            nodeId: 'o:quote',
            nodeKind: 'option',
        });
    });
});

describe('buildOrderSnapshot - selectedKeys derived option selections', () => {
    it('derives selection.fields, inputs.selections, utilities, and nodeContexts from selectedKeys when legacy map is empty', () => {
        const tags = [tag('t:root', 'Root')];
        const utilityOption: FieldOption = {
            id: 'o:util',
            label: 'Utility',
            pricing_role: 'utility',
            meta: {utility: {rate: 3, mode: 'per_quantity'}} as any,
        };
        const inputField: Field = {
            id: 'f:input',
            type: 'select',
            bind_id: 't:root',
            label: 'Input',
            options: [utilityOption],
        } as Field;
        const props = baseProps(tags, [inputField]);
        const builder = makeBuilderVisibleFields(['f:input']);

        const snap = buildOrderSnapshot(
            props,
            builder,
            {
                activeTagId: 't:root',
                formValuesByFieldId: {'f:input': 'abc'},
                optionSelectionsByFieldId: {},
                selectedKeys: ['o:util'],
            },
            svcMap,
            {mode: 'prod', hostDefaultQuantity: 2},
        );

        expect(snap.selection.fields).toEqual([
            {id: 'f:input', type: 'select', selectedOptions: ['o:util']},
        ]);
        expect(snap.inputs.selections).toEqual({'f:input': ['o:util']});
        expect(snap.utilities).toEqual([
            {nodeId: 'o:util', mode: 'per_quantity', rate: 3, inputs: {quantity: 2}},
        ]);
        expect(snap.meta?.context?.nodeContexts).toEqual({
            't:root': 't:root',
            'o:util': 't:root',
        });
    });

    it('keeps highest-rate selected base service as primary regardless of selection order', () => {
        const tags = [tag('t:root', 'Root', 1)];
        const fA = field('fA', 't:root', [
            opt('o:A1', 'A1', 10),
            opt('o:A2', 'A2', 11),
            opt('o:A3', 'A3', 1),
        ]);
        const props = baseProps(tags, [fA]);
        const builder = makeBuilderVisibleFields(['fA']);

        const snap = buildOrderSnapshot(
            props,
            builder,
            {
                activeTagId: 't:root',
                formValuesByFieldId: {},
                optionSelectionsByFieldId: {},
                selectedKeys: ['o:A2', 'o:A1', 'o:A3'],
            },
            svcMap,
            {mode: 'prod'},
        );

        expect(snap.services).toEqual([1, 11, 10]);
    });

    it('keeps facade import behavior stable for buildOrderSnapshot', () => {
        const tags = [tag('t:root', 'Root', 1)];
        const props = baseProps(tags, []);
        const builder = makeBuilderVisibleFields([]);
        const snap = buildOrderSnapshot(
            props,
            builder,
            {
                activeTagId: 't:root',
                formValuesByFieldId: {},
                optionSelectionsByFieldId: {},
            },
            svcMap,
            {mode: 'prod', hostDefaultQuantity: 5},
        );

        expect(typeof buildOrderSnapshot).toBe('function');
        expect(snap.selection.tag).toBe('t:root');
        expect(snap.quantity).toBe(5);
    });
});
