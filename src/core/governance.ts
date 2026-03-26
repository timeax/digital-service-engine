import type { FallbackSettings, RatePolicy, ValidatorOptions } from "@/schema";
import { normalizeRatePolicy } from "@/utils/util";

export const DEFAULT_FALLBACK_SETTINGS: Readonly<FallbackSettings> = {
    requireConstraintFit: true,
    ratePolicy: { kind: "lte_primary", pct: 5 },
    selectionStrategy: "priority",
    mode: "strict",
};

export function resolveGlobalRatePolicy(
    options: Pick<ValidatorOptions, "ratePolicy">,
): RatePolicy {
    return normalizeRatePolicy(options.ratePolicy);
}

export function resolveFallbackSettings(
    options: Pick<ValidatorOptions, "fallbackSettings">,
): FallbackSettings {
    return {
        ...DEFAULT_FALLBACK_SETTINGS,
        ...(options.fallbackSettings ?? {}),
    };
}

export function mergeValidatorOptions(
    defaults: ValidatorOptions = {},
    overrides: ValidatorOptions = {},
): ValidatorOptions {
    const mergedFallbackSettings = {
        ...(defaults.fallbackSettings ?? {}),
        ...(overrides.fallbackSettings ?? {}),
    };

    return {
        ...defaults,
        ...overrides,
        policies: overrides.policies ?? defaults.policies,
        ratePolicy: overrides.ratePolicy ?? defaults.ratePolicy,
        fallbackSettings:
            Object.keys(mergedFallbackSettings).length > 0
                ? mergedFallbackSettings
                : undefined,
    };
}
