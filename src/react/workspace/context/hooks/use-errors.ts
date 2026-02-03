// src/react/workspace/context/use-errors.ts

import * as React from "react";

import { validate } from "@/core/validate"; // engine-only
import type {
    ServiceProps,
    ValidationError as CoreValidationError,
} from "@/schema";

import { useCanvasAPI } from "../context";

/** ---------------- Types ---------------- */

export type ErrorKind = "validation" | "log";

export type ValidationRow = CoreValidationError & {
    id: string; // stable key
    kind: "validation";
};

export type ErrorLog = {
    id: string;
    kind: "log";
    message: string;
    code?: string;
    createdAt: number;
    meta?: any;
};

export interface MergedErrors {
    validation: readonly ValidationRow[];
    logs: readonly ErrorLog[];

    counts: {
        validation: number;
        logs: number;
        total: number;
    };

    groups: Array<
        | { kind: "validation"; title: string; rows: readonly ValidationRow[] }
        | { kind: "log"; title: string; rows: readonly ErrorLog[] }
    >;

    forEach(
        fn: (row: ValidationRow | ErrorLog, kind: "validation" | "log") => void,
    ): void;
}

export type ClearTarget = "logs" | "merged";

export interface UseErrorsReturn {
    /** Unclearable (until validate() returns clean) */
    validation: readonly ValidationRow[];

    /** Clearable log stream (editor/runtime events) */
    logs: readonly ErrorLog[];

    /** Organised merged view */
    merged: MergedErrors;

    /** True while a validation run is pending/in-flight */
    validating: boolean;

    /** Clear logs; clearing merged clears logs too */
    clear(target: ClearTarget): void;

    /** Remove a single log row */
    removeLog(id: string): void;
}

export type UseErrorsOptions = {
    /** Keep last N logs */
    logLimit?: number;

    /** Dedupe identical consecutive logs within this window */
    logDedupeWindowMs?: number;

    /** Debounce validation triggered by state:change */
    debounceMs?: number;

    /**
     * Prefer idle-time validation to avoid UI hitching.
     * If requestIdleCallback isn't available, falls back to setTimeout(0).
     */
    useIdle?: boolean;

    /** requestIdleCallback timeout */
    idleTimeoutMs?: number;
};

/** ---------------- Helpers ---------------- */

function makeId(prefix: string): string {
    return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function stableKey(parts: Array<string | undefined | null>): string {
    return parts.filter(Boolean).join("|");
}

function toValidationRows(list: CoreValidationError[]): ValidationRow[] {
    return (list ?? []).map((e) => ({
        ...e,
        kind: "validation" as const,
        id:
            stableKey([
                "v",
                String((e as any).code ?? ""),
                String((e as any).severity ?? ""),
                String((e as any).nodeId ?? ""),
                String((e as any).message ?? ""),
            ]) || makeId("v"),
    }));
}

function normalizeLog(e: any): Omit<ErrorLog, "id" | "createdAt" | "kind"> {
    return {
        message: e?.message ?? String(e),
        code: e?.code,
        meta: e?.meta ?? e,
    };
}

function sameLog(
    a: ErrorLog,
    b: Omit<ErrorLog, "id" | "createdAt" | "kind">,
): boolean {
    return a.message === b.message && (a.code ?? "") === (b.code ?? "");
}

function schedule(fn: () => void, useIdle: boolean, idleTimeoutMs: number) {
    if (useIdle && typeof (window as any).requestIdleCallback === "function") {
        (window as any).requestIdleCallback(fn, { timeout: idleTimeoutMs });
        return;
    }
    window.setTimeout(fn, 0);
}

/** ---------------- Hook ---------------- */

export function useErrors(opts: UseErrorsOptions = {}): UseErrorsReturn {
    const api = useCanvasAPI();

    const logLimit = Math.max(1, Math.min(opts.logLimit ?? 200, 2000));
    const dedupeWindowMs = Math.max(0, opts.logDedupeWindowMs ?? 400);
    const debounceMs = Math.max(0, opts.debounceMs ?? 120);
    const useIdle = opts.useIdle ?? true;
    const idleTimeoutMs = Math.max(0, opts.idleTimeoutMs ?? 250);

    const [validation, setValidation] = React.useState<ValidationRow[]>([]);
    const [validating, setValidating] = React.useState(false);

    const [logs, setLogs] = React.useState<ErrorLog[]>([]);

    // ---- logs (clearable)
    const pushLog = React.useCallback(
        (entry: Omit<ErrorLog, "id" | "createdAt" | "kind">) => {
            setLogs((prev) => {
                const now = Date.now();
                const last = prev[prev.length - 1];

                if (
                    last &&
                    sameLog(last, entry) &&
                    now - last.createdAt <= dedupeWindowMs
                ) {
                    const copy = prev.slice();
                    copy[copy.length - 1] = { ...last, createdAt: now };
                    return copy;
                }

                const next: ErrorLog = {
                    id: makeId("log"),
                    kind: "log",
                    createdAt: now,
                    ...entry,
                };

                const out = prev.concat(next);
                return out.length > logLimit
                    ? out.slice(out.length - logLimit)
                    : out;
            });
        },
        [dedupeWindowMs, logLimit],
    );

    React.useEffect(() => {
        // editor emitted “logs”
        const offEditorError = api.on("error", (e: any) => {
            pushLog(normalizeLog(e));
        });

        // runtime emitted errors (optional but useful)
        const offRuntimeError = api.on("error", (e: any) => {
            pushLog(normalizeLog(e));
        });

        return () => {
            offEditorError?.();
            offRuntimeError?.();
        };
    }, [api, pushLog]);

    // ---- validation (unclearable, derived via core/validate)
    const runTokenRef = React.useRef(0);
    const debounceTimerRef = React.useRef<number | null>(null);

    const runValidation = React.useCallback(() => {
        const token = ++runTokenRef.current;

        setValidating(true);

        schedule(
            () => {
                // if another run was queued, drop this one
                if (token !== runTokenRef.current) return;

                try {
                    const props = api.editor.getProps() as ServiceProps;
                    const res = validate(props); // sync engine
                    if (token !== runTokenRef.current) return;

                    setValidation(toValidationRows(res ?? []));
                } catch (err: any) {
                    if (token !== runTokenRef.current) return;

                    // validator crash becomes a log, not a validation row
                    pushLog({
                        message: err?.message ?? "validate() threw",
                        code: err?.code ?? "validate_throw",
                        meta: err,
                    });

                    setValidation([]);
                } finally {
                    if (token == runTokenRef.current) setValidating(false);
                }
            },
            useIdle,
            idleTimeoutMs,
        );
    }, [api, pushLog, useIdle, idleTimeoutMs]);

    const triggerValidation = React.useCallback(() => {
        if (debounceTimerRef.current) {
            window.clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }

        // bump token so any scheduled run knows it’s obsolete
        runTokenRef.current++;

        if (debounceMs === 0) {
            runValidation();
            return;
        }

        debounceTimerRef.current = window.setTimeout(() => {
            runValidation();
        }, debounceMs);
    }, [debounceMs, runValidation]);

    React.useEffect(() => {
        // initial validate
        triggerValidation();

        const off = api.on("state:change", () => {
            triggerValidation();
        });

        return () => {
            off?.();
            if (debounceTimerRef.current) {
                window.clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            runTokenRef.current++; // invalidate any scheduled work
        };
    }, [api, triggerValidation]);

    // ---- merged (organised)
    const merged = React.useMemo<MergedErrors>(() => {
        const v = validation;
        const l = logs;

        return {
            validation: v,
            logs: l,

            counts: {
                validation: v.length,
                logs: l.length,
                total: v.length + l.length,
            },

            groups: [
                { kind: "validation", title: "Validation", rows: v },
                { kind: "log", title: "Logs", rows: l },
            ],

            forEach(fn) {
                for (const row of v) fn(row, "validation");
                for (const row of l) fn(row, "log");
            },
        };
    }, [validation, logs]);

    const clear = React.useCallback((target: ClearTarget) => {
        // validation is unclearable by design
        if (target === "logs" || target === "merged") setLogs([]);
    }, []);

    const removeLog = React.useCallback((id: string) => {
        setLogs((prev) => prev.filter((x) => x.id !== id));
    }, []);

    return React.useMemo(
        () => ({
            validation,
            logs,
            merged,
            validating,
            clear,
            removeLog,
        }),
        [validation, logs, merged, validating, clear, removeLog],
    );
}
