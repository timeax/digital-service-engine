import React from "react";
import type { ServiceIdRef } from "@/schema";
import { useFallbackEditorContext } from "./FallbackEditorProvider";

export function useFallbackEditor() {
    return useFallbackEditorContext();
}

export function useActiveFallbackRegistrations() {
    const { activeServiceId, get, version } = useFallbackEditorContext();

    return React.useMemo(() => {
        if (activeServiceId === undefined || activeServiceId === null)
            return [];
        return get(activeServiceId);
    }, [activeServiceId, get, version]);
}

export function usePrimaryServiceList() {
    const { primaryServices, version } = useFallbackEditorContext();

    return React.useMemo(() => {
        return Object.values(primaryServices ?? {}) as Array<{
            id: ServiceIdRef;
            name?: string;
            platform?: string;
            rate?: number;
        }>;
    }, [primaryServices, version]);
}

export function useEligibleServiceList() {
    const { eligibleServices, version } = useFallbackEditorContext();

    return React.useMemo(() => {
        return Object.values(eligibleServices ?? {}) as Array<{
            id: ServiceIdRef;
            name?: string;
            platform?: string;
            rate?: number;
        }>;
    }, [eligibleServices, version]);
}
