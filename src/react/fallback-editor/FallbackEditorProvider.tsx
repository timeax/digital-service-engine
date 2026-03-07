import React from "react";
import type { ServiceIdRef, ServiceProps } from "@/schema";
import type { OrderSnapshot } from "@/schema/order";
import type { FallbackSettings } from "@/schema/validation";
import type { DgpServiceMap } from "@/schema/provider";
import {
    createFallbackEditor,
    type FallbackEditor,
} from "@/core/fallback-editor";

type TabKey = "registrations" | "settings";

export type FallbackEditorProviderProps = {
    children: React.ReactNode;
    fallbacks?: ServiceProps["fallbacks"];
    props?: ServiceProps;
    snapshot?: OrderSnapshot;

    primaryServices?: DgpServiceMap;
    eligibleServices?: DgpServiceMap;

    settings?: FallbackSettings;
    initialServiceId?: ServiceIdRef;
    initialTab?: TabKey;

    onSettingsChange?: (
        next: FallbackSettings,
    ) => Promise<FallbackSettings> | FallbackSettings;

    onSave?: (
        next: ServiceProps["fallbacks"],
    ) =>
        | Promise<ServiceProps["fallbacks"] | void>
        | ServiceProps["fallbacks"]
        | void;

    onValidate?: (next: ServiceProps["fallbacks"]) => Promise<void> | void;

    onReset?: () => Promise<void> | void;
};

type FallbackEditorContextValue = {
    editor: FallbackEditor;
    version: number;

    serviceProps?: ServiceProps;
    snapshot?: OrderSnapshot;

    primaryServices: DgpServiceMap;
    eligibleServices: DgpServiceMap;

    activeServiceId?: ServiceIdRef;
    setActiveServiceId: React.Dispatch<
        React.SetStateAction<ServiceIdRef | undefined>
    >;

    activeTab: TabKey;
    setActiveTab: React.Dispatch<React.SetStateAction<TabKey>>;

    state: ReturnType<FallbackEditor["state"]>;
    value: ReturnType<FallbackEditor["value"]>;

    settings: FallbackSettings;
    settingsSaving: boolean;

    headerSaving: boolean;
    headerValidating: boolean;
    headerResetting: boolean;

    saveSettings: (next: FallbackSettings) => Promise<FallbackSettings>;
    saveFallbacks: () => Promise<ServiceProps["fallbacks"] | void>;
    validateFallbacks: () => Promise<void>;
    resetEditor: () => Promise<void>;

    reset: () => void;

    get: FallbackEditor["get"];
    getScope: FallbackEditor["getScope"];
    check: FallbackEditor["check"];
    eligible: FallbackEditor["eligible"];

    add: FallbackEditor["add"];
    addMany: FallbackEditor["addMany"];
    remove: FallbackEditor["remove"];
    replace: FallbackEditor["replace"];
    clear: FallbackEditor["clear"];
};

const FallbackEditorContext =
    React.createContext<FallbackEditorContextValue | null>(null);

export function FallbackEditorProvider({
    children,
    fallbacks,
    props,
    snapshot,
    primaryServices,
    eligibleServices,
    settings: initialSettings,
    initialServiceId,
    initialTab = "registrations",
    onSettingsChange,
    onSave,
    onValidate,
    onReset,
}: FallbackEditorProviderProps) {
    const [settings, setSettings] = React.useState<FallbackSettings>(
        initialSettings ?? {},
    );
    const [settingsSaving, setSettingsSaving] = React.useState(false);

    const [headerSaving, setHeaderSaving] = React.useState(false);
    const [headerValidating, setHeaderValidating] = React.useState(false);
    const [headerResetting, setHeaderResetting] = React.useState(false);

    const [version, setVersion] = React.useState(0);
    const [activeServiceId, setActiveServiceId] = React.useState<
        ServiceIdRef | undefined
    >(initialServiceId);
    const [activeTab, setActiveTab] = React.useState<TabKey>(initialTab);

    React.useEffect(() => {
        setSettings(initialSettings ?? {});
    }, [initialSettings]);

    const resolvedPrimaryServices = React.useMemo<DgpServiceMap>(
        () => primaryServices ?? {},
        [primaryServices],
    );

    const resolvedEligibleServices = React.useMemo<DgpServiceMap>(
        () => eligibleServices ?? primaryServices ?? {},
        [eligibleServices, primaryServices],
    );

    const editorRef = React.useRef<FallbackEditor | null>(null);

    const buildEditor = React.useCallback(
        (next?: {
            fallbacks?: ServiceProps["fallbacks"];
            settings?: FallbackSettings;
            services?: DgpServiceMap;
            props?: ServiceProps;
            snapshot?: OrderSnapshot;
        }) => {
            const currentValue = editorRef.current?.value();

            editorRef.current = createFallbackEditor({
                fallbacks: next?.fallbacks ?? currentValue ?? fallbacks ?? {},
                props: next?.props ?? props,
                snapshot: next?.snapshot ?? snapshot,
                services: next?.services ?? resolvedEligibleServices,
                settings: next?.settings ?? settings,
            });

            setVersion((v) => v + 1);
        },
        [fallbacks, props, snapshot, resolvedEligibleServices, settings],
    );

    if (!editorRef.current) {
        editorRef.current = createFallbackEditor({
            fallbacks: fallbacks ?? {},
            props,
            snapshot,
            services: resolvedEligibleServices,
            settings,
        });
    }

    React.useEffect(() => {
        buildEditor({
            fallbacks: fallbacks ?? {},
            props,
            snapshot,
            services: resolvedEligibleServices,
            settings,
        });
    }, [fallbacks, props, snapshot, resolvedEligibleServices, buildEditor]);

    const editor = editorRef.current;

    const bump = React.useCallback(() => {
        setVersion((v) => v + 1);
    }, []);

    const syncAfterMutation = React.useCallback(() => {
        bump();
    }, [bump]);

    const reset = React.useCallback(() => {
        editor.reset();
        syncAfterMutation();
    }, [editor, syncAfterMutation]);

    const add = React.useCallback<FallbackEditor["add"]>(
        (context, candidate, options) => {
            const next = editor.add(context, candidate, options);
            syncAfterMutation();
            return next;
        },
        [editor, syncAfterMutation],
    );

    const addMany = React.useCallback<FallbackEditor["addMany"]>(
        (context, candidates, options) => {
            const next = editor.addMany(context, candidates, options);
            syncAfterMutation();
            return next;
        },
        [editor, syncAfterMutation],
    );

    const remove = React.useCallback<FallbackEditor["remove"]>(
        (context, candidate) => {
            const next = editor.remove(context, candidate);
            syncAfterMutation();
            return next;
        },
        [editor, syncAfterMutation],
    );

    const replace = React.useCallback<FallbackEditor["replace"]>(
        (context, candidates, options) => {
            const next = editor.replace(context, candidates, options);
            syncAfterMutation();
            return next;
        },
        [editor, syncAfterMutation],
    );

    const clear = React.useCallback<FallbackEditor["clear"]>(
        (context) => {
            const next = editor.clear(context);
            syncAfterMutation();
            return next;
        },
        [editor, syncAfterMutation],
    );

    const saveSettings = React.useCallback(
        async (next: FallbackSettings) => {
            setSettingsSaving(true);
            try {
                const resolved = onSettingsChange
                    ? await onSettingsChange(next)
                    : next;

                const finalSettings = resolved ?? next;
                setSettings(finalSettings);

                buildEditor({
                    settings: finalSettings,
                    fallbacks: editor.value(),
                });

                return finalSettings;
            } finally {
                setSettingsSaving(false);
            }
        },
        [onSettingsChange, buildEditor, editor],
    );

    const saveFallbacks = React.useCallback(async () => {
        const next = editor.value();

        setHeaderSaving(true);
        try {
            const resolved = onSave ? await onSave(next) : next;
            if (resolved) {
                buildEditor({ fallbacks: resolved });
            }
            return resolved;
        } finally {
            setHeaderSaving(false);
        }
    }, [editor, onSave, buildEditor]);

    const validateFallbacks = React.useCallback(async () => {
        const next = editor.value();

        setHeaderValidating(true);
        try {
            if (onValidate) {
                await onValidate(next);
            }
        } finally {
            setHeaderValidating(false);
        }
    }, [editor, onValidate]);

    const resetEditor = React.useCallback(async () => {
        setHeaderResetting(true);
        try {
            editor.reset();
            syncAfterMutation();

            if (onReset) {
                await onReset();
            }
        } finally {
            setHeaderResetting(false);
        }
    }, [editor, syncAfterMutation, onReset]);

    const value = React.useMemo(() => editor.value(), [editor, version]);
    const state = React.useMemo(() => editor.state(), [editor, version]);

    const ctx = React.useMemo<FallbackEditorContextValue>(
        () => ({
            editor,
            version,

            serviceProps: props,
            snapshot,

            primaryServices: resolvedPrimaryServices,
            eligibleServices: resolvedEligibleServices,

            activeServiceId,
            setActiveServiceId,

            activeTab,
            setActiveTab,

            state,
            value,

            settings,
            settingsSaving,

            headerSaving,
            headerValidating,
            headerResetting,

            saveSettings,
            saveFallbacks,
            validateFallbacks,
            resetEditor,

            reset,

            get: editor.get,
            getScope: editor.getScope,
            check: editor.check,
            eligible: editor.eligible,

            add,
            addMany,
            remove,
            replace,
            clear,
        }),
        [
            editor,
            version,
            props,
            snapshot,
            resolvedPrimaryServices,
            resolvedEligibleServices,
            activeServiceId,
            activeTab,
            state,
            value,
            settings,
            settingsSaving,
            headerSaving,
            headerValidating,
            headerResetting,
            saveSettings,
            saveFallbacks,
            validateFallbacks,
            resetEditor,
            reset,
            add,
            addMany,
            remove,
            replace,
            clear,
        ],
    );

    return (
        <FallbackEditorContext.Provider value={ctx}>
            {children}
        </FallbackEditorContext.Provider>
    );
}

export function useFallbackEditorContext() {
    const ctx = React.useContext(FallbackEditorContext);
    if (!ctx) {
        throw new Error(
            "useFallbackEditorContext must be used inside FallbackEditorProvider",
        );
    }
    return ctx;
}
