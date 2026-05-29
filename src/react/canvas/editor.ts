import { cloneDeep } from "lodash-es";
import { Builder, normalise } from "@/core";
import type {
    CatalogId,
    CatalogNode,
    CatalogServiceId,
    CatalogSmartRule,
    Command,
    EditorEvents,
    EditorOptions,
    EditorSnapshot,
    FallbackSettings,
    Field,
    FieldValidationRule,
    RatePolicy,
    ServiceIdRef,
    ServiceCatalogState,
    ServiceProps,
    ServicePropsNotice,
    Tag,
} from "@/schema";
import type { CanvasAPI } from "./api";
import {
    resolveInputDescriptor,
    type Registry,
    type InputVariant,
} from "@/react/inputs/registry";
import type { PolicyDiagnostic } from "@/core/policy";
import type {
    DuplicateOptions,
    DuplicateManyOptions,
    EditorModuleContext,
    FieldRef,
    NodeRef,
    OptionRef,
    QuantityRule,
    ServiceCheck,
    TagRef,
    WireKind,
} from "./editor/editor-types";
import {
    duplicate,
    duplicateMany as duplicateManyNodes,
} from "./editor/editor-duplicate";
import { addNotice, removeNotice, updateNotice } from "./editor/editor-notices";
import {
    addField,
    addOption,
    addTag,
    editLabel,
    editName,
    getNode,
    reLabel,
    remove,
    removeMany as removeManyNodes,
    removeField,
    removeOption,
    removeTag,
    setFieldName,
    setService,
    updateField,
    updateOption,
    updateTag,
} from "./editor/editor-nodes";
import {
    clearConstraint,
    clearConstraintOverride,
    setConstraint,
} from "./editor/editor-constraints";
import {
    clearFieldQuantityRule,
    clearFieldValidation,
    getFieldQuantityRule,
    getFieldValidation,
    setFieldQuantityRule,
    setFieldValidation,
} from "./editor/editor-field-rules";
import {
    deleteOrderKind,
    pruneOrderKind,
    setOrderKind,
} from "./editor/editor-order-kinds";
import {
    connect,
    disconnect,
    exclude,
    include,
    wouldCreateTagCycle,
} from "./editor/editor-relations";
import { filterServicesForVisibleGroup } from "./editor/editor-service-filter";
import { genId, uniqueId, uniqueOptionId } from "./editor/editor-ids";
import { ownerOfOption } from "./editor/editor-utils";
import { placeNode, placeOption } from "./editor/editor-placement";
import {
    addCatalogGroup,
    addSmartCatalogGroup,
    assignServicesToCatalogGroup,
    createEmptyCatalog,
    moveCatalogNode as moveCatalogNodeState,
    removeCatalogNode as removeCatalogNodeState,
    resolveSmartCatalogGroup,
    setActiveCatalogNode as setActiveCatalogNodeState,
    setCatalogExpanded,
    setCatalogViewMode,
    setSelectedCatalogService,
    toggleCatalogExpanded,
    toggleCatalogPinned,
    updateCatalogNode as updateCatalogNodeState,
} from "./editor/editor-catalog";

const MAX_LIMIT = 100;

export type {
    TagRef,
    FieldRef,
    OptionRef,
    NodeRef,
    DuplicateOptions,
    DuplicateManyOptions,
};

export class Editor {
    private readonly builder: Builder;
    private readonly api: CanvasAPI;
    private readonly opts: Required<EditorOptions>;
    private history: EditorSnapshot[] = [];
    private index = -1;
    private txnDepth = 0;
    private txnLabel?: string;
    private stagedBefore?: EditorSnapshot;
    private _lastPolicyDiagnostics?: PolicyDiagnostic[];
    private catalog?: ServiceCatalogState;

    constructor(builder: Builder, api: CanvasAPI, opts: EditorOptions = {}) {
        this.builder = builder;
        this.api = api;
        // @ts-ignore
        this.opts = {
            ...opts,
            historyLimit: Math.max(
                1,
                Math.min(opts.historyLimit ?? MAX_LIMIT, 1000),
            ),
            validateAfterEach: opts.validateAfterEach ?? false,
        };
        this.pushHistory(this.makeSnapshot("init"));
    }

    isTagId(id: string) {
        return this.builder.isTagId(id);
    }

    isFieldId(id: string) {
        return this.builder.isFieldId(id);
    }

    isOptionId(id: string) {
        return this.builder.isOptionId(id);
    }

    getProps(): ServiceProps {
        return this.builder.getProps();
    }

    transact(label: string, fn: () => void): void {
        const wasTop = this.txnDepth === 0;
        let ok = false;
        if (wasTop) {
            this.txnLabel = label;
            this.stagedBefore = this.makeSnapshot(label + ":before");
        }
        this.txnDepth++;
        try {
            fn();
            ok = true;
        } finally {
            this.txnDepth--;
            if (wasTop) {
                if (ok) {
                    this.commit(label);
                } else if (this.stagedBefore) {
                    this.loadSnapshot(this.stagedBefore, "undo");
                }
                this.txnLabel = undefined;
                this.stagedBefore = undefined;
            }
        }
    }

    exec(cmd: Command): void {
        try {
            const before = this.makeSnapshot(cmd.name + ":before");
            cmd.do();
            this.afterMutation(cmd.name, before);
        } catch (err) {
            this.emit("editor:error", {
                message: (err as Error)?.message ?? String(err),
                code: "command",
            });
            throw err;
        }
    }

    undo(): boolean {
        if (this.index <= 0) return false;
        this.index--;
        this.loadSnapshot(this.history[this.index], "undo");
        this.emit("editor:undo", {
            stackSize: this.history.length,
            index: this.index,
        });
        return true;
    }

    redo(): boolean {
        if (this.index >= this.history.length - 1) return false;
        this.index++;
        this.loadSnapshot(this.history[this.index], "redo");
        this.emit("editor:redo", {
            stackSize: this.history.length,
            index: this.index,
        });
        return true;
    }

    clearService(id: string) {
        this.setService(id, { service_id: undefined });
    }

    duplicate(ref: NodeRef, opts: DuplicateOptions = {}): string {
        return duplicate(this.moduleCtx(), ref, opts);
    }

    duplicateMany(
        ids: readonly string[],
        opts: DuplicateManyOptions = {},
    ): string[] {
        return duplicateManyNodes(this.moduleCtx(), ids, opts);
    }

    reLabel(id: string, nextLabel: string): void {
        return reLabel(this.moduleCtx(), id, nextLabel);
    }

    setFieldName(fieldId: string, nextName: string | null | undefined): void {
        return setFieldName(this.moduleCtx(), fieldId, nextName);
    }

    getLastPolicyDiagnostics(): PolicyDiagnostic[] | undefined {
        return this._lastPolicyDiagnostics;
    }

    placeNode(
        id: string,
        opts: {
            scopeTagId?: string;
            beforeId?: string;
            afterId?: string;
            index?: number;
        },
    ) {
        return placeNode(this.moduleCtx(), id, opts);
    }

    placeOption(
        optionId: string,
        opts: { beforeId?: string; afterId?: string; index?: number },
    ) {
        return placeOption(this.moduleCtx(), optionId, opts);
    }

    addOption(
        fieldId: string,
        input: {
            id?: string;
            label: string;
            service_id?: ServiceIdRef;
            pricing_role?: "base" | "utility" | "addon";
            [k: string]: any;
        },
    ): string {
        return addOption(this.moduleCtx(), fieldId, input);
    }

    updateOption(
        optionId: string,
        patch: Partial<
            {
                label: string;
                service_id: ServiceIdRef;
                pricing_role: "base" | "utility" | "addon";
            } & Record<string, any>
        >,
    ) {
        return updateOption(this.moduleCtx(), optionId, patch);
    }

    removeOption(optionId: string) {
        return removeOption(this.moduleCtx(), optionId);
    }

    editLabel(id: string, label: string): void {
        return editLabel(this.moduleCtx(), id, label);
    }

    editName(fieldId: string, name: string | undefined) {
        return editName(this.moduleCtx(), fieldId, name);
    }

    setService(
        id: string,
        input: { service_id?: ServiceIdRef; pricing_role?: "base" | "utility" },
    ): void {
        return setService(this.moduleCtx(), id, input);
    }

    addTag(
        partial: Omit<Tag, "id" | "label"> & { id?: string; label: string },
    ) {
        return addTag(this.moduleCtx(), partial);
    }

    updateTag(id: string, patch: Partial<Tag>) {
        return updateTag(this.moduleCtx(), id, patch);
    }

    removeTag(id: string) {
        return removeTag(this.moduleCtx(), id);
    }

    addNotice(input: Omit<ServicePropsNotice, "id"> & { id?: string }): string {
        return addNotice(this.moduleCtx(), input);
    }

    updateNotice(id: string, patch: Partial<ServicePropsNotice>): void {
        return updateNotice(this.moduleCtx(), id, patch);
    }

    removeNotice(id: string): void {
        return removeNotice(this.moduleCtx(), id);
    }

    addField(
        partial: Omit<Field, "id" | "label" | "type"> & {
            id?: string;
            label: string;
            type: Field["type"];
        },
    ) {
        return addField(this.moduleCtx(), partial);
    }

    addFieldFromDescriptor(
        registry: Registry,
        partial: Omit<Field, "id" | "label" | "type"> & {
            id?: string;
            label: string;
            type: Field["type"];
        },
        opts?: { variant?: InputVariant },
    ): string {
        const variant =
            opts?.variant ??
            (typeof (partial as any)?.meta?.variant === "string"
                ? ((partial as any).meta.variant as InputVariant)
                : undefined);
        const descriptor = resolveInputDescriptor(
            registry,
            String(partial.type),
            variant,
        );

        const nextMeta: Record<string, unknown> = {
            ...(((partial as any).meta as Record<string, unknown>) ?? {}),
        };

        if (descriptor?.multi?.autoEnable === true) {
            nextMeta.multi = true;
        }

        const fieldInput = {
            ...partial,
            ...(Object.keys(nextMeta).length ? { meta: nextMeta } : {}),
        };
        const fieldId = this.addField(fieldInput as any);

        if (descriptor?.options?.autoCreate === true) {
            this.autoCreateOptionsMany([fieldId], () => ({
                label: descriptor.options?.defaultLabel ?? "Option label",
                value: descriptor.options?.defaultValue ?? "option",
            }));
        }

        return fieldId;
    }

    updateField(id: string, patch: Partial<Field>) {
        return updateField(this.moduleCtx(), id, patch);
    }

    removeField(id: string) {
        return removeField(this.moduleCtx(), id);
    }

    remove(id: string) {
        return remove(this.moduleCtx(), id);
    }

    removeMany(ids: readonly string[]) {
        return removeManyNodes(this.moduleCtx(), ids);
    }

    clearServiceMany(ids: readonly string[]): void {
        const ordered = Array.from(new Set((ids ?? []).map((id) => String(id))));
        if (!ordered.length) return;
        this.transact("clearServiceMany", () => {
            this.patchProps((p) => {
                for (const id of ordered) {
                    if (this.isTagId(id)) {
                        const t = (p.filters ?? []).find((x) => x.id === id);
                        if (t && "service_id" in (t as any)) delete (t as any).service_id;
                        continue;
                    }
                    if (this.isFieldId(id)) {
                        const f = (p.fields ?? []).find((x) => x.id === id);
                        if (f && "service_id" in (f as any)) delete (f as any).service_id;
                        continue;
                    }
                    if (this.isOptionId(id)) {
                        const own = ownerOfOption(p, id);
                        if (!own) continue;
                        const f = (p.fields ?? []).find((x) => x.id === own.fieldId);
                        const o = f?.options?.find((x) => x.id === id);
                        if (o && "service_id" in (o as any)) delete (o as any).service_id;
                    }
                }
            });
        });
    }

    rebindMany(
        ids: readonly string[],
        targetTagId: string,
        opts?: { allowTagCycles?: boolean },
    ): void {
        const ordered = Array.from(new Set((ids ?? []).map((id) => String(id))));
        if (!ordered.length) return;
        this.transact("rebindMany", () => {
            this.patchProps((p) => {
                const targetExists = (p.filters ?? []).some((t) => t.id === targetTagId);
                if (!targetExists) return;
                for (const id of ordered) {
                    if (this.isFieldId(id)) {
                        const f = (p.fields ?? []).find((x) => x.id === id);
                        if (!f) continue;
                        f.bind_id = targetTagId;
                        continue;
                    }
                    if (this.isTagId(id)) {
                        const t = (p.filters ?? []).find((x) => x.id === id);
                        if (!t) continue;
                        if (!opts?.allowTagCycles && wouldCreateTagCycle(this.moduleCtx(), p, targetTagId, id)) {
                            continue;
                        }
                        t.bind_id = targetTagId;
                    }
                }
            });
        });
    }

    includeMany(receiverId: string, ids: readonly string[]): void {
        const accepted = Array.from(new Set((ids ?? []).map((id) => String(id))))
            .filter((id) => id !== receiverId)
            .filter((id) => this.getNode(id).data != null);
        if (!accepted.length) return;
        include(this.moduleCtx(), receiverId, accepted);
    }

    excludeMany(receiverId: string, ids: readonly string[]): void {
        const accepted = Array.from(new Set((ids ?? []).map((id) => String(id))))
            .filter((id) => id !== receiverId)
            .filter((id) => this.getNode(id).data != null);
        if (!accepted.length) return;
        exclude(this.moduleCtx(), receiverId, accepted);
    }

    clearRelationsMany(
        ids: readonly string[],
        mode: "owned" | "incoming" | "both" = "both",
    ): void {
        const selected = new Set(Array.from(new Set((ids ?? []).map((id) => String(id)))));
        if (!selected.size) return;
        this.transact("clearRelationsMany", () => {
            this.patchProps((p) => {
                const clearOwned = mode === "owned" || mode === "both";
                const clearIncoming = mode === "incoming" || mode === "both";
                for (const t of p.filters ?? []) {
                    if (clearOwned && selected.has(t.id)) {
                        delete t.includes;
                        delete t.excludes;
                    }
                    if (clearIncoming) {
                        if (t.includes) {
                            t.includes = t.includes.filter((x) => !selected.has(String(x)));
                            if (!t.includes.length) delete t.includes;
                        }
                        if (t.excludes) {
                            t.excludes = t.excludes.filter((x) => !selected.has(String(x)));
                            if (!t.excludes.length) delete t.excludes;
                        }
                    }
                }

                const maps: Array<"includes_for_buttons" | "excludes_for_buttons" | "includes_for_options" | "excludes_for_options"> = [
                    "includes_for_buttons",
                    "excludes_for_buttons",
                    "includes_for_options",
                    "excludes_for_options",
                ];
                for (const k of maps) {
                    const map = (p as any)[k] as Record<string, string[]> | undefined;
                    if (!map) continue;
                    for (const key of Object.keys(map)) {
                        if (clearOwned && selected.has(String(key))) {
                            delete map[key];
                            continue;
                        }
                        if (clearIncoming) {
                            map[key] = (map[key] ?? []).filter((x) => !selected.has(String(x)));
                            if (!map[key]?.length) delete map[key];
                        }
                    }
                    if (!Object.keys(map).length) delete (p as any)[k];
                }
            });
        });
    }

    renameLabelsMany(
        ids: readonly string[],
        input: { prefix?: string; suffix?: string },
    ): void {
        const ordered = Array.from(new Set((ids ?? []).map((id) => String(id))));
        if (!ordered.length) return;
        const prefix = input.prefix ?? "";
        const suffix = input.suffix ?? "";
        this.transact("renameLabelsMany", () => {
            this.patchProps((p) => {
                for (const id of ordered) {
                    if (this.isTagId(id)) {
                        const t = (p.filters ?? []).find((x) => x.id === id);
                        if (t) t.label = `${prefix}${t.label ?? ""}${suffix}`.trim();
                        continue;
                    }
                    if (this.isFieldId(id)) {
                        const f = (p.fields ?? []).find((x) => x.id === id);
                        if (f) f.label = `${prefix}${f.label ?? ""}${suffix}`.trim();
                        continue;
                    }
                    if (this.isOptionId(id)) {
                        const own = ownerOfOption(p, id);
                        if (!own) continue;
                        const f = (p.fields ?? []).find((x) => x.id === own.fieldId);
                        const o = f?.options?.find((x) => x.id === id);
                        if (o) o.label = `${prefix}${o.label ?? ""}${suffix}`.trim();
                    }
                }
            });
        });
    }

    setPricingRoleMany(
        ids: readonly string[],
        role: "base" | "utility",
    ): void {
        const ordered = Array.from(new Set((ids ?? []).map((id) => String(id))));
        if (!ordered.length) return;
        this.transact("setPricingRoleMany", () => {
            for (const id of ordered) {
                if (this.isFieldId(id) || this.isOptionId(id)) {
                    this.setService(id, { pricing_role: role });
                }
            }
        });
    }

    clearFieldDefaultsMany(ids: readonly string[]): void {
        const ordered = Array.from(new Set((ids ?? []).map((id) => String(id))));
        if (!ordered.length) return;
        this.transact("clearFieldDefaultsMany", () => {
            this.patchProps((p) => {
                for (const id of ordered) {
                    if (!this.isFieldId(id)) continue;
                    const f = (p.fields ?? []).find((x) => x.id === id);
                    if (f && "defaults" in (f as any)) delete (f as any).defaults;
                }
            });
        });
    }

    clearFieldValidationMany(ids: readonly string[]): void {
        const ordered = Array.from(new Set((ids ?? []).map((id) => String(id))));
        if (!ordered.length) return;
        this.transact("clearFieldValidationMany", () => {
            this.patchProps((p) => {
                for (const id of ordered) {
                    if (!this.isFieldId(id)) continue;
                    const f = (p.fields ?? []).find((x) => x.id === id);
                    if (f && "validation" in (f as any)) delete (f as any).validation;
                }
            });
        });
    }

    setFieldMulti(fieldId: string, enabled: boolean): void {
        const flag = enabled === true;
        this.transact("setFieldMulti", () => {
            this.patchProps((p) => {
                const f = (p.fields ?? []).find((x) => x.id === fieldId);
                if (!f) return;

                const currentMeta = ((f as any).meta ??
                    {}) as Record<string, unknown>;
                const nextMeta = { ...currentMeta };

                if (flag) {
                    nextMeta.multi = true;
                } else {
                    delete nextMeta.multi;
                }

                if (Object.keys(nextMeta).length === 0) {
                    delete (f as any).meta;
                } else {
                    (f as any).meta = nextMeta;
                }
            });
        });
    }

    autoCreateOptionsMany(
        ids: readonly string[],
        makeOption?: (fieldId: string) => { id?: string; label: string; value?: string | number },
    ): void {
        const ordered = Array.from(new Set((ids ?? []).map((id) => String(id))));
        if (!ordered.length) return;
        this.transact("autoCreateOptionsMany", () => {
            this.patchProps((p) => {
                for (const id of ordered) {
                    if (!this.isFieldId(id)) continue;
                    const f = (p.fields ?? []).find((x) => x.id === id);
                    if (!f) continue;
                    const opts = (f.options ??= []);
                    if (opts.length > 0) continue;
                    const next = makeOption?.(id) ?? { label: "Option label", value: "option" };
                    opts.push({
                        id: next.id ?? this.moduleCtx().genId("o"),
                        label: next.label,
                        value: next.value,
                    } as any);
                }
            });
        });
    }

    clearAllOptionsMany(ids: readonly string[]): void {
        const ordered = Array.from(new Set((ids ?? []).map((id) => String(id))));
        if (!ordered.length) return;
        const optionIds: string[] = [];
        const props = this.getProps();
        for (const id of ordered) {
            if (!this.isFieldId(id)) continue;
            const f = (props.fields ?? []).find((x) => x.id === id);
            for (const o of f?.options ?? []) optionIds.push(o.id);
        }
        if (!optionIds.length) return;
        removeManyNodes(this.moduleCtx(), optionIds);
    }

    removeNoticesForNodes(ids: readonly string[]): void {
        const selected = new Set(Array.from(new Set((ids ?? []).map((id) => String(id)))));
        if (!selected.size) return;
        this.transact("removeNoticesForNodes", () => {
            this.patchProps((p) => {
                if (!p.notices?.length) return;
                p.notices = p.notices.filter((n: any) => {
                    const target = n.target;
                    if (!target || target.scope === "global") return true;
                    if (target.scope === "node") return !selected.has(String(target.node_id));
                    return true;
                });
                if (!p.notices.length) delete p.notices;
            });
        });
    }

    setNoticesVisibilityForNodes(
        ids: readonly string[],
        type: "public" | "private",
    ): void {
        const selected = new Set(Array.from(new Set((ids ?? []).map((id) => String(id)))));
        if (!selected.size) return;
        this.transact("setNoticesVisibilityForNodes", () => {
            this.patchProps((p) => {
                for (const n of p.notices ?? []) {
                    const target: any = n.target;
                    if (target?.scope === "node" && selected.has(String(target.node_id))) {
                        (n as any).type = type;
                    }
                }
            });
        });
    }

    getNode(id: string) {
        return getNode(this.moduleCtx(), id);
    }

    getFieldQuantityRule(id: string): QuantityRule | undefined {
        return getFieldQuantityRule(this.moduleCtx(), id);
    }

    setFieldQuantityRule(id: string, rule: unknown): void {
        return setFieldQuantityRule(this.moduleCtx(), id, rule);
    }

    clearFieldQuantityRule(id: string): void {
        return clearFieldQuantityRule(this.moduleCtx(), id);
    }

    include(receiverId: string, idOrIds: string | string[]) {
        return include(this.moduleCtx(), receiverId, idOrIds);
    }

    exclude(receiverId: string, idOrIds: string | string[]) {
        return exclude(this.moduleCtx(), receiverId, idOrIds);
    }

    connect(kind: WireKind, fromId: string, toId: string): void {
        return connect(this.moduleCtx(), kind, fromId, toId);
    }

    disconnect(kind: WireKind, fromId: string, toId: string): void {
        return disconnect(this.moduleCtx(), kind, fromId, toId);
    }

    setConstraint(tagId: string, flag: string, value: boolean | undefined) {
        return setConstraint(this.moduleCtx(), tagId, flag, value);
    }

    clearConstraintOverride(tagId: string, flag: string) {
        return clearConstraintOverride(this.moduleCtx(), tagId, flag);
    }

    clearConstraint(tagId: string, flag: string) {
        return clearConstraint(this.moduleCtx(), tagId, flag);
    }

    getFieldValidation(id: string): FieldValidationRule[] | undefined {
        return getFieldValidation(this.moduleCtx(), id);
    }

    setFieldValidation(id: string, rules: unknown): void {
        return setFieldValidation(this.moduleCtx(), id, rules);
    }

    clearFieldValidation(id: string): void {
        return clearFieldValidation(this.moduleCtx(), id);
    }

    setOrderKind(nodeId: string, kind: string): void {
        return setOrderKind(this.moduleCtx(), nodeId, kind);
    }

    deleteOrderKind(nodeId: string): void {
        return deleteOrderKind(this.moduleCtx(), nodeId);
    }

    pruneKind(kind: string): number {
        return pruneOrderKind(this.moduleCtx(), kind);
    }

    getCatalog(): ServiceCatalogState | undefined {
        return cloneDeep(this.catalog);
    }

    setCatalog(next?: ServiceCatalogState): void {
        this.replaceCatalog(next, "catalog:set");
    }

    clearCatalog(): void {
        this.replaceCatalog(undefined, "catalog:clear");
    }

    ensureCatalog(): ServiceCatalogState {
        const next = this.catalog
            ? cloneDeep(this.catalog)
            : createEmptyCatalog();
        this.catalog = cloneDeep(next);
        return next;
    }

    createCatalogGroup(input: {
        id?: string;
        label: string;
        parentId?: string;
        description?: string;
        serviceIds?: CatalogServiceId[];
        collapsed?: boolean;
        order?: number;
        color?: string;
        icon?: string;
    }): string {
        const next = addCatalogGroup(this.catalog, input);
        this.replaceCatalog(next, "catalog:create-group");
        return next.activeNodeId!;
    }

    createSmartCatalogGroup(input: {
        id?: string;
        label: string;
        parentId?: string;
        description?: string;
        rules: CatalogSmartRule[];
        match?: "all" | "any";
        collapsed?: boolean;
        order?: number;
        color?: string;
        icon?: string;
    }): string {
        const next = addSmartCatalogGroup(this.catalog, input);
        this.replaceCatalog(next, "catalog:create-smart-group");
        return next.activeNodeId!;
    }

    updateCatalogNode(
        id: CatalogId,
        patch: Partial<Omit<CatalogNode, "id" | "kind">>,
    ): void {
        this.replaceCatalog(
            updateCatalogNodeState(this.catalog, id, patch),
            "catalog:update-node",
        );
    }

    removeCatalogNode(id: CatalogId, opts?: { cascade?: boolean }): void {
        this.replaceCatalog(
            removeCatalogNodeState(this.catalog, id, opts),
            "catalog:remove-node",
        );
    }

    moveCatalogNode(
        nodeId: CatalogId,
        opts: {
            parentId?: CatalogId;
            beforeId?: CatalogId;
            afterId?: CatalogId;
            index?: number;
        },
    ): void {
        this.replaceCatalog(
            moveCatalogNodeState(this.catalog, nodeId, opts),
            "catalog:move-node",
        );
    }

    assignServicesToCatalogGroup(
        nodeId: CatalogId,
        serviceIds: CatalogServiceId[],
        mode: "append" | "replace" | "remove" = "append",
    ): void {
        this.replaceCatalog(
            assignServicesToCatalogGroup(
                this.catalog,
                nodeId,
                serviceIds,
                mode,
            ),
            "catalog:assign-services",
        );
    }

    setActiveCatalogNode(id?: CatalogId): void {
        const next = setActiveCatalogNodeState(this.catalog, id);
        this.catalog = cloneDeep(next);

        this.emit(
            "catalog:active-change" as any,
            {
                activeNodeId: id,
            } as any,
        );

        this.emit(
            "catalog:change" as any,
            {
                catalog: cloneDeep(this.catalog),
                reason: "catalog:set-active",
            } as any,
        );
    }

    setCatalogViewMode(mode: ServiceCatalogState["viewMode"]): void {
        this.replaceCatalog(
            setCatalogViewMode(this.catalog, mode),
            "catalog:set-view-mode",
        );
    }

    setSelectedCatalogService(serviceId?: CatalogServiceId): void {
        this.replaceCatalog(
            setSelectedCatalogService(this.catalog, serviceId),
            "catalog:set-selected-service",
        );
    }

    toggleCatalogExpanded(id: CatalogId): void {
        this.replaceCatalog(
            toggleCatalogExpanded(this.catalog, id),
            "catalog:toggle-expanded",
        );
    }

    setCatalogExpanded(id: CatalogId, expanded: boolean): void {
        this.replaceCatalog(
            setCatalogExpanded(this.catalog, id, expanded),
            "catalog:set-expanded",
        );
    }

    toggleCatalogPinned(id: CatalogId): void {
        this.replaceCatalog(
            toggleCatalogPinned(this.catalog, id),
            "catalog:toggle-pinned",
        );
    }

    resolveSmartCatalogGroup(
        nodeId: CatalogId,
        candidates: CatalogServiceId[],
        matchers: {
            serviceField?: (
                candidate: CatalogServiceId,
                rule: Extract<CatalogSmartRule, { type: "service-field" }>,
            ) => boolean;
            policyFamily?: (
                candidate: CatalogServiceId,
                rule: Extract<CatalogSmartRule, { type: "policy-family" }>,
            ) => boolean;
            compatibility?: (
                candidate: CatalogServiceId,
                rule: Extract<CatalogSmartRule, { type: "compatibility" }>,
            ) => boolean;
        },
    ): CatalogServiceId[] {
        const next = resolveSmartCatalogGroup(
            this.catalog,
            nodeId,
            candidates,
            matchers,
        );

        this.replaceCatalog(next, "catalog:resolve-smart-group");

        const node = next?.nodes.find(
            (x) => x.id === nodeId && x.kind === "smart-group",
        ) as Extract<CatalogNode, { kind: "smart-group" }> | undefined;

        return node?.resolvedServiceIds?.slice() ?? [];
    }

    private replaceCatalog(
        next: ServiceCatalogState | undefined,
        reason = "catalog:set",
    ) {
        this.catalog = cloneDeep(next);
        this.emit(
            "catalog:change" as any,
            {
                catalog: cloneDeep(this.catalog),
                snapshot: this.makeSnapshot(reason),
                reason,
            } as any,
        );
    }
    private replaceProps(next: ServiceProps): void {
        const norm = normalise(next, {
            constraints: this.builder
                .getConstraints()
                .map((item) => item.label),
            defaultPricingRole: "base",
        });
        this.builder.load(norm);
        this.api.refreshGraph();
    }

    private patchProps(mut: (p: ServiceProps) => void): void {
        const cur = cloneDeep(this.builder.getProps());
        mut(cur);
        this.replaceProps(cur);
    }

    private afterMutation(command: string, _before: EditorSnapshot) {
        if (this.txnDepth > 0) return;
        const snap = this.makeSnapshot(command);
        this.pushHistory(snap);
        this.emit("editor:command", { name: command });
        if (this.opts.validateAfterEach) {
            this.emit("editor:change", {
                props: snap.props,
                reason: "validate",
                command,
                snapshot: snap,
            });
        } else {
            this.emit("editor:change", {
                props: snap.props,
                reason: "mutation",
                command,
                snapshot: snap,
            });
        }
    }

    private commit(label: string) {
        const snap = this.makeSnapshot(label);
        this.pushHistory(snap);
        this.emit("editor:change", {
            props: snap.props,
            reason: "transaction",
            command: this.txnLabel,
            snapshot: snap,
        });
    }

    private makeSnapshot(_why: string): EditorSnapshot {
        const props = cloneDeep(this.builder.getProps());
        const canvas = this.api.snapshot();
        return {
            props,
            layout: {
                canvas,
            },
            catalog: cloneDeep(this.catalog),
        };
    }

    private loadSnapshot(s: EditorSnapshot, reason: "undo" | "redo") {
        this.builder.load(cloneDeep(s.props));

        const layout = s.layout;
        const canvas = layout?.canvas;

        if (canvas) {
            if (canvas.positions) this.api.setPositions(canvas.positions);
            if (canvas.viewport) this.api.setViewport(canvas.viewport);
            if (canvas.selection) {
                this.api.select(
                    Array.isArray(canvas.selection)
                        ? canvas.selection
                        : Array.from(canvas.selection),
                );
            }
        }
        this.api.refreshGraph();
        this.emit("editor:change", { props: s.props, reason, snapshot: s });
    }

    private pushHistory(snap: EditorSnapshot) {
        if (this.index < this.history.length - 1) {
            this.history = this.history.slice(0, this.index + 1);
        }
        this.history.push(snap);
        const over = this.history.length - this.opts.historyLimit;
        if (over > 0) {
            this.history.splice(0, over);
            this.index = this.history.length - 1;
        } else {
            this.index = this.history.length - 1;
        }
    }

    private emit<K extends keyof (EditorEvents & any)>(
        event: K,
        payload: (EditorEvents & any)[K],
    ) {
        this.api.emit(event as any, payload as any);
    }

    public filterServicesForVisibleGroup(
        candidates: Array<number | string>,
        ctx: {
            tagId: string;
            selectedButtons?: string[];
            usedServiceIds: Array<number | string>;
            effectiveConstraints?: Partial<
                Record<"refill" | "cancel" | "dripfeed", boolean>
            >;
            policies?: unknown;
            ratePolicy?: RatePolicy;
            fallbackSettings?: FallbackSettings;
            /** Backward-compatible alias */
            fallback?: FallbackSettings;
            rateContext?:
                | {
                      mode: "context";
                  }
                | {
                      mode: "custom_primary_rate";
                      source: "manual" | "service";
                      primaryRate?: number;
                      primaryServiceId?: number | string;
                  };
        },
    ): ServiceCheck[] {
        return filterServicesForVisibleGroup(this.moduleCtx(), candidates, ctx);
    }

    private moduleCtx(): EditorModuleContext {
        return {
            builder: this.builder,
            api: this.api,
            opts: this.opts,
            getProps: () => this.builder.getProps(),
            isTagId: (id) => this.isTagId(id),
            isFieldId: (id) => this.isFieldId(id),
            isOptionId: (id) => this.isOptionId(id),
            transact: (label, fn) => this.transact(label, fn),
            exec: (cmd) => this.exec(cmd),
            undo: () => this.undo(),
            patchProps: (mut) => this.patchProps(mut),
            replaceProps: (next) => this.replaceProps(next),
            emit: (event, payload) => this.emit(event, payload),
            makeSnapshot: (why) => this.makeSnapshot(why),
            loadSnapshot: (s, reason) => this.loadSnapshot(s, reason),
            getNode: (id) => getNode(this.moduleCtx(), id),
            uniqueId: (base) => uniqueId(this.moduleCtx(), base),
            uniqueOptionId: (fieldId, base) =>
                uniqueOptionId(this.moduleCtx(), fieldId, base),
            genId: (prefix) => genId(this.moduleCtx(), prefix as any),
            setLastPolicyDiagnostics: (value) => {
                this._lastPolicyDiagnostics = value;
            },
        };
    }
}
