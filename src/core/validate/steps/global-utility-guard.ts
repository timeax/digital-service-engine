// src/core/validate/steps/global-utility-guard.ts
import type { ValidationCtx } from "../shared";
import { isServiceIdRef } from "../shared";
import { walkFieldOptions } from "@/core/options";

export function validateGlobalUtilityGuard(v: ValidationCtx): void {
    if (!v.options.globalUtilityGuard) return;

    let hasUtility: boolean = false;
    let hasBase: boolean = false;

    for (const f of v.fields) {
        for (const { option: o } of walkFieldOptions(f)) {
            if (!isServiceIdRef(o.service_id)) continue;

            const role: string = o.pricing_role ?? f.pricing_role ?? "base";
            if (role === "base") hasBase = true;
            else if (role === "utility") hasUtility = true;

            if (hasUtility && hasBase) break;
        }

        if (hasUtility && hasBase) break;
    }

    if (hasUtility && !hasBase) {
        v.errors.push({
            code: "utility_without_base",
            severity: "warning",
            message:
                "Global utility guard: utility-priced options exist but no base-priced options were found.",
            nodeId: "global",
            details: { scope: "global" },
        });
    }
}
