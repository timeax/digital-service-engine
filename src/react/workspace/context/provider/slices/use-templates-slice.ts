// src/react/workspace/context/provider/slices/use-templates-slice.ts
import * as React from "react";
import type {
    BackendError,
    BackendResult,
    FieldTemplate,
    TemplateCreateInput,
    TemplatesListParams,
    TemplateUpdatePatch,
    WorkspaceBackend,
} from "../../backend";
import type { Loadable, WorkspaceAPI } from "@/react/workspace";
import type { BackendRuntime } from "../runtime/use-backend-runtime";

export interface TemplatesSliceApi {
    readonly templates: Loadable<readonly FieldTemplate[]>;

    readonly refreshTemplates: (
        params?: Partial<Pick<TemplatesListParams, "branchId" | "since">>,
    ) => Promise<BackendResult<readonly FieldTemplate[]>>;

    readonly createTemplate: WorkspaceAPI["createTemplate"];
    readonly updateTemplate: WorkspaceAPI["updateTemplate"];
    readonly cloneTemplate: WorkspaceAPI["cloneTemplate"];
    readonly publishTemplate: WorkspaceAPI["publishTemplate"];
    readonly unpublishTemplate: WorkspaceAPI["unpublishTemplate"];
    readonly deleteTemplate: WorkspaceAPI["deleteTemplate"];

    readonly invalidateTemplates: () => void;

    /** internal setters for branch-cache composition */
    readonly __setTemplatesState: React.Dispatch<
        React.SetStateAction<Loadable<readonly FieldTemplate[]>>
    >;

    readonly resetTemplatesForBranch: () => void;
}

function setLoadableError<T>(
    updater: React.Dispatch<React.SetStateAction<Loadable<T>>>,
    error: BackendError,
): void {
    updater((s) => ({ ...s, loading: false, error }));
}

export interface UseTemplatesSliceParams {
    readonly backend: WorkspaceBackend;
    readonly workspaceId: string;

    readonly getCurrentBranchId: () => string | undefined;

    readonly initialTemplates?: readonly FieldTemplate[] | null;

    readonly runtime: BackendRuntime;
}

function parseTimestamp(
    value?: string | number | null,
): number | undefined {
    if (value === undefined || value === null) return undefined;

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function templateTime(template: FieldTemplate): number | undefined {
    return (
        parseTimestamp(template.updatedAt) ?? parseTimestamp(template.createdAt)
    );
}

function shouldReplaceTemplates(params: {
    requestedSince?: string | number;
    lastUpdatedAt?: string | number;
}): boolean {
    if (!params.requestedSince) return true;
    if (!params.lastUpdatedAt) return false;

    const requested = parseTimestamp(params.requestedSince);
    const last = parseTimestamp(params.lastUpdatedAt);

    if (requested === undefined || last === undefined) {
        return false;
    }

    return requested < last;
}

function pickNewestTemplate(
    current: FieldTemplate,
    incoming: FieldTemplate,
): FieldTemplate {
    const currentTime = templateTime(current);
    const incomingTime = templateTime(incoming);

    if (currentTime !== undefined && incomingTime !== undefined) {
        return incomingTime >= currentTime ? incoming : current;
    }

    if (currentTime === undefined && incomingTime !== undefined) return incoming;
    if (currentTime !== undefined && incomingTime === undefined) return current;

    return incoming;
}

function mergeTemplates(
    current: readonly FieldTemplate[] | null | undefined,
    incoming: readonly FieldTemplate[],
    opts?: {
        since?: string | number;
        deletedIds?: readonly string[];
        reconcileMissingSince?: boolean;
    },
): readonly FieldTemplate[] {
    const sinceTime = parseTimestamp(opts?.since);
    const incomingIds = new Set(incoming.map((template) => template.id));
    const deletedIds = new Set(opts?.deletedIds ?? []);

    const byId = new Map<string, FieldTemplate>();

    for (const template of current ?? []) {
        if (deletedIds.has(template.id)) continue;

        const updatedTime = templateTime(template);

        const shouldHaveAppearedInDelta =
            opts?.reconcileMissingSince === true &&
            sinceTime !== undefined &&
            updatedTime !== undefined &&
            updatedTime > sinceTime;

        const missingFromDelta =
            shouldHaveAppearedInDelta && !incomingIds.has(template.id);

        if (!missingFromDelta) {
            byId.set(template.id, template);
        }
    }

    for (const template of incoming) {
        if (deletedIds.has(template.id)) continue;

        const existing = byId.get(template.id);

        byId.set(
            template.id,
            existing ? pickNewestTemplate(existing, template) : template,
        );
    }

    return Array.from(byId.values()).sort((a, b) => {
        const aTime = templateTime(a);
        const bTime = templateTime(b);

        if (aTime !== undefined && bTime !== undefined && aTime !== bTime) {
            return bTime - aTime;
        }

        return a.name.localeCompare(b.name);
    });
}
export function useTemplatesSlice(
    params: UseTemplatesSliceParams,
): TemplatesSliceApi {
    const {
        backend,
        workspaceId,
        getCurrentBranchId,
        initialTemplates,
        runtime,
    } = params;

    const [templates, setTemplates] = React.useState<
        Loadable<readonly FieldTemplate[]>
    >({
        data: initialTemplates ?? null,
        loading: false,
        updatedAt: initialTemplates ? runtime.now() : undefined,
    });

    const refreshTemplates = React.useCallback(
        async (
            params?: Partial<Pick<TemplatesListParams, "branchId" | "since">>,
        ): Promise<BackendResult<readonly FieldTemplate[]>> => {
            const branchId: string | undefined =
                params?.branchId ?? getCurrentBranchId();
            if (!branchId) {
                return {
                    ok: false,
                    error: {
                        code: "no_branch",
                        message: "No current branch to load templates for.",
                    },
                };
            }

            setTemplates((s) => ({ ...s, loading: true }));

            const requestedSince = params?.since ?? templates.updatedAt;

            const res = await backend.templates.refresh({
                workspaceId,
                branchId,
                since: requestedSince,
            });

            if (res.ok) {
                setTemplates((current) => {
                    const replace = shouldReplaceTemplates({
                        requestedSince,
                        lastUpdatedAt: current.updatedAt,
                    });

                    return {
                        data: replace
                            ? res.value
                            : mergeTemplates(current.data, res.value, {
                                  since: requestedSince,
                                  reconcileMissingSince: false,
                              }),
                        loading: false,
                        updatedAt: runtime.now(),
                    };
                });

                return res;
            } else {
                setLoadableError(setTemplates, res.error);
                return res;
            }
        },
        [
            backend.templates,
            workspaceId,
            getCurrentBranchId,
            templates.updatedAt,
            runtime,
        ],
    );

    const createTemplate = React.useCallback<WorkspaceAPI["createTemplate"]>(
        async (input: TemplateCreateInput) => {
            const res = await backend.templates.create(workspaceId, {
                ...input,
                branchId:
                    input.branchId !== null
                        ? input.branchId
                        : getCurrentBranchId(),
            });

            if (res.ok) {
                await refreshTemplates({
                    branchId: res.value.branchId ?? getCurrentBranchId(),
                });
            }

            return res;
        },
        [backend.templates, workspaceId, getCurrentBranchId, refreshTemplates],
    );

    const updateTemplate = React.useCallback<WorkspaceAPI["updateTemplate"]>(
        async (id: string, patch: TemplateUpdatePatch) => {
            const res = await backend.templates.update(id, patch);

            if (res.ok) {
                await refreshTemplates({
                    branchId: res.value.branchId ?? getCurrentBranchId(),
                });
            }

            return res;
        },
        [backend.templates, getCurrentBranchId, refreshTemplates],
    );

    const cloneTemplate = React.useCallback<WorkspaceAPI["cloneTemplate"]>(
        async (source, opts) => {
            const res = await backend.templates.clone(
                source,
                opts ?? { branchId: getCurrentBranchId() ?? undefined },
            );

            if (res.ok) {
                await refreshTemplates({
                    branchId: res.value.branchId ?? getCurrentBranchId(),
                });
            }

            return res;
        },
        [backend.templates, getCurrentBranchId, refreshTemplates],
    );

    const publishTemplate = React.useCallback<WorkspaceAPI["publishTemplate"]>(
        async (id: string) => {
            const res = await backend.templates.publish(id);
            if (res.ok) {
                await refreshTemplates({ branchId: getCurrentBranchId() });
            }
            return res;
        },
        [backend.templates, getCurrentBranchId, refreshTemplates],
    );

    const unpublishTemplate = React.useCallback<
        WorkspaceAPI["unpublishTemplate"]
    >(
        async (id: string) => {
            const res = await backend.templates.unpublish(id);
            if (res.ok) {
                await refreshTemplates({ branchId: getCurrentBranchId() });
            }
            return res;
        },
        [backend.templates, getCurrentBranchId, refreshTemplates],
    );

    const deleteTemplate = React.useCallback<WorkspaceAPI["deleteTemplate"]>(
        async (id: string) => {
            const res = await backend.templates.delete(id);
            if (res.ok) {
                const deleteRefreshSince = runtime.now();
                setTemplates((current) => ({
                    ...current,
                    data:
                        current.data?.filter((template) => template.id !== id) ??
                        current.data,
                    updatedAt: deleteRefreshSince,
                }));
                await refreshTemplates({
                    branchId: getCurrentBranchId(),
                    since: deleteRefreshSince,
                });
            }
            return res;
        },
        [backend.templates, getCurrentBranchId, refreshTemplates, runtime],
    );

    const invalidateTemplates = React.useCallback((): void => {
        setTemplates((s) => ({ ...s, updatedAt: undefined }));
    }, []);

    const resetTemplatesForBranch = React.useCallback((): void => {
        setTemplates((s) => ({ ...s, data: null, error: undefined }));
    }, []);

    return React.useMemo<TemplatesSliceApi>(
        () => ({
            templates,
            refreshTemplates,
            createTemplate,
            updateTemplate,
            cloneTemplate,
            publishTemplate,
            unpublishTemplate,
            deleteTemplate,
            invalidateTemplates,
            __setTemplatesState: setTemplates,
            resetTemplatesForBranch,
        }),
        [
            templates,
            refreshTemplates,
            createTemplate,
            updateTemplate,
            cloneTemplate,
            publishTemplate,
            unpublishTemplate,
            deleteTemplate,
            invalidateTemplates,
            resetTemplatesForBranch,
        ],
    );
}

export const __templatesSliceInternals = {
    parseTimestamp,
    templateTime,
    shouldReplaceTemplates,
    pickNewestTemplate,
    mergeTemplates,
};
