// src/react/workspace/context/provider/slices/use-policies-slice.ts
import * as React from "react";

import type { WorkspaceBackend, Result, BackendError } from "../../backend";
import type { Loadable } from "@/react";

import type { DynamicRule } from "@/schema/validation";
import { compilePolicies, type PolicyDiagnostic } from "@/core/policy";

/* ---------------- helpers ---------------- */

function idle<T>(data: T | null = null): Loadable<T> {
    return { state: "idle", data } as any;
}
function loading<T>(prev: Loadable<T>): Loadable<T> {
    return { ...prev, state: "loading", error: undefined } as any;
}
function ready<T>(data: T): Loadable<T> {
    return { state: "ready", data, error: undefined } as any;
}
function failed<T>(prev: Loadable<T>, error: BackendError): Loadable<T> {
    return { ...prev, state: "error", error } as any;
}

function missingBackendError(key: string): BackendError {
    return {
        code: "backend_missing",
        message: `WorkspaceBackend.policies.${key} is not implemented.`,
    };
}

/* ---------------- slice ---------------- */

export type PoliciesSlice = {
    readonly policies: Loadable<readonly DynamicRule[]>;
    readonly policyDiagnostics: Loadable<readonly PolicyDiagnostic[]>;

    /** internal state setters (for cache switching parity) */
    readonly __setPoliciesState: React.Dispatch<
        React.SetStateAction<Loadable<readonly DynamicRule[]>>
    >;
    readonly __setPolicyDiagnosticsState: React.Dispatch<
        React.SetStateAction<Loadable<readonly PolicyDiagnostic[]>>
    >;

    readonly invalidatePolicies: () => void;

    readonly refreshPolicies: (
        params?: Readonly<{ since?: number | string; branchId?: string }>,
    ) => Promise<void>;

    readonly savePolicies: (
        rules: readonly DynamicRule[],
        params?: Readonly<{ branchId?: string }>,
    ) => Result<Readonly<{ policies: readonly DynamicRule[] }>>;

    /** local-only compile helper for editor UIs */
    readonly compilePoliciesFromRaw: (raw: unknown) => Readonly<{
        policies: DynamicRule[];
        diagnostics: PolicyDiagnostic[];
    }>;
};

export function usePoliciesSlice(
    args: Readonly<{
        backend: WorkspaceBackend;
        workspaceId: string;
        actorId: string;
        getCurrentBranchId: () => string | undefined;

        /** optional hydration */
        initialPolicies?: readonly DynamicRule[] | null;

        /** runtime is accepted for parity with other slices (not required here) */
        runtime?: unknown;
    }>,
): PoliciesSlice {
    const {
        backend,
        workspaceId,
        actorId,
        getCurrentBranchId,
        initialPolicies = null,
    } = args;

    const [policies, __setPoliciesState] = React.useState<
        Loadable<readonly DynamicRule[]>
    >(() => (initialPolicies ? ready(initialPolicies) : idle(null)) as any);

    const [policyDiagnostics, __setPolicyDiagnosticsState] = React.useState<
        Loadable<readonly PolicyDiagnostic[]>
    >(() => idle([]));

    const invalidatePolicies = React.useCallback((): void => {
        __setPoliciesState((s) => idle(s.data ?? null));
        __setPolicyDiagnosticsState(() => idle([]));
    }, []);

    const refreshPolicies = React.useCallback(
        async (
            params?: Readonly<{ since?: number | string; branchId?: string }>,
        ): Promise<void> => {
            const branchId: string | undefined =
                params?.branchId ?? getCurrentBranchId();

            const api: any = (backend as any).policies;

            // Prefer refresh(); fallback to get()
            const fn: any = api?.refresh ?? api?.get;
            const fnKey: string = api?.refresh ? "refresh" : "get";

            if (!fn) {
                __setPoliciesState((s) =>
                    failed(s, missingBackendError(fnKey)),
                );
                return;
            }

            __setPoliciesState((s) => loading(s));

            const res = await fn({
                workspaceId,
                branchId,
                actorId,
                since: params?.since,
            });

            if (!res?.ok) {
                __setPoliciesState((s) =>
                    failed(s, res?.error ?? missingBackendError(fnKey)),
                );
                return;
            }

            const list: readonly DynamicRule[] = (res.value?.policies ??
                res.value ??
                []) as readonly DynamicRule[];

            __setPoliciesState(() => ready(list));
        },
        [backend, workspaceId, actorId, getCurrentBranchId],
    );

    const savePolicies = React.useCallback<PoliciesSlice["savePolicies"]>(
        async (rules, params) => {
            const branchId: string | undefined =
                params?.branchId ?? getCurrentBranchId();

            const api: any = (backend as any).policies;
            if (!api?.save) {
                const err = missingBackendError("save");
                __setPoliciesState((s) => failed(s, err));
                return { ok: false, error: err };
            }

            __setPoliciesState((s) => loading(s));

            const res = await api.save({
                workspaceId,
                branchId,
                actorId,
                policies: rules,
            });

            if (!res?.ok) {
                __setPoliciesState((s) =>
                    failed(s, res?.error ?? missingBackendError("save")),
                );
                return res;
            }

            const list: readonly DynamicRule[] = (res.value?.policies ??
                res.value ??
                rules) as readonly DynamicRule[];

            __setPoliciesState(() => ready(list));

            return {
                ok: true,
                value: { policies: list },
            };
        },
        [backend, workspaceId, actorId, getCurrentBranchId],
    );

    const compilePoliciesFromRaw = React.useCallback((raw: unknown) => {
        const { policies: compiled, diagnostics } = compilePolicies(raw);

        __setPoliciesState(() => ready(compiled));
        __setPolicyDiagnosticsState(() => ready(diagnostics));

        return { policies: compiled, diagnostics };
    }, []);

    return {
        policies,
        policyDiagnostics,

        __setPoliciesState,
        __setPolicyDiagnosticsState,

        invalidatePolicies,
        refreshPolicies,
        savePolicies,

        compilePoliciesFromRaw,
    };
}
