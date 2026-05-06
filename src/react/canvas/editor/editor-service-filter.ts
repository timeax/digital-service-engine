import {
    filterServicesForVisibleGroup as filterServicesForVisibleGroupCore,
    type FilterServicesForVisibleGroupInput,
} from "@/core";
import type { FallbackSettings, RatePolicy } from "@/schema";
import type { EditorModuleContext, ServiceCheck } from "./editor-types";

export function filterServicesForVisibleGroup(
    ctx: EditorModuleContext,
    candidates: Array<number | string>,
    input: {
        tagId: string;
        selectedButtons?: string[];
        usedServiceIds: Array<number | string>;
        effectiveConstraints?: Partial<Record<"refill" | "cancel" | "dripfeed", boolean>>;
        policies?: unknown;
        ratePolicy?: RatePolicy;
        fallbackSettings?: FallbackSettings;
        /** Backward-compatible alias */
        fallback?: FallbackSettings;
        rateContext?:
            | {
                  mode: "context";
              }
            | {
                  mode: "custom_primary_rate";
                  source: "manual" | "service";
                  primaryRate?: number;
                  primaryServiceId?: number | string;
              };
    },
): ServiceCheck[] {
    const coreInput: FilterServicesForVisibleGroupInput = {
        candidates,
        context: {
            tagId: input.tagId,
            selectedButtons: input.selectedButtons,
            usedServiceIds: input.usedServiceIds,
            effectiveConstraints: input.effectiveConstraints,
            policies: input.policies,
            ratePolicy: input.ratePolicy,
            fallbackSettings: input.fallbackSettings,
            fallback: input.fallback,
            rateContext: input.rateContext,
        },
    };
    const result = filterServicesForVisibleGroupCore(coreInput, {
        builder: ctx.builder,
    });
    ctx.setLastPolicyDiagnostics(result.diagnostics);
    return result.checks;
}
