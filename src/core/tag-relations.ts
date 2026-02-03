import type { Field, FieldOption, Tag } from "@/schema";
import { Builder } from "@/core/builder";

export type NodeKind = "tag" | "field" | "option" | "unknown";

export type RelKind = "self" | "ancestor" | "descendant" | "unrelated";

export interface AncestryHit {
    kind: RelKind;
    node: TagNode;
    index: number;
    direct: boolean;
    path: string[];
}

export interface WithAncestry {
    ancestry(baseTag: string | TagNode): readonly AncestryHit[];
    isAncestorOf(baseTag: string | TagNode): boolean;
    isDescendantOf(baseTag: string | TagNode): boolean;
    isWithin(baseTag: string | TagNode): boolean;
}

export interface TagNode extends WithAncestry {
    kind: "tag";
    id: string;
    raw: Tag;

    includes: ReadonlySet<string>;
    excludes: ReadonlySet<string>;
    isInherited?: boolean;

    parent(): TagNode | undefined;
    children(): readonly TagNode[];
    ancestors(): readonly {
        node: TagNode;
        direct: boolean;
        index: number;
        path: string[];
    }[];
    pathTo(descendant: string | TagNode): string[] | null;
    isBoundTo(tagId: string | TagNode): boolean;
    getDescendant(id: string): FieldNode | undefined;
    getDescendants(): readonly FieldNode[];
}

export interface FieldNode extends WithAncestry {
    kind: "field";
    id: string;
    raw: Field;

    includes: ReadonlySet<string>;
    excludes: ReadonlySet<string>;
    isInherited?: boolean;

    bindIds(): readonly string[];
    ownerTags(): readonly TagNode[];
    isBoundTo(tagId: string | TagNode): boolean;
    getDescendant(id: string, contextId?: string): FieldNode | undefined;
    getDescendants(tagId?: string): readonly FieldNode[];
}

export interface OptionNode extends WithAncestry {
    kind: "option";
    id: string;
    raw: FieldOption;

    includes: ReadonlySet<string>;
    excludes: ReadonlySet<string>;
    isInherited?: boolean;

    field(): FieldNode;
    ownerTags(): readonly TagNode[];
    isBoundTo(tagId: string | TagNode): boolean;
    getDescendant(id: string, contextId?: string): FieldNode | undefined;
    getDescendants(tagId?: string): readonly FieldNode[];
}

export interface UnknownNode extends WithAncestry {
    kind: "unknown";
    id: string;

    includes: ReadonlySet<string>;
    excludes: ReadonlySet<string>;
    isInherited?: boolean;
}

export type AnyNode = TagNode | FieldNode | OptionNode | UnknownNode;

export interface NodeIndex {
    getNode(input: string | Tag | Field | FieldOption): AnyNode;
    getTag(id: string): TagNode | undefined;
    getField(id: string): FieldNode | undefined;
    getOption(id: string): OptionNode | undefined;
}

const toId = (x: string | { id: string }) => (typeof x === "string" ? x : x.id);

const toBindList = (b: Field["bind_id"]): string[] => {
    if (!b) return [];
    return typeof b === "string" ? [b] : [...b];
};

export function createNodeIndex(
    builder: Builder
): NodeIndex {
    const props = builder.getProps();
    //---
    const tags = props.filters ?? [];
    const fields = props.fields ?? [];

    const tagById = new Map<string, Tag>(tags.map((t) => [t.id, t]));
    const fieldById = new Map<string, Field>(fields.map((f) => [f.id, f]));

    const optionById = new Map<string, FieldOption>();
    const optionOwnerFieldId = new Map<string, string>();
    for (const f of fields) {
        for (const o of f.options ?? []) {
            optionById.set(o.id, o);
            optionOwnerFieldId.set(o.id, f.id);
        }
    }

    const parentById = new Map<string, string | undefined>();
    const childrenById = new Map<string, string[]>();
    for (const t of tags) {
        parentById.set(t.id, t.bind_id);
        if (t.bind_id) {
            const arr = childrenById.get(t.bind_id) ?? [];
            arr.push(t.id);
            childrenById.set(t.bind_id, arr);
        }
    }

    // --- caches
    const nodeCache = new Map<string, AnyNode>();
    const tagNodeCache = new Map<string, TagNode>();
    const fieldNodeCache = new Map<string, FieldNode>();
    const optionNodeCache = new Map<string, OptionNode>();

    const tagAncestorsCache = new Map<
        string,
        readonly {
            node: TagNode;
            direct: boolean;
            index: number;
            path: string[];
        }[]
    >();
    const tagChildrenCache = new Map<string, readonly TagNode[]>();
    const lineageIdsCache = new Map<string, ReadonlySet<string>>();

    const fieldBindIdsCache = new Map<string, readonly string[]>();
    const fieldOwnerTagsCache = new Map<string, readonly TagNode[]>();

    const emptySet = Object.freeze(new Set<string>());

    const isFieldBoundDirectToTag = (fieldId: string, tagId: string): boolean => {
        const field = fieldById.get(fieldId);
        if (!field) return false;
        const bind = field.bind_id;
        if (!bind) return false;
        if (typeof bind === "string") return bind === tagId;
        return bind.includes(tagId);
    };

    const resolveDescendants = (
        id: string,
        includes: ReadonlySet<string>,
        tagId?: string,
        forceSimple?: boolean
    ): readonly FieldNode[] => {
        if (!tagId || forceSimple) {
            const results: FieldNode[] = [];
            for (const incId of includes) {
                const node = getField(incId);
                if (node) results.push(node);
            }
            return Object.freeze(results);
        }

        const results: FieldNode[] = [];
        const visible = builder.visibleFields(tagId, [id]);

        for (const fieldId of visible) {
            const node = getField(fieldId);
            if (!node) continue;
            const explicit =
                includes.has(fieldId) ||
                isFieldBoundDirectToTag(fieldId, tagId);
            results.push(explicit ? node : { ...node, isInherited: true });
        }

        return Object.freeze(results);
    };

    // ---- core graph helpers
    const lineageIds = (tagId: string): ReadonlySet<string> => {
        const cached = lineageIdsCache.get(tagId);
        if (cached) return cached;

        const out = new Set<string>();
        const guard = new Set<string>();
        let cur: string | undefined = tagId;

        while (cur && !guard.has(cur)) {
            out.add(cur);
            guard.add(cur);
            cur = parentById.get(cur);
        }

        lineageIdsCache.set(tagId, out);
        return out;
    };

    const pathBetween = (fromId: string, toId: string): string[] | null => {
        if (fromId === toId) return [fromId];

        const guard = new Set<string>();
        const stack: string[] = [];
        let cur: string | undefined = toId;

        while (cur && !guard.has(cur)) {
            stack.push(cur);
            if (cur === fromId) return stack.reverse(); // from -> ... -> to
            guard.add(cur);
            cur = parentById.get(cur);
        }
        return null;
    };

    const relationBetween = (
        baseId: string,
        otherId: string,
    ): { kind: RelKind; path: string[]; index: number; direct: boolean } => {
        if (baseId === otherId)
            return { kind: "self", path: [baseId], index: 0, direct: false };

        // base -> other ? => descendant
        const down = pathBetween(baseId, otherId);
        if (down)
            return {
                kind: "descendant",
                path: down,
                index: down.length - 1,
                direct: down.length === 2,
            };

        // other -> base ? => ancestor
        const up = pathBetween(otherId, baseId);
        if (up) {
            // want base -> other path; we can just reverse "up"
            const p = up.slice().reverse();
            return {
                kind: "ancestor",
                path: p,
                index: p.length - 1,
                direct: p.length === 2,
            };
        }

        return { kind: "unrelated", path: [], index: -1, direct: false };
    };

    // ---- shared ancestry impl builder
    const makeAncestry = (selfOwnerTagIds: readonly string[]) => {
        return (baseTag: string | TagNode): readonly AncestryHit[] => {
            const baseId = toId(baseTag);
            const hits: AncestryHit[] = [];

            for (const ownerId of selfOwnerTagIds) {
                const owner = getTag(ownerId);
                if (!owner) continue;

                const rel = relationBetween(baseId, ownerId);
                hits.push({
                    kind: rel.kind,
                    node: owner,
                    index: rel.index,
                    direct: rel.direct,
                    path: rel.path,
                });
            }

            return hits;
        };
    };

    const makeAncestryFns = (
        ancestryFn: (baseTag: string | TagNode) => readonly AncestryHit[],
    ) => ({
        ancestry: ancestryFn,

        isAncestorOf(baseTag: string | TagNode): boolean {
            return ancestryFn(baseTag).some((h) => h.kind === "ancestor");
        },

        isDescendantOf(baseTag: string | TagNode): boolean {
            return ancestryFn(baseTag).some((h) => h.kind === "descendant");
        },

        isWithin(baseTag: string | TagNode): boolean {
            return ancestryFn(baseTag).some(
                (h) => h.kind === "self" || h.kind === "descendant",
            );
        },
    });

    // ---- node factories
    const getTag = (id: string): TagNode | undefined => {
        const cached = tagNodeCache.get(id);
        if (cached) return cached;

        const raw = tagById.get(id);
        if (!raw) return undefined;

        const includes = Object.freeze(new Set(raw.includes ?? []));
        const excludes = Object.freeze(new Set(raw.excludes ?? []));

        const ancestryFn = makeAncestry([id]);

        const node: TagNode = {
            kind: "tag",
            id,
            raw,

            includes,
            excludes,

            ...makeAncestryFns(ancestryFn),

            parent() {
                const pid = parentById.get(id);
                return pid ? getTag(pid) : undefined;
            },

            children() {
                const cachedChildren = tagChildrenCache.get(id);
                if (cachedChildren) return cachedChildren;

                const childIds = childrenById.get(id) ?? [];
                const arr = childIds
                    .map((cid) => getTag(cid))
                    .filter(Boolean) as TagNode[];
                const frozen = Object.freeze(arr);
                tagChildrenCache.set(id, frozen);
                return frozen;
            },

            ancestors() {
                const cachedAnc = tagAncestorsCache.get(id);
                if (cachedAnc) return cachedAnc;

                const rows: Array<{
                    node: TagNode;
                    direct: boolean;
                    index: number;
                    path: string[];
                }> = [];
                const guard = new Set<string>();
                let cur = parentById.get(id);
                let index = 1;

                while (cur && !guard.has(cur)) {
                    const n = getTag(cur);
                    if (!n) break;
                    const p = pathBetween(id, cur) ?? [id, cur];

                    rows.push({ node: n, direct: index === 1, index, path: p });

                    guard.add(cur);
                    cur = parentById.get(cur);
                    index++;
                }

                const frozen = Object.freeze(rows);
                tagAncestorsCache.set(id, frozen);
                return frozen;
            },

            pathTo(descendant) {
                const to = toId(descendant);
                return pathBetween(id, to);
            },

            isBoundTo(tagId) {
                const tid = toId(tagId);
                if (tid === id) return true;
                // A tag is bound to tagId if tagId is its DIRECT parent.
                return parentById.get(id) === tid;
            },

            getDescendant(descendantId) {
                return this.getDescendants().find(item => item.id == descendantId)
            },

            getDescendants() {
                const results: FieldNode[] = [];
                const visible = builder.visibleFields(id);

                for (const fieldId of visible) {
                    const node = getField(fieldId);
                    if (!node) continue;
                    const explicit =
                        includes.has(fieldId) ||
                        isFieldBoundDirectToTag(fieldId, id);
                    results.push(explicit ? node : { ...node, isInherited: true });
                }

                return Object.freeze(results);
            },
        };

        tagNodeCache.set(id, node);
        nodeCache.set(id, node);
        return node;
    };

    const getField = (id: string): FieldNode | undefined => {
        const cached = fieldNodeCache.get(id);
        if (cached) return cached;

        const raw = fieldById.get(id);
        if (!raw) return undefined;

        const isButton = (raw as any).button === true;
        const includes = isButton
            ? Object.freeze(new Set(props.includes_for_buttons?.[id] ?? []))
            : emptySet;
        const excludes = isButton
            ? Object.freeze(new Set(props.excludes_for_buttons?.[id] ?? []))
            : emptySet;

        const bindIds = (): readonly string[] => {
            const cachedBind = fieldBindIdsCache.get(id);
            if (cachedBind) return cachedBind;
            const res = Object.freeze(toBindList(raw.bind_id));
            fieldBindIdsCache.set(id, res);
            return res;
        };

        const ancestryFn = makeAncestry(bindIds());

        const node: FieldNode = {
            kind: "field",
            id,
            raw,

            includes,
            excludes,

            ...makeAncestryFns(ancestryFn),

            bindIds,

            ownerTags() {
                const cachedOwners = fieldOwnerTagsCache.get(id);
                if (cachedOwners) return cachedOwners;

                const owners = bindIds()
                    .map((tid) => getTag(tid))
                    .filter(Boolean) as TagNode[];

                const frozen = Object.freeze(owners);
                fieldOwnerTagsCache.set(id, frozen);
                return frozen;
            },

            isBoundTo(tagId) {
                const tid = toId(tagId);
                const lin = lineageIds(tid); // self + ancestors
                for (const b of bindIds()) if (lin.has(b)) return true;
                return false;
            },

            getDescendant(descendantId, context) {
                return this.getDescendants(context).find(item => item.id == descendantId);
            },

            getDescendants(tagId?: string) {
                return resolveDescendants(id, includes, tagId, !isButton);
            },
        };

        fieldNodeCache.set(id, node);
        nodeCache.set(id, node);
        return node;
    };

    const getOption = (id: string): OptionNode | undefined => {
        const cached = optionNodeCache.get(id);
        if (cached) return cached;

        const raw = optionById.get(id);
        const ownerFieldId = optionOwnerFieldId.get(id);
        if (!raw || !ownerFieldId) return undefined;

        const owner = getField(ownerFieldId);
        if (!owner) return undefined;

        const includes = Object.freeze(
            new Set(props.includes_for_buttons?.[id] ?? []),
        );
        const excludes = Object.freeze(
            new Set(props.excludes_for_buttons?.[id] ?? []),
        );

        // option shares ancestry with its owning field
        const node: OptionNode = {
            kind: "option",
            id,
            raw,

            includes,
            excludes,

            ...makeAncestryFns((baseTag) => owner.ancestry(baseTag)),

            field() {
                return owner;
            },

            ownerTags() {
                return owner.ownerTags();
            },

            isBoundTo(tagId) {
                return owner.isBoundTo(tagId);
            },

            getDescendant(descendantId, context) {
                return this.getDescendants(context).find(item => item.id == descendantId);
            },

            getDescendants(tagId?: string) {
                return resolveDescendants(id, includes, tagId);
            },
        };

        optionNodeCache.set(id, node);
        nodeCache.set(id, node);
        return node;
    };

    const getNode = (input: string | Tag | Field | FieldOption): AnyNode => {
        if (typeof input !== "string") {
            if ("bind_id" in input && !("type" in input))
                return getTag(input.id) ?? mkUnknown(input.id);
            if ("type" in input)
                return getField(input.id) ?? mkUnknown(input.id);
            return getOption(input.id) ?? mkUnknown((input as FieldOption).id);
        }

        const cached = nodeCache.get(input);
        if (cached) return cached;

        const id = input;

        if (id.startsWith("t:")) return getTag(id) ?? mkUnknown(id);
        if (id.startsWith("f:")) return getField(id) ?? mkUnknown(id);
        if (id.startsWith("o:")) return getOption(id) ?? mkUnknown(id);

        return getTag(id) ?? getField(id) ?? getOption(id) ?? mkUnknown(id);
    };

    const mkUnknown = (id: string): UnknownNode => {
        const u: UnknownNode = {
            kind: "unknown",
            id,
            includes: emptySet,
            excludes: emptySet,
            ...makeAncestryFns(() => []),
        };
        nodeCache.set(id, u);
        return u;
    };

    return {
        getNode,
        getTag,
        getField,
        getOption,
    };
}
