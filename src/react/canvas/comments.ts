// src/react/canvas/comments.ts
import type { EventBus } from "@/react";
import type { CanvasEvents } from "@/schema/canvas-types";
import type {
    CommentsBackend,
    BackendError,
    BackendScope,
} from "../workspace/context/backend";
import {
    RetryQueue,
    type RetryOptions as RetryOpts,
} from "../../utils/retry-queue";
import {
    CommentAnchor,
    CommentId,
    CommentMessage,
    CommentThread,
    ThreadId,
} from "@/schema/comments";

let __seq = 0;
const newLocalId = (p = "loc"): string =>
    `${p}_${Date.now().toString(36)}_${(++__seq).toString(36)}`;

type SyncState = "pending" | "synced" | "error";
type SyncThread = CommentThread & { _sync?: SyncState };

type CommentsDeps = {
    backend?: CommentsBackend<CommentThread, CommentMessage, CommentAnchor>;
    getScope?: () => BackendScope | undefined;
    retry?: RetryOpts;
};

export class CommentsAPI {
    private threads = new Map<ThreadId, SyncThread>();
    private bus: EventBus<CanvasEvents>;
    private deps: CommentsDeps;
    private retry: RetryQueue;

    constructor(bus: EventBus<CanvasEvents>, deps: CommentsDeps = {}) {
        this.bus = bus;
        this.deps = deps;
        this.retry = new RetryQueue(deps.retry);
    }

    private scope(): BackendScope | undefined {
        return this.deps.getScope?.();
    }

    private emitSync(
        op: CanvasEvents["comment:sync"]["op"],
        threadId: string,
        messageId: string | undefined,
        status: CanvasEvents["comment:sync"]["status"],
        meta: {
            attempt: number;
            nextDelayMs?: number;
            error?: BackendError | unknown;
        },
    ): void {
        this.bus.emit("comment:sync", {
            op,
            threadId,
            messageId,
            status,
            attempt: meta.attempt,
            nextDelayMs: meta.nextDelayMs,
            error: meta.error,
        });
    }

    /* ─── Persistence bridge ───────────────────────────── */

    async loadAll(): Promise<void> {
        if (!this.deps.backend) return;

        const scope = this.scope();
        if (!scope) return;

        const res = await this.deps.backend.listThreads(scope);

        if (!res.ok) {
            this.bus.emit("error", {
                message: res.error.message,
                code: res.error.code,
                meta: res.error.meta,
            });
            return;
        }

        this.threads.clear();
        for (const th of res.value) {
            this.threads.set(th.id, { ...(th as CommentThread), _sync: "synced" });
        }

        // signal refresh (kept as-is)
        this.bus.emit("comment:thread:update", { thread: undefined as any });
    }

    /* ─── Query ─────────────────────────────────────────── */

    list(): CommentThread[] {
        return Array.from(this.threads.values())
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((t) => t as CommentThread);
    }

    get(id: ThreadId): CommentThread | undefined {
        return this.threads.get(id) as CommentThread | undefined;
    }

    /* ─── Mutations (optimistic if backend present) ─────── */

    async create(
        anchor: CommentAnchor,
        initialBody: string,
        meta?: Record<string, unknown>,
    ): Promise<ThreadId> {
        const now = Date.now();
        const localId = newLocalId("t");
        const msgId = newLocalId("m");

        const hasBackend = Boolean(this.deps.backend && this.scope());

        const local: SyncThread = {
            id: localId,
            anchor,
            resolved: false,
            createdAt: now,
            updatedAt: now,
            messages: [{ id: msgId, body: initialBody, createdAt: now }],
            meta,
            _sync: hasBackend ? "pending" : "synced",
        };

        this.threads.set(localId, local);
        this.bus.emit("comment:thread:create", { thread: local as any });

        if (!this.deps.backend) return localId;

        const performOnce = async (): Promise<ThreadId> => {
            const scope = this.scope();
            if (!scope) return localId;

            const res = await this.deps.backend!.createThread(scope, {
                anchor,
                body: initialBody,
                meta,
            });

            if (!res.ok) throw res.error;

            // Swap local→server on success (kept behavior)
            this.threads.delete(localId);

            const serverTh: SyncThread = {
                ...(res.value as CommentThread),
                _sync: "synced",
            };

            this.threads.set(serverTh.id, serverTh);
            this.bus.emit("comment:thread:update", { thread: serverTh as any });

            return serverTh.id;
        };

        try {
            const serverId = await performOnce();
            return serverId;
        } catch (err) {
            const scope = this.scope();
            const branchKey = scope?.branchId ?? "no_branch";
            const jobId = `comments:create_thread:${branchKey}:${localId}`;

            this.retry.enqueue({
                id: jobId,
                perform: async () => {
                    try {
                        await performOnce();
                        return true;
                    } catch {
                        return false;
                    }
                },
                onStatus: (status, meta2) =>
                    this.emitSync(
                        "create_thread",
                        localId,
                        undefined,
                        status,
                        meta2 ?? { attempt: 0 },
                    ),
            });

            local._sync = "error";
            this.bus.emit("error", {
                message: (err as BackendError)?.message ?? "Create failed",
                code: (err as BackendError)?.code,
                meta: err,
            });
            this.bus.emit("comment:thread:update", { thread: local as any });

            return localId;
        }
    }

    async reply(
        threadId: ThreadId,
        body: string,
        meta?: Record<string, unknown>,
    ): Promise<CommentId> {
        const th = this.ensure(threadId);
        const now = Date.now();
        const localMid = newLocalId("m");

        const hasBackend = Boolean(this.deps.backend && this.scope());

        const localMsg: CommentMessage = {
            id: localMid,
            body,
            createdAt: now,
            meta,
        };

        th.messages.push(localMsg);
        th.updatedAt = now;
        th._sync ??= hasBackend ? "pending" : "synced";

        this.bus.emit("comment:message:create", {
            threadId,
            message: localMsg as any,
        });
        this.bus.emit("comment:thread:update", { thread: th as any });

        if (!this.deps.backend) return localMid;

        const performOnce = async (): Promise<CommentId> => {
            const scope = this.scope();
            if (!scope) return localMid;

            const res = await this.deps.backend!.addMessage(scope, {
                threadId: th.id,
                body,
                meta,
            });

            if (!res.ok) throw res.error;

            const serverMsg = res.value as CommentMessage;
            const idx = th.messages.findIndex((m) => m.id === localMid);
            if (idx >= 0) th.messages[idx] = serverMsg;

            th._sync = "synced";
            this.bus.emit("comment:thread:update", { thread: th as any });

            return serverMsg.id;
        };

        try {
            const serverMid = await performOnce();
            return serverMid;
        } catch (err) {
            const scope = this.scope();
            const branchKey = scope?.branchId ?? "no_branch";
            const jobId = `comments:add_message:${branchKey}:${threadId}:${localMid}`;

            this.retry.enqueue({
                id: jobId,
                perform: async () => {
                    try {
                        await performOnce();
                        return true;
                    } catch {
                        return false;
                    }
                },
                onStatus: (status, meta2) =>
                    this.emitSync(
                        "add_message",
                        threadId,
                        localMid,
                        status,
                        meta2 ?? { attempt: 0 },
                    ),
            });

            th._sync = "error";
            this.bus.emit("error", {
                message: (err as BackendError)?.message ?? "Reply failed",
                code: (err as BackendError)?.code,
                meta: err,
            });
            this.bus.emit("comment:thread:update", { thread: th as any });

            return localMid;
        }
    }

    async editMessage(
        threadId: ThreadId,
        messageId: CommentId,
        body: string,
    ): Promise<void> {
        const th = this.ensure(threadId);
        const orig = th.messages.find((m) => m.id === messageId);
        if (!orig) return;

        const previous = { ...orig };
        orig.body = body;
        orig.editedAt = Date.now();
        th.updatedAt = orig.editedAt;

        const hasBackend = Boolean(this.deps.backend && this.scope());
        th._sync ??= hasBackend ? "pending" : "synced";

        this.bus.emit("comment:thread:update", { thread: th as any });

        if (!this.deps.backend) return;

        const performOnce = async (): Promise<void> => {
            const scope = this.scope();
            if (!scope) return;

            const res = await this.deps.backend!.editMessage(scope, {
                threadId: th.id,
                messageId,
                body,
            });

            if (!res.ok) throw res.error;

            const idx = th.messages.findIndex((m) => m.id === messageId);
            if (idx >= 0) th.messages[idx] = res.value as CommentMessage;

            th._sync = "synced";
            this.bus.emit("comment:thread:update", { thread: th as any });
        };

        try {
            await performOnce();
        } catch (err) {
            const scope = this.scope();
            const branchKey = scope?.branchId ?? "no_branch";
            const jobId = `comments:edit_message:${branchKey}:${threadId}:${messageId}`;

            this.retry.enqueue({
                id: jobId,
                perform: async () => {
                    try {
                        await performOnce();
                        return true;
                    } catch {
                        return false;
                    }
                },
                onStatus: (status, meta2) =>
                    this.emitSync(
                        "edit_message",
                        threadId,
                        messageId,
                        status,
                        meta2 ?? { attempt: 0 },
                    ),
            });

            const idx = th.messages.findIndex((m) => m.id === messageId);
            if (idx >= 0) th.messages[idx] = previous;

            th._sync = "error";
            this.bus.emit("error", {
                message: (err as BackendError)?.message ?? "Edit failed",
                code: (err as BackendError)?.code,
                meta: err,
            });
            this.bus.emit("comment:thread:update", { thread: th as any });
        }
    }

    async deleteMessage(
        threadId: ThreadId,
        messageId: CommentId,
    ): Promise<void> {
        const th = this.ensure(threadId);
        const backup = [...th.messages];

        th.messages = th.messages.filter((m) => m.id !== messageId);
        th.updatedAt = Date.now();

        const hasBackend = Boolean(this.deps.backend && this.scope());
        th._sync ??= hasBackend ? "pending" : "synced";

        this.bus.emit("comment:thread:update", { thread: th as any });

        if (!this.deps.backend) return;

        const performOnce = async (): Promise<void> => {
            const scope = this.scope();
            if (!scope) return;

            const res = await this.deps.backend!.deleteMessage(scope, {
                threadId: th.id,
                messageId,
            });

            if (!res.ok) throw res.error;

            th._sync = "synced";
            this.bus.emit("comment:thread:update", { thread: th as any });
        };

        try {
            await performOnce();
        } catch (err) {
            const scope = this.scope();
            const branchKey = scope?.branchId ?? "no_branch";
            const jobId = `comments:delete_message:${branchKey}:${threadId}:${messageId}`;

            this.retry.enqueue({
                id: jobId,
                perform: async () => {
                    try {
                        await performOnce();
                        return true;
                    } catch {
                        return false;
                    }
                },
                onStatus: (status, meta2) =>
                    this.emitSync(
                        "delete_message",
                        threadId,
                        messageId,
                        status,
                        meta2 ?? { attempt: 0 },
                    ),
            });

            th.messages = backup;
            th._sync = "error";
            this.bus.emit("error", {
                message: (err as BackendError)?.message ?? "Delete failed",
                code: (err as BackendError)?.code,
                meta: err,
            });
            this.bus.emit("comment:thread:update", { thread: th as any });
        }
    }

    async move(threadId: ThreadId, anchor: CommentAnchor): Promise<void> {
        const th = this.ensure(threadId);
        const prev = th.anchor;

        th.anchor = anchor;
        th.updatedAt = Date.now();

        const hasBackend = Boolean(this.deps.backend && this.scope());
        th._sync ??= hasBackend ? "pending" : "synced";

        this.bus.emit("comment:move", { thread: th as any });
        this.bus.emit("comment:thread:update", { thread: th as any });

        if (!this.deps.backend) return;

        const performOnce = async (): Promise<void> => {
            const scope = this.scope();
            if (!scope) return;

            const res = await this.deps.backend!.moveThread(scope, {
                threadId: th.id,
                anchor,
            });

            if (!res.ok) throw res.error;

            this.threads.set(th.id, { ...(res.value as CommentThread), _sync: "synced" });
            this.bus.emit("comment:thread:update", {
                thread: this.threads.get(threadId)! as any,
            });
        };

        try {
            await performOnce();
        } catch (err) {
            const scope = this.scope();
            const branchKey = scope?.branchId ?? "no_branch";
            const jobId = `comments:move_thread:${branchKey}:${threadId}`;

            this.retry.enqueue({
                id: jobId,
                perform: async () => {
                    try {
                        await performOnce();
                        return true;
                    } catch {
                        return false;
                    }
                },
                onStatus: (status, meta2) =>
                    this.emitSync(
                        "move_thread",
                        threadId,
                        undefined,
                        status,
                        meta2 ?? { attempt: 0 },
                    ),
            });

            th.anchor = prev;
            th._sync = "error";
            this.bus.emit("error", {
                message: (err as BackendError)?.message ?? "Move failed",
                code: (err as BackendError)?.code,
                meta: err,
            });
            this.bus.emit("comment:thread:update", { thread: th as any });
        }
    }

    async resolve(threadId: ThreadId, value = true): Promise<void> {
        const th = this.ensure(threadId);
        const prev = th.resolved;

        th.resolved = value;
        th.updatedAt = Date.now();

        const hasBackend = Boolean(this.deps.backend && this.scope());
        th._sync ??= hasBackend ? "pending" : "synced";

        this.bus.emit("comment:resolve", { thread: th as any, resolved: value });
        this.bus.emit("comment:thread:update", { thread: th as any });

        if (!this.deps.backend) return;

        const performOnce = async (): Promise<void> => {
            const scope = this.scope();
            if (!scope) return;

            const res = await this.deps.backend!.resolveThread(scope, {
                threadId: th.id,
                resolved: value,
            });

            if (!res.ok) throw res.error;

            this.threads.set(th.id, { ...(res.value as CommentThread), _sync: "synced" });
            this.bus.emit("comment:thread:update", {
                thread: this.threads.get(threadId)! as any,
            });
        };

        try {
            await performOnce();
        } catch (err) {
            const scope = this.scope();
            const branchKey = scope?.branchId ?? "no_branch";
            const jobId = `comments:resolve_thread:${branchKey}:${threadId}`;

            this.retry.enqueue({
                id: jobId,
                perform: async () => {
                    try {
                        await performOnce();
                        return true;
                    } catch {
                        return false;
                    }
                },
                onStatus: (status, meta2) =>
                    this.emitSync(
                        "resolve_thread",
                        threadId,
                        undefined,
                        status,
                        meta2 ?? { attempt: 0 },
                    ),
            });

            th.resolved = prev;
            th._sync = "error";
            this.bus.emit("error", {
                message: (err as BackendError)?.message ?? "Resolve failed",
                code: (err as BackendError)?.code,
                meta: err,
            });
            this.bus.emit("comment:thread:update", { thread: th as any });
        }
    }

    async deleteThread(threadId: ThreadId): Promise<void> {
        const prev = this.threads.get(threadId);
        if (!prev) return;

        this.threads.delete(threadId);
        this.bus.emit("comment:thread:delete", { threadId });

        if (!this.deps.backend) return;

        const performOnce = async (): Promise<void> => {
            const scope = this.scope();
            if (!scope) return;

            const res = await this.deps.backend!.deleteThread(scope, { threadId });
            if (!res.ok) throw res.error;
        };

        try {
            await performOnce();
        } catch (err) {
            const scope = this.scope();
            const branchKey = scope?.branchId ?? "no_branch";
            const jobId = `comments:delete_thread:${branchKey}:${threadId}`;

            this.retry.enqueue({
                id: jobId,
                perform: async () => {
                    try {
                        await performOnce();
                        return true;
                    } catch {
                        return false;
                    }
                },
                onStatus: (status, meta2) =>
                    this.emitSync(
                        "delete_thread",
                        threadId,
                        undefined,
                        status,
                        meta2 ?? { attempt: 0 },
                    ),
            });

            // rollback deletion so user can retry
            this.threads.set(threadId, prev);
            this.bus.emit("error", {
                message: (err as BackendError)?.message ?? "Delete thread failed",
                code: (err as BackendError)?.code,
                meta: err,
            });
            this.bus.emit("comment:thread:update", { thread: prev as any });
        }
    }

    // Optional helpers for UI controls
    retryJob(jobId: string): boolean {
        return this.retry.triggerNow(jobId);
    }

    cancelJob(jobId: string): boolean {
        return this.retry.cancel(jobId);
    }

    pendingJobs(): string[] {
        return this.retry.pendingIds();
    }

    /* ─── internal ────────────────────────────────────────── */
    private ensure(threadId: ThreadId): SyncThread {
        const th = this.threads.get(threadId);
        if (!th) throw new Error(`Comment thread not found: ${threadId}`);
        return th;
    }
}