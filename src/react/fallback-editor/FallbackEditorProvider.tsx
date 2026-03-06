// fallback-editor/FallbackEditorProvider.tsx
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
    services?: DgpServiceMap;

    settings?: FallbackSettings;
    initialServiceId?: ServiceIdRef;
    initialTab?: TabKey;

    onSettingsChange?: (
        next: FallbackSettings,
    ) => Promise<FallbackSettings> | FallbackSettings;
};

type FallbackEditorContextValue = {
    editor: FallbackEditor;
    version: number;

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
    saveSettings: (next: FallbackSettings) => Promise<FallbackSettings>;

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
    services,
    settings: initialSettings,
    initialServiceId,
    initialTab = "registrations",
    onSettingsChange,
}: FallbackEditorProviderProps) {
    const [settings, setSettings] = React.useState<FallbackSettings>(
        initialSettings ?? {},
    );
    const [settingsSaving, setSettingsSaving] = React.useState(false);
    const [version, setVersion] = React.useState(0);
    const [activeServiceId, setActiveServiceId] = React.useState<
        ServiceIdRef | undefined
    >(initialServiceId);
    const [activeTab, setActiveTab] = React.useState<TabKey>(initialTab);

    const editor = React.useMemo<FallbackEditor>(() => {
        return createFallbackEditor({
            fallbacks,
            props,
            snapshot,
            services,
            settings,
        });
    }, [fallbacks, props, snapshot, services, settings]);

    const bump = React.useCallback(() => {
        setVersion((v) => v + 1);
    }, []);

    const reset = React.useCallback(() => {
        editor.reset();
        bump();
    }, [editor, bump]);

    const add = React.useCallback<FallbackEditor["add"]>(
        (context, candidate, options) => {
            const next = editor.add(context, candidate, options);
            bump();
            return next;
        },
        [editor, bump],
    );

    const addMany = React.useCallback<FallbackEditor["addMany"]>(
        (context, candidates, options) => {
            const next = editor.addMany(context, candidates, options);
            bump();
            return next;
        },
        [editor, bump],
    );

    const remove = React.useCallback<FallbackEditor["remove"]>(
        (context, candidate) => {
            const next = editor.remove(context, candidate);
            bump();
            return next;
        },
        [editor, bump],
    );

    const replace = React.useCallback<FallbackEditor["replace"]>(
        (context, candidates, options) => {
            const next = editor.replace(context, candidates, options);
            bump();
            return next;
        },
        [editor, bump],
    );

    const clear = React.useCallback<FallbackEditor["clear"]>(
        (context) => {
            const next = editor.clear(context);
            bump();
            return next;
        },
        [editor, bump],
    );

    const saveSettings = React.useCallback(
        async (next: FallbackSettings) => {
            setSettingsSaving(true);
            try {
                const resolved = onSettingsChange
                    ? await onSettingsChange(next)
                    : next;

                setSettings(resolved ?? next);
                return resolved ?? next;
            } finally {
                setSettingsSaving(false);
            }
        },
        [onSettingsChange],
    );

    const value = React.useMemo(() => editor.value(), [editor, version]);
    const state = React.useMemo(() => editor.state(), [editor, version]);

    const ctx = React.useMemo<FallbackEditorContextValue>(
        () => ({
            editor,
            version,

            activeServiceId,
            setActiveServiceId,

            activeTab,
            setActiveTab,

            state,
            value,

            settings,
            settingsSaving,
            saveSettings,

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
            activeServiceId,
            activeTab,
            state,
            value,
            settings,
            settingsSaving,
            saveSettings,
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
