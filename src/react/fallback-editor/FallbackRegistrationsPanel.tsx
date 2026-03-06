import React from "react";
import type { ServiceIdRef } from "@/schema";
import type {
    RegistrationItem,
    ServiceSummary,
    ValidationMessage,
} from "./fallback-editor.types";

type Props = {
    primary?: ServiceSummary;
    registrations: RegistrationItem[];
    services: ServiceSummary[];
    diagnostics: ValidationMessage[];
    onAddRegistration?: () => void;
    onAddCandidate?: (
        registration: RegistrationItem,
        candidate: ServiceIdRef,
    ) => void;
    onRemoveCandidate?: (
        registration: RegistrationItem,
        candidate: ServiceIdRef,
    ) => void;
    onClearRegistration?: (registration: RegistrationItem) => void;
};

export function FallbackRegistrationsPanel({
    primary,
    registrations,
    services,
    diagnostics,
    onAddRegistration,
    onAddCandidate,
    onRemoveCandidate,
    onClearRegistration,
}: Props) {
    const serviceById = (id: ServiceIdRef) =>
        services.find((s) => String(s.id) === String(id));

    const toneFor = (
        registration: RegistrationItem,
        candidate: ServiceIdRef,
    ) => {
        const hit = diagnostics.find(
            (d) =>
                String(d.primary) === String(registration.primary) &&
                d.scope === registration.scope &&
                String(d.scopeId ?? "") ===
                    String(registration.scopeId ?? "") &&
                String(d.candidate ?? "") === String(candidate),
        );
        return hit?.tone ?? "ok";
    };

    const labelFor = (tone: "ok" | "warn" | "error") => {
        if (tone === "error") return "Invalid";
        if (tone === "warn") return "Warning";
        return "Valid";
    };

    return (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Registered fallbacks
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Global and node-scoped registrations for the selected
                        service.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onAddRegistration}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                    Add registration
                </button>
            </div>

            {!primary ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    Select a service to start editing.
                </div>
            ) : registrations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    No registrations yet for this primary service.
                </div>
            ) : (
                <div className="space-y-4">
                    {registrations.map((reg, index) => (
                        <RegistrationCard
                            key={`${reg.scope}:${String(reg.scopeId ?? "global")}:${index}`}
                            registration={reg}
                            services={services}
                            toneFor={toneFor}
                            labelFor={labelFor}
                            onAddCandidate={onAddCandidate}
                            onRemoveCandidate={onRemoveCandidate}
                            onClearRegistration={onClearRegistration}
                            serviceById={serviceById}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

function RegistrationCard({
    registration,
    services,
    toneFor,
    labelFor,
    onAddCandidate,
    onRemoveCandidate,
    onClearRegistration,
    serviceById,
}: {
    registration: RegistrationItem;
    services: ServiceSummary[];
    toneFor: (
        registration: RegistrationItem,
        candidate: ServiceIdRef,
    ) => "ok" | "warn" | "error";
    labelFor: (tone: "ok" | "warn" | "error") => string;
    onAddCandidate?: (
        registration: RegistrationItem,
        candidate: ServiceIdRef,
    ) => void;
    onRemoveCandidate?: (
        registration: RegistrationItem,
        candidate: ServiceIdRef,
    ) => void;
    onClearRegistration?: (registration: RegistrationItem) => void;
    serviceById: (id: ServiceIdRef) => ServiceSummary | undefined;
}) {
    const availableCandidates = services.filter(
        (s) => String(s.id) !== String(registration.primary),
    );

    return (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {registration.scope === "global"
                            ? "Global registration"
                            : `${registration.nodeKind ?? "node"} · ${registration.nodeLabel ?? registration.scopeId}`}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {registration.scope === "global"
                            ? "Used when no node-scoped fallback is selected."
                            : `Node-scoped registration for ${registration.scopeId}.`}
                    </div>
                </div>

                <span className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {registration.scope}
                    {registration.scopeId ? ` · ${registration.scopeId}` : ""}
                </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                {registration.services.length === 0 ? (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        No fallback services yet.
                    </span>
                ) : (
                    registration.services.map((candidate) => {
                        const service = serviceById(candidate);
                        const tone = toneFor(registration, candidate);

                        const toneClasses =
                            tone === "error"
                                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                                : tone === "warn"
                                  ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
                                  : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";

                        return (
                            <div
                                key={String(candidate)}
                                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${toneClasses}`}
                            >
                                <span>
                                    {service
                                        ? `#${String(service.id)} · ${service.name}`
                                        : `#${String(candidate)}`}
                                </span>
                                <span className="rounded-full border border-current/20 px-2 py-0.5 text-[10px]">
                                    {labelFor(tone)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        onRemoveCandidate?.(
                                            registration,
                                            candidate,
                                        )
                                    }
                                    className="text-current/70 hover:text-current"
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                <select
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    defaultValue=""
                    onChange={(e) => {
                        if (!e.target.value) return;
                        onAddCandidate?.(registration, e.target.value);
                        e.currentTarget.value = "";
                    }}
                >
                    <option value="">Select candidate service…</option>
                    {availableCandidates.map((service) => (
                        <option
                            key={String(service.id)}
                            value={String(service.id)}
                        >
                            #{String(service.id)} · {service.name}
                        </option>
                    ))}
                </select>

                <button
                    type="button"
                    onClick={() => onClearRegistration?.(registration)}
                    className="rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/20"
                >
                    Clear
                </button>
            </div>
        </div>
    );
}
