import type { EventBus } from "@/react";
import type { CanvasEvents } from "@/schema/canvas-types";
import { RetryQueue } from "@/utils/retry-queue";
import type { BackendError } from "@/react/workspace/context/backend";

export type CommentId = string;
export type ThreadId = string;

export type CommentAnchor =
    | { type: "node"; nodeId: string; offset?: { dx: number; dy: number } }
    | { type: "edge"; edgeId: string; t?: number }
    | { type: "free"; position: { x: number; y: number } };

export type CommentMessage = {
    id: CommentId;
    authorId?: string;
    authorName?: string;
    body: string;
    createdAt: number;
    editedAt?: number;
    meta?: Record<string, unknown>;
};

export type CommentThread = {
    id: ThreadId;
    anchor: CommentAnchor;
    resolved: boolean;
    createdAt: number;
    updatedAt: number;
    messages: CommentMessage[];
    meta?: Record<string, unknown>;
    // local sync flags (not persisted by server)
    _sync?: "pending" | "synced" | "error";
};
