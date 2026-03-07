import React from "react";
import type {
    FallbackRegistration,
    FallbackScopeRef,
    ServiceIdRef,
} from "@/schema";
import {
    useActiveFallbackRegistrations,
    useEligibleServiceList,
    useFallbackEditor,
} from "./useFallbackEditor";
import { FallbackAddCandidatesDialog } from "./FallbackAddCandidatesDialog";
import { FallbackAddRegistrationDialog } from "./FallbackAddRegistrationDialog";

export function FallbackRegistrationsPanel() {
    const { activeServiceId, remove, clear, check } = useFallbackEditor();

    const registrations = useActiveFallbackRegistrations();
    const eligibleServices = useEligibleServiceList();

    const [candidatePickerOpen, setCandidatePickerOpen] = React.useState(false);
    const [candidateContext, setCandidateContext] =
        React.useState<FallbackScopeRef | null>(null);
    const [candidatePrimaryId, setCandidatePrimaryId] = React.useState<
        ServiceIdRef | undefined
    >(undefined);

    const [registrationDialogOpen, setRegistrationDialogOpen] =
        React.useState(false);

    const makeContext = React.useCallback(
        (registration: FallbackRegistration): FallbackScopeRef => {
            if (registration.scope === "global") {
                return {
                    scope: "global",
                    primary: registration.primary,
                };
            }

            return {
                scope: "node",
                nodeId: registration.scopeId!,
            };
        },
        [],
    );

    const openCandidatePicker = React.useCallback(
        (context: FallbackScopeRef, primaryId?: ServiceIdRef) => {
            setCandidateContext(context);
            setCandidatePrimaryId(primaryId);
            setCandidatePickerOpen(true);
        },
        [],
    );

    if (activeServiceId === undefined || activeServiceId === null) {
        return (
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    Select a primary service to start editing.
                </div>
            </section>
        );
    }

    return (
        <>
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            Registered fallbacks
                        </h3>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Use eligible services as fallback candidates for the
                            selected primary.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setRegistrationDialogOpen(true)}
                        className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                        Add registration
                    </button>
                </div>

                <div className="space-y-4">
                    {registrations.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                            No registrations yet for this primary service.
                        </div>
                    ) : (
                        registrations.map((reg, index) => {
                            const context = makeContext(reg);
                            const candidates = reg.services;

                            return (
                                <div
                                    key={`${reg.scope}:${String(reg.scopeId ?? "global")}:${index}`}
                                    className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                                {reg.scope === "global"
                                                    ? "Global registration"
                                                    : `Node · ${reg.scopeId}`}
                                            </div>
                                            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                                Primary #{String(reg.primary)}
                                            </div>
                                        </div>

                                        <span className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                                            {reg.scope}
                                            {reg.scopeId
                                                ? ` · ${reg.scopeId}`
                                                : ""}
                                        </span>
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {candidates.length === 0 ? (
                                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                                No fallback services yet.
                                            </span>
                                        ) : (
                                            candidates.map((candidate) => {
                                                const preview = check(context, [
                                                    candidate,
                                                ]);
                                                const rejected =
                                                    preview.rejected[0];
                                                const tone = rejected
                                                    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                                                    : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";

                                                const service =
                                                    eligibleServices.find(
                                                        (s) =>
                                                            String(s.id) ===
                                                            String(candidate),
                                                    );

                                                return (
                                                    <div
                                                        key={String(candidate)}
                                                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${tone}`}
                                                    >
                                                        <span>
                                                            {service
                                                                ? `#${String(service.id)} · ${service.name ?? "Unnamed"}`
                                                                : `#${String(candidate)}`}
                                                        </span>
                                                        {rejected ? (
                                                            <span className="rounded-full border border-current/20 px-2 py-0.5 text-[10px]">
                                                                {rejected.reasons.join(
                                                                    ", ",
                                                                )}
                                                            </span>
                                                        ) : (
                                                            <span className="rounded-full border border-current/20 px-2 py-0.5 text-[10px]">
                                                                valid
                                                            </span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                remove(
                                                                    context,
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

                                    <div className="mt-4 flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                openCandidatePicker(
                                                    context,
                                                    reg.primary,
                                                )
                                            }
                                            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                        >
                                            Add fallback
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => clear(context)}
                                            className="rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/20"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </section>

            <FallbackAddRegistrationDialog
                open={registrationDialogOpen}
                onClose={() => setRegistrationDialogOpen(false)}
                onSelect={(context, primaryId) => {
                    setRegistrationDialogOpen(false);
                    openCandidatePicker(context, primaryId);
                }}
            />

            <FallbackAddCandidatesDialog
                open={candidatePickerOpen}
                onClose={() => setCandidatePickerOpen(false)}
                context={candidateContext}
                primaryId={candidatePrimaryId}
            />
        </>
    );
}
