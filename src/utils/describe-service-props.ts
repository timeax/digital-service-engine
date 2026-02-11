// src/utils/describe-service-props.ts
import type { Field, FieldOption, ServiceProps, Tag } from "@/schema";

export type ServicePropsDebug = {
    schema_version: string | null;

    counts: {
        filters: number;
        fields: number;

        tagsWithService: number;
        buttonFieldsWithService: number;

        optionsTotal: number;
        optionsWithService: number;
        optionsWithServiceIgnoredAsUtility: number;

        includesForButtonsKeys: number;
        includesForButtonsTargets: number;

        excludesForButtonsKeys: number;
        excludesForButtonsTargets: number;

        fallbacksNodesKeys: number;
        fallbacksNodesRefs: number;
        fallbacksGlobalRefs: number;
    };

    services: {
        all: number[];
        byOrigin: Record<string, number[]>;
    };

    warnings: string[];

    toString(): string;
};

function uniq(nums: number[]): number[] {
    return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function countTargets(map?: Record<string, string[]>): number {
    if (!map) return 0;
    let n = 0;
    for (const v of Object.values(map)) n += v?.length ?? 0;
    return n;
}

function pushOrigin(
    byOrigin: Record<string, number[]>,
    origin: string,
    id: number,
) {
    (byOrigin[origin] ??= []).push(id);
}

function isUtilityOption(opt: FieldOption): boolean {
    // Defensive: tests show a "utility" option with a service_id should be ignored.
    // pricing_role is optional on FieldOption; treat 'utility' as utility. 1
    return opt.pricing_role === "utility";
}

export function describeServiceProps(props: ServiceProps): ServicePropsDebug {
    const byOrigin: Record<string, number[]> = {};
    const warnings: string[] = [];

    const tags: Tag[] = Array.isArray(props.filters) ? props.filters : []; // 2
    const fields: Field[] = Array.isArray(props.fields) ? props.fields : [];

    // ── tags -> service ids
    let tagsWithService = 0;
    for (const t of tags) {
        const sid = t.service_id;
        if (typeof sid === "number" && Number.isFinite(sid)) {
            tagsWithService++;
            pushOrigin(byOrigin, `tag:${t.id}`, sid); // Tag has id + optional service_id 3
        }
    }

    // ── fields/options -> service ids
    let buttonFieldsWithService = 0;

    let optionsTotal = 0;
    let optionsWithService = 0;
    let optionsWithServiceIgnoredAsUtility = 0;

    for (const f of fields) {
        // Field can be a "button" and then may carry service_id 4
        const isButton = (f as any).button === true;
        const fieldService = (f as any).service_id;

        if (
            isButton &&
            typeof fieldService === "number" &&
            Number.isFinite(fieldService)
        ) {
            buttonFieldsWithService++;
            pushOrigin(byOrigin, `field:${f.id}`, fieldService);
        }

        const opts = (f.options ?? []) as FieldOption[];
        optionsTotal += opts.length;

        for (const o of opts) {
            const sid = o.service_id; // FieldOption may carry service_id 5
            if (typeof sid !== "number" || !Number.isFinite(sid)) continue;

            if (isUtilityOption(o)) {
                optionsWithServiceIgnoredAsUtility++;
                warnings.push(
                    `Option "${o.id}" on field "${f.id}" has pricing_role="utility" but also service_id=${sid} (ignored).`,
                );
                continue;
            }

            optionsWithService++;
            pushOrigin(byOrigin, `option:${o.id}`, sid);
        }
    }

    // ── includes/excludes for buttons (optional maps)
    const inc = props.includes_for_buttons;
    const exc = props.excludes_for_buttons;

    // ── fallbacks (optional)
    const fb = props.fallbacks as any;
    const nodes = fb?.nodes && typeof fb.nodes === "object" ? fb.nodes : null;
    const global =
        fb?.global && typeof fb.global === "object" ? fb.global : null;

    const fallbackNodeKeys = nodes ? Object.keys(nodes).length : 0;
    const fallbackNodeRefs = nodes
        ? Object.values(nodes).reduce(
              (n: number, v: any) => n + (Array.isArray(v) ? v.length : 0),
              0,
          )
        : 0;

    const fallbackGlobalRefs = global
        ? Object.values(global).reduce(
              (n: number, v: any) => n + (Array.isArray(v) ? v.length : 0),
              0,
          )
        : 0;

    // ── flatten
    const allServices = uniq(
        Object.values(byOrigin).flatMap((arr) =>
            arr.filter((x) => typeof x === "number"),
        ),
    );

    // ── normalize byOrigin lists
    for (const k of Object.keys(byOrigin)) byOrigin[k] = uniq(byOrigin[k]);

    const schema_version =
        typeof props.schema_version === "string" ? props.schema_version : null;

    const out: ServicePropsDebug = {
        schema_version,

        counts: {
            filters: tags.length,
            fields: fields.length,

            tagsWithService,
            buttonFieldsWithService,

            optionsTotal,
            optionsWithService,
            optionsWithServiceIgnoredAsUtility,

            includesForButtonsKeys: inc ? Object.keys(inc).length : 0,
            includesForButtonsTargets: countTargets(inc),

            excludesForButtonsKeys: exc ? Object.keys(exc).length : 0,
            excludesForButtonsTargets: countTargets(exc),

            fallbacksNodesKeys: fallbackNodeKeys,
            fallbacksNodesRefs: fallbackNodeRefs,
            fallbacksGlobalRefs: fallbackGlobalRefs,
        },

        services: {
            all: allServices,
            byOrigin,
        },

        warnings,

        toString() {
            const lines: string[] = [];
            lines.push(`ServiceProps`);
            lines.push(`- schema_version: ${schema_version ?? "(none)"}`);
            lines.push(
                `- filters: ${tags.length} (with service_id: ${tagsWithService})`,
            );
            lines.push(
                `- fields: ${fields.length} (button fields with service_id: ${buttonFieldsWithService})`,
            );
            lines.push(
                `- options: ${optionsTotal} (with service_id: ${optionsWithService}, ignored utility+service_id: ${optionsWithServiceIgnoredAsUtility})`,
            );
            lines.push(
                `- includes_for_buttons: keys=${inc ? Object.keys(inc).length : 0}, targets=${countTargets(inc)}`,
            );
            lines.push(
                `- excludes_for_buttons: keys=${exc ? Object.keys(exc).length : 0}, targets=${countTargets(exc)}`,
            );
            lines.push(
                `- fallbacks: nodesKeys=${fallbackNodeKeys}, nodeRefs=${fallbackNodeRefs}, globalRefs=${fallbackGlobalRefs}`,
            );
            lines.push(`- service IDs referenced: [${allServices.join(", ")}]`);

            if (warnings.length) {
                lines.push(`- warnings:`);
                for (const w of warnings) lines.push(`  - ${w}`);
            }

            return lines.join("\n");
        },
    };

    return out;
}
