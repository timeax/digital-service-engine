import type { FallbackSettings } from "@/schema/validation";
import { normalizeRatePolicy } from "../util";

export function toSnapshotPolicy(settings: FallbackSettings): {
    ratePolicy:
        | { kind: "eq_primary" }
        | { kind: "lte_primary"; pct: number }
        | { kind: "within_pct"; pct: number }
        | { kind: "at_least_pct_lower"; pct: number };
    requireConstraintFit: boolean;
} {
    return {
        ratePolicy: normalizeRatePolicy(settings.ratePolicy),
        requireConstraintFit: settings.requireConstraintFit ?? true,
    };
}
