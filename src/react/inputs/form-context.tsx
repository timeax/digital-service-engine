// src/react/inputs/form-context.tsx
import type { ReactNode } from "react";
import * as React from "react";

import type { CoreContext } from "@timeax/form-palette";
import { Form, useCore } from "@timeax/form-palette";

type Dict = Record<string, unknown>;

export type FormSnapshot = Dict;

export type FormApi = {
    /** Value by fieldId (Wrapper uses name=field.id) */
    get: (fieldId: string) => unknown;
    /**
     * Programmatic set (NOT used by Wrapper).
     * If the field is mounted, writes into the core.
     * If not mounted, persists into core.bucket (via core.setValue) or local bag fallback.
     */
    set: (fieldId: string, value: unknown) => void;

    /** Option selections (legacy; kept for compatibility) */
    getSelections: (fieldId: string) => string[];
    setSelections: (fieldId: string, optionIds: string[]) => void;
    toggleSelection: (fieldId: string, optionId: string) => void;
    removeSelectionToken(token: string): void;

    /** Read-only snapshot for debugging (NO validation) */
    snapshot: () => FormSnapshot;

    /** Simple subscribe (re-render triggers) */
    subscribe: (fn: () => void) => () => void;

    /**
     * Validation gate:
     * local submit runs validation and returns mounted/visible values.
     * (This is NOT “submitting to a server”.)
     */
    submit: () => { values: Dict; valid: boolean };

    setFieldError(id: any, message: string): void;
    setErrors(errors: Record<string, string>): void;
};

const Ctx = React.createContext<FormApi | null>(null);

export function useFormApi(): FormApi {
    const v = React.useContext(Ctx);
    if (!v) throw new Error("useFormApi must be used within <FormProvider />");
    return v;
}

export function useOptionalFormApi(): FormApi | null {
    return React.useContext(Ctx);
}

export type FormProviderProps = {
    children: ReactNode;

    /** Optional schema (zod/jsonschema/etc, depending on your palette build) */
    schema?: any;

    /**
     * Same shape as the old OrderFlowProvider usage.
     * - values: seed values (persisted/rehydrated)
     * - selections: legacy (kept for compatibility)
     */
    initial?: {
        values?: Dict;
        selections?: Record<string, string[]>;
    };
};

export function FormProvider({ children, schema, initial }: FormProviderProps) {
    // Indefinite memory (we keep values even when fields unmount)
    const [bag, setBag] = React.useState<Dict>(() => ({
        ...(initial?.values ?? {}),
    }));

    // Legacy selections (compat only)
    const [selectionsBag, setSelectionsBag] = React.useState<
        Record<string, string[]>
    >(() => ({ ...(initial?.selections ?? {}) }));

    // subscribe() support
    const listenersRef = React.useRef(new Set<() => void>());
    const publish = React.useCallback(() => {
        for (const fn of listenersRef.current) fn();
    }, []);

    // palette core ref (for submit/values/setValue)
    const coreRef = React.useRef<CoreContext<Dict> | null>(null);

    function Bridge() {
        const core = useCore<Dict>();

        React.useEffect(() => {
            coreRef.current = core;
            publish();
            return () => {
                coreRef.current = null;
                publish();
            };
        }, [core, publish]);

        return null;
    }

    const api = React.useMemo<FormApi>(() => {
        return {
            subscribe(fn) {
                listenersRef.current.add(fn);
                return () => listenersRef.current.delete(fn);
            },

            get(fieldId) {
                const core = coreRef.current;
                const live =
                    (core?.values?.() as Dict | undefined) ?? undefined;

                // Prefer live (mounted + bucket), fallback to our indefinite bag
                if (live && fieldId in live) return live[fieldId];
                return bag[fieldId];
            },

            set(fieldId, value) {
                const core = coreRef.current;
                setBag((prev) => ({ ...prev, [fieldId]: value }));

                // Programmatic sets should go through core when possible
                // (core.setValue also persists to bucket when field isn't mounted).
                if (core) {
                    core.setValue(fieldId, value);
                    publish();
                    return;
                }

                // Fallback if core isn't mounted yet
                publish();
            },

            // Legacy selections API (compat; no longer used by the new Wrapper)
            getSelections(fieldId) {
                return selectionsBag[fieldId] ?? [];
            },
            setSelections(fieldId, optionIds) {
                setSelectionsBag((prev) => ({
                    ...prev,
                    [fieldId]: optionIds ?? [],
                }));
                publish();
            },
            toggleSelection(fieldId, optionId) {
                setSelectionsBag((prev) => {
                    const current = new Set(prev[fieldId] ?? []);
                    if (current.has(optionId)) current.delete(optionId);
                    else current.add(optionId);
                    return { ...prev, [fieldId]: Array.from(current) };
                });
                publish();
            },
            removeSelectionToken(token) {
                // token is "fieldId:optionId" in the old system; keep best-effort compat
                const [fieldId, optionId] = String(token).split(":", 2);
                if (!fieldId || !optionId) return;
                setSelectionsBag((prev) => {
                    const current = new Set(prev[fieldId] ?? []);
                    current.delete(optionId);
                    return { ...prev, [fieldId]: Array.from(current) };
                });
                publish();
            },

            snapshot() {
                // IMPORTANT: read-only, NO validation here.
                const core = coreRef.current;
                const live = (core?.values?.() as Dict | undefined) ?? {};

                return { ...bag, ...live };
            },

            submit() {
                const core = coreRef.current;
                if (!core) return { values: {}, valid: false };

                // palette submit validates & returns mounted/visible values
                const submitted = core.submit() as {
                    values: Dict;
                    valid: boolean;
                };
                return {
                    ...submitted,
                    values: { ...bag, ...submitted.values },
                };
            },

            setFieldError(id: any, message: string) {
                const core = coreRef.current;
                if (!core) return;
                core.error(id, message);
            },

            setErrors(values: Record<string, string>) {
                const core = coreRef.current;
                if (!core) return;

                core.error(values);
            },
        };
    }, [bag, selectionsBag, publish]);

    return (
        <Ctx.Provider value={api}>
            <Form
                adapter="local"
                schema={schema}
                valueBag={bag}
                formRef={coreRef}
                onChange={() => publish()}
            >
                <Bridge />
                {children}
            </Form>
        </Ctx.Provider>
    );
}
