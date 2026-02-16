import type { ReactNode } from "react";
import React, {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
} from "react";
import type { Scalar } from "@/schema/order";

export type FormSnapshot = {
    values: Record<string, Scalar | Scalar[]>;
    selections: Record<string, string[]>;
};

export type FormApi = {
    /** Scalar/array value by fieldId (non-option inputs) */
    get: (fieldId: string) => Scalar | Scalar[] | undefined;
    set: (fieldId: string, value: Scalar | Scalar[]) => void;

    /** Option selections by fieldId (array of optionIds) */
    getSelections: (fieldId: string) => string[];
    setSelections: (fieldId: string, optionIds: string[]) => void;
    toggleSelection: (fieldId: string, optionId: string) => void;
    removeSelectionToken(token: string): void;

    /** Clears everything (values + selections). */
    clear: () => void;

    /** Alias for clear (or “reset to initial” if initial was provided). */
    reset: (opts?: { toInitial?: boolean }) => void;

    /** Read-only snapshot for debugging */
    snapshot: () => FormSnapshot;

    /** Simple subscribe (re-render triggers) */
    subscribe: (fn: () => void) => () => void;
};

const FormCtx = createContext<FormApi | null>(null);

export function FormProvider({
    initial,
    children,
}: {
    initial?: Partial<FormSnapshot>;
    children: ReactNode;
}) {
    const initialRef = useRef<FormSnapshot>({
        values: (initial?.values ?? {}) as Record<string, Scalar | Scalar[]>,
        selections: (initial?.selections ?? {}) as Record<string, string[]>,
    });

    const [values, setValues] = useState<Record<string, Scalar | Scalar[]>>(
        initial?.values ?? {},
    );
    const [selections, setSelections] = useState<Record<string, string[]>>(
        initial?.selections ?? {},
    );
    const subsRef = useRef(new Set<() => void>());

    const publish = useCallback(() => {
        for (const fn of Array.from(subsRef.current)) {
            try {
                fn();
            } catch {
                /* noop */
            }
        }
    }, []);

    const api = useMemo<FormApi>(
        () => ({
            get: (fieldId) => values[fieldId],
            set: (fieldId, value) => {
                setValues((prev) => {
                    if (prev[fieldId] === value) return prev;
                    const next = { ...prev, [fieldId]: value };
                    return next;
                });
                publish();
            },
            removeSelectionToken: (token: string) => {
                if (!token) return;

                setSelections((prev) => {
                    if (!(token in prev)) return prev;
                    const next = { ...prev };
                    delete next[token];
                    return next;
                });

                publish();
            },
            clear: () => {
                setValues({});
                setSelections({});
                publish();
            },

            reset: (opts) => {
                const toInitial = opts?.toInitial ?? false;
                if (toInitial) {
                    setValues({ ...(initialRef.current.values ?? {}) });
                    setSelections({ ...(initialRef.current.selections ?? {}) });
                } else {
                    setValues({});
                    setSelections({});
                }
                publish();
            },
            getSelections: (fieldId) => selections[fieldId] ?? [],
            setSelections: (fieldId, optionIds) => {
                setSelections((prev) => {
                    const next = {
                        ...prev,
                        [fieldId]: Array.from(new Set(optionIds)),
                    };
                    return next;
                });
                publish();
            },
            toggleSelection: (fieldId, optionId) => {
                setSelections((prev) => {
                    const cur = new Set(prev[fieldId] ?? []);
                    if (cur.has(optionId)) cur.delete(optionId);
                    else cur.add(optionId);
                    return { ...prev, [fieldId]: Array.from(cur) };
                });
                publish();
            },

            snapshot: () => ({
                values: { ...values },
                selections: { ...selections },
            }),

            subscribe: (fn) => {
                subsRef.current.add(fn);
                return () => subsRef.current.delete(fn);
            },
        }),
        [publish, selections, values],
    );

    return <FormCtx.Provider value={api}>{children}</FormCtx.Provider>;
}

/** Strict hook (throws if no provider) */
export function useFormApi(): FormApi {
    const ctx = useContext(FormCtx);
    if (!ctx) throw new Error("useFormApi must be used within <FormProvider>");
    return ctx;
}

/** Optional hook (returns null if no provider) */
export function useOptionalFormApi(): FormApi | null {
    return useContext(FormCtx);
}

/** Field-scoped helpers */

export function useFormField(fieldId: string): {
    value: Scalar | Scalar[] | undefined;
    set: (value: Scalar | Scalar[]) => void;
} {
    const api = useFormApi();
    const value = api.get(fieldId);
    const set = (v: Scalar | Scalar[]) => api.set(fieldId, v);
    return { value, set };
}

export function useFormSelections(fieldId: string): {
    selected: string[];
    set: (optionIds: string[]) => void;
    toggle: (optionId: string) => void;
} {
    const api = useFormApi();
    return {
        selected: api.getSelections(fieldId),
        set: (arr: string[]) => api.setSelections(fieldId, arr),
        toggle: (oid: string) => api.toggleSelection(fieldId, oid),
    };
}
