// src/react/workspace/context/backend/memory/errors.ts

import type { BackendError, BackendResult } from "../backend";

export function ok<T>(value: T): BackendResult<T> {
    return { ok: true, value };
}

export function fail<T = never>(
    code: string,
    message: string,
    opts?: Readonly<{
        status?: number;
        hint?: string;
        meta?: unknown;
        cause?: unknown;
    }>,
): BackendResult<T> {
    const err: BackendError = {
        code,
        message,
        status: opts?.status,
        hint: opts?.hint,
        meta: opts?.meta as any,
        cause: opts?.cause,
    };
    return { ok: false, error: err };
}

export function asError(e: unknown): BackendError {
    if (
        typeof e === "object" &&
        e !== null &&
        "code" in (e as Record<string, unknown>) &&
        "message" in (e as Record<string, unknown>)
    ) {
        return e as BackendError;
    }
    return {
        code: "unknown_error",
        message: String(e ?? "Unknown error"),
        meta: e as any,
    };
}
