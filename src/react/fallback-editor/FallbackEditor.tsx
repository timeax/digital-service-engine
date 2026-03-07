import React from "react";
import type { ServiceIdRef, ServiceProps } from "@/schema";
import type { OrderSnapshot } from "@/schema/order";
import type { FallbackSettings } from "@/schema/validation";
import type { DgpServiceMap } from "@/schema/provider";
import {
    FallbackEditorProvider,
    type FallbackEditorProviderProps,
} from "./FallbackEditorProvider";
import { FallbackEditorHeader } from "./FallbackEditorHeader";
import { FallbackServiceSidebar } from "./FallbackServiceSidebar";
import { FallbackRegistrationsPanel } from "./FallbackRegistrationsPanel";
import { FallbackSettingsPanel } from "./FallbackSettingsPanel";
import { FallbackDetailsPanel } from "./FallbackDetailsPanel";
import { useFallbackEditor } from "@/react/fallback-editor/useFallbackEditor";

type Props = {
    className?: string;
    fallbacks?: ServiceProps["fallbacks"];
    props?: ServiceProps;
    snapshot?: OrderSnapshot;

    primaryServices?: DgpServiceMap;
    eligibleServices?: DgpServiceMap;

    settings?: FallbackSettings;
    initialServiceId?: ServiceIdRef;

    onSettingsChange?: FallbackEditorProviderProps["onSettingsChange"];
    onSave?: FallbackEditorProviderProps["onSave"];
    onValidate?: FallbackEditorProviderProps["onValidate"];
    onReset?: FallbackEditorProviderProps["onReset"];
};

export function FallbackEditor({
    className,
    fallbacks,
    props,
    snapshot,
    primaryServices,
    eligibleServices,
    settings,
    initialServiceId,
    onSettingsChange,
    onSave,
    onValidate,
    onReset,
}: Props) {
    return (
        <FallbackEditorProvider
            fallbacks={fallbacks}
            props={props}
            snapshot={snapshot}
            primaryServices={primaryServices}
            eligibleServices={eligibleServices}
            settings={settings}
            initialServiceId={initialServiceId}
            onSettingsChange={onSettingsChange}
            onSave={onSave}
            onValidate={onValidate}
            onReset={onReset}
        >
            <FallbackEditorInner className={className} />
        </FallbackEditorProvider>
    );
}

function FallbackEditorInner({ className }: { className?: string }) {
    const {
        activeTab,
        setActiveTab,
        activeServiceId,
        saveFallbacks,
        validateFallbacks,
        resetEditor,
        headerSaving,
        headerValidating,
        headerResetting,
    } = useFallbackEditor();

    return (
        <div
            className={[
                "min-h-screen bg-zinc-100 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
        >
            <div className="mx-auto flex max-w-7xl flex-col gap-4">
                <FallbackEditorHeader
                    onReset={resetEditor}
                    onValidate={validateFallbacks}
                    onSave={saveFallbacks as any}
                    resetting={headerResetting}
                    validating={headerValidating}
                    saving={headerSaving}
                />

                <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
                    <FallbackServiceSidebar />

                    <div className="flex min-h-0 flex-col gap-4">
                        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                        {activeServiceId !== undefined
                                            ? `Service #${String(activeServiceId)}`
                                            : "No service selected"}
                                    </h2>
                                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                                        Edit fallback registrations and inspect
                                        validation.
                                    </p>
                                </div>

                                <div className="flex gap-2">
                                    <TabButton
                                        active={activeTab === "registrations"}
                                        onClick={() =>
                                            setActiveTab("registrations")
                                        }
                                    >
                                        Registrations
                                    </TabButton>
                                    <TabButton
                                        active={activeTab === "settings"}
                                        onClick={() => setActiveTab("settings")}
                                    >
                                        Settings
                                    </TabButton>
                                </div>
                            </div>
                        </section>

                        {activeTab === "registrations" ? (
                            <FallbackRegistrationsPanel />
                        ) : (
                            <FallbackSettingsPanel />
                        )}
                    </div>

                    <FallbackDetailsPanel />
                </div>
            </div>
        </div>
    );
}

function TabButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "rounded-xl px-3 py-2 text-sm font-medium transition",
                active
                    ? "bg-blue-600 text-white"
                    : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800",
            ].join(" ")}
        >
            {children}
        </button>
    );
}
