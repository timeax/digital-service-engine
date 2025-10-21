// src/react/hooks/OrderFields.tsx
import React, {useMemo} from 'react';
import type {ServiceProps, Tag, Field} from '../../schema';
import type {VisibleGroup} from '../canvas/selection';
import {useOrderFlowContext} from '../hooks/OrderFlowProvider';
import {InputWrapper} from '../inputs/InputWrapper';

export type TagRole = 'ancestor' | 'active' | 'child';
export type TagItemProps = {
    tag: Tag;
    role: TagRole;
    active: boolean;
    className?: string;
    onSelect?: () => void;
    disabled?: boolean;
};

export type TagHeaderInfo = {
    active?: Tag;
    ancestors: Tag[];
    children: Tag[];
    select: (tagId: string) => void;
    isActive: (tagId: string) => boolean;
    classes: { base?: string; active?: string; ancestor?: string; child?: string };
};

export type OrderFieldsProps = {
    /** Render the tag header, or supply a custom renderer */
    renderTag?: boolean | ((info: TagHeaderInfo) => React.ReactNode);
    /** Replace the default tag chip */
    tagComponent?: React.ComponentType<TagItemProps>;
    /** Class hooks for tag chips */
    tagClassName?: string;
    activeTagClassName?: string;
    ancestorTagClassName?: string;
    childTagClassName?: string;

    /** Layout */
    gap?: number | string;        // gap between header and inputs
    inputGap?: number | string;   // gap between individual inputs

    /** enabled by default */
    allowTagSwitch?: boolean;

    /** Container-level decorators (wrap the *entire* inputs grid) */
    BeforeInputs?: React.ComponentType<{ group: VisibleGroup; fields: Field[] }>;
    AfterInputs?: React.ComponentType<{ group: VisibleGroup; fields: Field[] }>;

    /** Per-field wrapper options */
    fieldItemClassName?: string;
    renderField?: (field: Field) => React.ReactNode;

    /** When no fields are visible */
    emptyState?: React.ReactNode;
};

export function OrderFields({
                                renderTag = true,
                                tagComponent: TagComp,
                                tagClassName,
                                activeTagClassName,
                                ancestorTagClassName,
                                childTagClassName,
                                gap = 8,
                                inputGap = 12,
                                allowTagSwitch = true,
                                BeforeInputs,
                                AfterInputs,
                                fieldItemClassName,
                                renderField,
                                emptyState = null,
                            }: OrderFieldsProps) {
    const {builder, selection, activeTagId, setActiveTag} = useOrderFlowContext();
    const props = builder.getProps() as ServiceProps;

    const vg = selection.visibleGroup();
    const fieldIds: string[] = vg.kind === 'single' ? (vg.group.fieldIds ?? []) : [];

    const fieldById = useMemo(
        () => new Map((props.fields ?? []).map(f => [f.id, f])),
        [props.fields]
    );

    const {active, ancestors, children} = useMemo(() => {
        const tags = props.filters ?? [];
        const byId = new Map(tags.map(t => [t.id, t]));
        const a = activeTagId ? byId.get(activeTagId) : undefined;

        const anc: Tag[] = [];
        let cur = a?.bind_id;
        const seen = new Set<string>();
        while (cur && !seen.has(cur)) {
            const t = byId.get(cur);
            if (!t) break;
            anc.unshift(t);
            seen.add(cur);
            cur = t.bind_id;
        }
        const ch = tags.filter(t => t.bind_id === activeTagId);
        return {active: a, ancestors: anc, children: ch};
    }, [props.filters, activeTagId]);

    const classes = {
        base: tagClassName,
        active: activeTagClassName,
        ancestor: ancestorTagClassName,
        child: childTagClassName,
    };
    const select = (id: string) => allowTagSwitch && setActiveTag(id);
    const isActive = (id: string) => id === activeTagId;

    const header =
        typeof renderTag === 'function'
            ? renderTag({active, ancestors, children, select, isActive, classes})
            : renderTag && (
            <div style={{display: 'grid', gap}}>
                {ancestors.length > 0 && (
                    <div style={{display: 'flex', gap}}>
                        {ancestors.map(t => (
                            <TagChip
                                key={t.id}
                                tag={t}
                                role="ancestor"
                                active={false}
                                className={merge(classes.base, classes.ancestor)}
                                onSelect={() => select(t.id)}
                                asChild={TagComp}
                            />
                        ))}
                    </div>
                )}
                {active && (
                    <div>
                        <TagChip
                            key={active.id}
                            tag={active}
                            role="active"
                            active
                            className={merge(classes.base, classes.active)}
                            disabled
                            asChild={TagComp}
                        />
                    </div>
                )}
                {children.length > 0 && (
                    <div style={{display: 'flex', gap}}>
                        {children.map(t => (
                            <TagChip
                                key={t.id}
                                tag={t}
                                role="child"
                                active={false}
                                className={merge(classes.base, classes.child)}
                                onSelect={() => select(t.id)}
                                asChild={TagComp}
                            />
                        ))}
                    </div>
                )}
            </div>
        );

    // Build the concrete field objects in order
    const fields: Field[] = fieldIds
        .map(fid => fieldById.get(fid))
        .filter((f): f is Field => !!f);

    // In dev/workspace multi-tag case, vg.kind !== 'single' → no inputs
    const group: VisibleGroup | undefined = vg.kind === 'single' ? vg.group : undefined;

    return (
        <div style={{display: 'grid', gap}}>
            {header}

            {group && BeforeInputs ? <BeforeInputs group={group} fields={fields} /> : null}

            <div style={{display: 'grid', gap: inputGap}}>
                {fields.length === 0
                    ? emptyState
                    : fields.map((field) => (
                        <div key={field.id} className={fieldItemClassName}>
                            {renderField ? renderField(field) : <InputWrapper field={field} />}
                        </div>
                    ))}
            </div>

            {group && AfterInputs ? <AfterInputs group={group} fields={fields} /> : null}
        </div>
    );
}

/* ───────────── helpers ───────────── */

function merge(a?: string, b?: string) {
    return a && b ? `${a} ${b}` : a ?? b;
}

function DefaultTagChip({tag, className, onSelect, disabled}: TagItemProps) {
    return (
        <button
            type="button"
            className={className}
            onClick={disabled ? undefined : onSelect}
            disabled={disabled}
            aria-pressed={disabled}
            style={{
                padding: '4px 8px',
                borderRadius: 8,
                border: '1px solid #ddd',
                background: disabled ? '#f7f7f7' : '#fff',
            }}
        >
            {tag.label ?? tag.id}
        </button>
    );
}

function TagChip(props: TagItemProps & { asChild?: React.ComponentType<TagItemProps> }) {
    const {asChild: AsChild, ...rest} = props;
    if (AsChild) return <AsChild {...rest} />;
    return <DefaultTagChip {...rest} />;
}