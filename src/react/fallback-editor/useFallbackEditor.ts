// fallback-editor/useFallbackEditor.ts
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

export function useFallbackValue() {
    const { value } = useFallbackEditorContext();
    return value;
}

export function useFallbackChanged() {
    const { state } = useFallbackEditorContext();
    return state.changed;
}

export function useSetActiveService() {
    const { setActiveServiceId } = useFallbackEditorContext();
    return React.useCallback(
        (serviceId?: ServiceIdRef) => setActiveServiceId(serviceId),
        [setActiveServiceId],
    );
}
