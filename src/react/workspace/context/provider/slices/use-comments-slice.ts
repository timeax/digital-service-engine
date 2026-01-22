// src/react/workspace/context/provider/slices/use-comments-slice.ts

import * as React from "react";

import type {
    BackendError,
    BackendScope,
    Result,
    WorkspaceBackend,
} from "../../backend";
import type { Loadable } from "@/react/workspace";

import type {
    CommentAnchor,
    CommentMessage,
    CommentThread,
} from "@/schema/comments";

export interface CommentsSliceApi {
    readonly threads: Loadable<readonly CommentThread[]>;

    readonly refreshThreads: (
        params?: Readonly<{ branchId?: string }>,
    ) => Promise<void>;

    readonly createThread: (
        input: Readonly<{
            anchor: CommentAnchor;
            body: string;
            meta?: Readonly<Record<string, unknown>>;
            branchId?: string;
        }>,
    ) => Result<CommentThread>;

    readonly addMessage: (
        input: Readonly<{
            threadId: string;
            body: string;
            meta?: Readonly<Record<string, unknown>>;
            branchId?: string;
        }>,
    ) => Result<CommentMessage>;

    readonly editMessage: (
        input: Readonly<{
            threadId: string;
            messageId: string;
            body: string;
            branchId?: string;
        }>,
    ) => Result<CommentMessage>;

    readonly deleteMessage: (
        input: Readonly<{
            threadId: string;
            messageId: string;
            branchId?: string;
        }>,
    ) => Result<void>;

    readonly moveThread: (
        input: Readonly<{
            threadId: string;
            anchor: CommentAnchor;
            branchId?: string;
        }>,
    ) => Result<CommentThread>;

    readonly resolveThread: (
        input: Readonly<{
            threadId: string;
            resolved: boolean;
            branchId?: string;
        }>,
    ) => Result<CommentThread>;

    readonly deleteThread: (
        input: Readonly<{
            threadId: string;
            branchId?: string;
        }>,
    ) => Result<void>;
}

export interface UseCommentsSliceParams {
    readonly actorId: string;
    readonly workspaceId: string;

    /** backend.comments */
    readonly backend: WorkspaceBackend["comments"];

    /** Current branch resolver (provider owns currentId) */
    readonly getCurrentBranchId: () => string | undefined;

    /** Optional initial preload */
    readonly initialThreads?: readonly CommentThread[] | null;
}

function missingScopeError<T>(): Result<T> {
    return Promise.resolve({
        ok: false,
        error: {
            code: "missing_scope",
            message:
                "Workspace comments require workspaceId, actorId, and branchId.",
        },
    });
}

function setLoadableError<T>(
    set: React.Dispatch<React.SetStateAction<Loadable<T>>>,
    err: BackendError,
): void {
    set((s: Loadable<T>) => ({ ...s, loading: false, error: err }));
}

export function useCommentsSlice(
    params: UseCommentsSliceParams,
): CommentsSliceApi {
    const {
        backend,
        workspaceId,
        actorId,
        getCurrentBranchId,
        initialThreads,
    } = params;

    const now = (): number => Date.now();

    const [threads, setThreads] = React.useState<
        Loadable<readonly CommentThread[]>
    >({
        data: initialThreads ?? null,
        loading: false,
        updatedAt: initialThreads ? now() : undefined,
    });

    const resolveScope = React.useCallback(
        (branchId?: string): BackendScope | null => {
            const bid: string | undefined = branchId ?? getCurrentBranchId();
            if (!workspaceId || !actorId || !bid) return null;
            return { workspaceId, actorId, branchId: bid };
        },
        [workspaceId, actorId, getCurrentBranchId],
    );

    const refreshThreads = React.useCallback(
        async (p?: Readonly<{ branchId?: string }>): Promise<void> => {
            const scope: BackendScope | null = resolveScope(p?.branchId);
            if (!scope) return;

            setThreads((s) => ({ ...s, loading: true }));
            const res = await backend.listThreads(scope);

            if (res.ok) {
                setThreads({
                    data: res.value as readonly CommentThread[],
                    loading: false,
                    updatedAt: now(),
                });
            } else {
                setLoadableError(setThreads, res.error);
            }
        },
        [backend, resolveScope],
    );

    const createThread = React.useCallback(
        async (
            input: Readonly<{
                anchor: CommentAnchor;
                body: string;
                meta?: Readonly<Record<string, unknown>>;
                branchId?: string;
            }>,
        ): Result<CommentThread> => {
            const scope: BackendScope | null = resolveScope(input.branchId);
            if (!scope) return missingScopeError<CommentThread>();

            const res = await backend.createThread(scope, {
                anchor: input.anchor,
                body: input.body,
                meta: input.meta ? { ...input.meta } : undefined,
            });

            if (res.ok) {
                setThreads((s) => {
                    const prev: readonly CommentThread[] = s.data ?? [];
                    return {
                        ...s,
                        data: [res.value as CommentThread, ...prev],
                        loading: false,
                        updatedAt: now(),
                    };
                });
            }

            return res as unknown as Result<CommentThread>;
        },
        [backend, resolveScope],
    );

    const addMessage = React.useCallback(
        async (
            input: Readonly<{
                threadId: string;
                body: string;
                meta?: Readonly<Record<string, unknown>>;
                branchId?: string;
            }>,
        ): Result<CommentMessage> => {
            const scope: BackendScope | null = resolveScope(input.branchId);
            if (!scope) return missingScopeError<CommentMessage>();

            const res = await backend.addMessage(scope, {
                threadId: input.threadId,
                body: input.body,
                meta: input.meta ? { ...input.meta } : undefined,
            });

            if (res.ok) {
                const msg: CommentMessage = res.value as CommentMessage;

                setThreads((s) => {
                    if (!s.data) return s;

                    const next: readonly CommentThread[] = s.data.map((t) => {
                        if (t.id !== input.threadId) return t;
                        const msgs: readonly CommentMessage[] = (t.messages ??
                            []) as readonly CommentMessage[];
                        return { ...t, messages: [...msgs, msg] };
                    });

                    return { ...s, data: next, updatedAt: now() };
                });
            }

            return res as unknown as Result<CommentMessage>;
        },
        [backend, resolveScope],
    );

    const editMessage = React.useCallback(
        async (
            input: Readonly<{
                threadId: string;
                messageId: string;
                body: string;
                branchId?: string;
            }>,
        ): Result<CommentMessage> => {
            const scope: BackendScope | null = resolveScope(input.branchId);
            if (!scope) return missingScopeError<CommentMessage>();

            const res = await backend.editMessage(scope, {
                threadId: input.threadId,
                messageId: input.messageId,
                body: input.body,
            });

            if (res.ok) {
                const msg: CommentMessage = res.value as CommentMessage;

                setThreads((s) => {
                    if (!s.data) return s;
                    const next: readonly CommentThread[] = s.data.map((t) => {
                        if (t.id !== input.threadId) return t;
                        const msgs: readonly CommentMessage[] = (t.messages ??
                            []) as readonly CommentMessage[];
                        const updated: readonly CommentMessage[] = msgs.map(
                            (m) => (m.id === input.messageId ? msg : m),
                        );
                        return { ...t, messages: updated } as CommentThread;
                    });

                    return { ...s, data: next, updatedAt: now() };
                });
            }

            return res as unknown as Result<CommentMessage>;
        },
        [backend, resolveScope],
    );

    const deleteMessage = React.useCallback(
        async (
            input: Readonly<{
                threadId: string;
                messageId: string;
                branchId?: string;
            }>,
        ): Result<void> => {
            const scope: BackendScope | null = resolveScope(input.branchId);
            if (!scope) return missingScopeError<void>();

            const res = await backend.deleteMessage(scope, {
                threadId: input.threadId,
                messageId: input.messageId,
            });

            if (res.ok) {
                setThreads((s) => {
                    if (!s.data) return s;

                    const next: readonly CommentThread[] = s.data.map((t) => {
                        if (t.id !== input.threadId) return t;
                        const msgs: readonly CommentMessage[] = (t.messages ??
                            []) as readonly CommentMessage[];
                        return {
                            ...t,
                            messages: msgs.filter(
                                (m) => m.id !== input.messageId,
                            ),
                        };
                    });

                    return { ...s, data: next, updatedAt: now() };
                });
            }

            return res as unknown as Result<void>;
        },
        [backend, resolveScope],
    );

    const updateThread = React.useCallback((thread: CommentThread) => {
        setThreads((s) => {
            if (!s.data) return s;
            return {
                ...s,
                data: s.data.map((t) => (t.id === thread.id ? thread : t)),
                updatedAt: now(),
            };
        });
    }, []);

    const moveThread = React.useCallback(
        async (
            input: Readonly<{
                threadId: string;
                anchor: CommentAnchor;
                branchId?: string;
            }>,
        ): Result<CommentThread> => {
            const scope: BackendScope | null = resolveScope(input.branchId);
            if (!scope) return missingScopeError<CommentThread>();

            const res = await backend.moveThread(scope, {
                threadId: input.threadId,
                anchor: input.anchor,
            });

            if (res.ok) {
                updateThread(res.value as CommentThread);
            }

            return res as unknown as Result<CommentThread>;
        },
        [backend, resolveScope, updateThread],
    );

    const resolveThread = React.useCallback(
        async (
            input: Readonly<{
                threadId: string;
                resolved: boolean;
                branchId?: string;
            }>,
        ): Result<CommentThread> => {
            const scope: BackendScope | null = resolveScope(input.branchId);
            if (!scope) return missingScopeError<CommentThread>();

            const res = await backend.resolveThread(scope, {
                threadId: input.threadId,
                resolved: input.resolved,
            });

            if (res.ok) {
                updateThread(res.value as CommentThread);
            }

            return res as unknown as Result<CommentThread>;
        },
        [backend, resolveScope, updateThread],
    );

    const deleteThread = React.useCallback(
        async (
            input: Readonly<{
                threadId: string;
                branchId?: string;
            }>,
        ): Result<void> => {
            const scope: BackendScope | null = resolveScope(input.branchId);
            if (!scope) return missingScopeError<void>();

            const res = await backend.deleteThread(scope, {
                threadId: input.threadId,
            });

            if (res.ok) {
                setThreads((s) => {
                    if (!s.data) return s;
                    return {
                        ...s,
                        data: s.data.filter((t) => t.id !== input.threadId),
                        updatedAt: now(),
                    };
                });
            }

            return res as unknown as Result<void>;
        },
        [backend, resolveScope],
    );

    return React.useMemo(
        () => ({
            threads,
            refreshThreads,
            createThread,
            addMessage,
            editMessage,
            deleteMessage,
            moveThread,
            resolveThread,
            deleteThread,
        }),
        [
            threads,
            refreshThreads,
            createThread,
            addMessage,
            editMessage,
            deleteMessage,
            moveThread,
            resolveThread,
            deleteThread,
        ],
    );
}
