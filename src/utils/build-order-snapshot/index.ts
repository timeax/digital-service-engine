import type { Builder } from "@/core";
import type {
    Field,
    ServiceProps,
    Tag,
} from "@/schema";
import type { OrderSnapshot } from "@/schema/order";
import type { DgpServiceMap } from "@/schema/provider";
import type { FallbackSettings } from "@/schema/validation";
import { pruneFallbacksConservative } from "./fallbacks";
import { buildInputs } from "./inputs";
import { resolveMinMax } from "./min-max";
import { toSnapshotPolicy } from "./policy";
import { resolveQuantity } from "./quantity";
import { getSelectedOptionsByFieldId, isOptionBased, toSelectedOptionKeys } from "./selection";
import { resolveServices } from "./services";
import type { BuildOrderSelection, BuildOrderSnapshotSettings } from "./types";
import { collectUtilityLineItems } from "./utilities";
import { buildNodeContexts } from "./context";
import { buildDevWarnings } from "./warnings";
import { findOptionOwnerField } from "@/core/options";

export type { BuildOrderSelection, BuildOrderSnapshotSettings } from "./types";

export function buildOrderSnapshot(
    props: ServiceProps,
    builder: Builder,
    selection: BuildOrderSelection,
    services: DgpServiceMap,
    settings: BuildOrderSnapshotSettings = {},
): OrderSnapshot {
    const mode: "prod" | "dev" = settings.mode ?? "prod";
    const hostDefaultQty = Number.isFinite(settings.hostDefaultQuantity ?? 1)
        ? (settings.hostDefaultQuantity as number)
        : 1;

    const fbSettings: FallbackSettings = {
        requireConstraintFit: true,
        ratePolicy: { kind: "lte_primary", pct: 5 },
        selectionStrategy: "priority",
        mode: mode === "dev" ? "dev" : "strict",
        ...(settings.fallback ?? {}),
    };

    const builtAt = new Date().toISOString();
    const tagId = selection.activeTagId;
    const selectedButtonKeys =
        selection.selectedKeys ?? toSelectedOptionKeys(selection.optionSelectionsByFieldId);
    const tagById = new Map((props.filters ?? []).map((t: Tag) => [t.id, t]));
    const fieldById = new Map((props.fields ?? []).map((f: Field) => [f.id, f]));
    const resolve =
        typeof (builder as Partial<Builder> & {
            resolveVisibility?: Builder["resolveVisibility"];
        }).resolveVisibility === "function"
            ? (builder as Partial<Builder> & {
                  resolveVisibility: Builder["resolveVisibility"];
              }).resolveVisibility.bind(builder)
            : undefined;

    let resolvedVisibility = resolve?.(tagId, selectedButtonKeys);
    let visibleFieldIds =
        resolvedVisibility?.fieldIds ?? builder.visibleFields(tagId, selectedButtonKeys);
    const filteredSelectedButtonKeys = filterSelectedKeysByVisibility(
        selectedButtonKeys,
        visibleFieldIds,
        resolvedVisibility?.optionsByFieldId,
        fieldById,
    );

    if (
        resolve &&
        filteredSelectedButtonKeys.join("\u0000") !== selectedButtonKeys.join("\u0000")
    ) {
        resolvedVisibility = resolve(tagId, filteredSelectedButtonKeys);
        visibleFieldIds = resolvedVisibility.fieldIds;
    }

    const effectiveSelection: BuildOrderSelection = {
        ...selection,
        selectedKeys: filteredSelectedButtonKeys,
    };
    const tagConstraints = tagById.get(tagId)?.constraints ?? undefined;
    const selectedOptionsByFieldId = getSelectedOptionsByFieldId(
        effectiveSelection,
        fieldById,
        mode,
        resolvedVisibility?.optionsByFieldId,
    );

    const selectionFields = visibleFieldIds
        .map((fid) => fieldById.get(fid))
        .filter((f): f is Field => !!f)
        .map((f) => {
            const optionIds = isOptionBased(f)
                ? (selectedOptionsByFieldId[f.id] ?? [])
                : undefined;
            return {
                id: f.id,
                type: String(f.type),
                ...(optionIds && optionIds.length ? { selectedOptions: optionIds } : {}),
            };
        });

    const { formValues, selections } = buildInputs(
        visibleFieldIds,
        fieldById,
        effectiveSelection,
        selectedOptionsByFieldId,
    );

    const qtyRes = resolveQuantity(
        visibleFieldIds,
        fieldById,
        tagById,
        effectiveSelection,
        tagId,
        hostDefaultQty,
    );

    const { serviceMap, servicesList } = resolveServices(
        tagId,
        visibleFieldIds,
        effectiveSelection,
        tagById,
        fieldById,
        services,
    );

    const { min, max } = resolveMinMax(servicesList, services);
    const prunedFallbacks = pruneFallbacksConservative(
        props.fallbacks as any,
        { tagId, constraints: tagConstraints, serviceMap, servicesList },
        services,
        fbSettings,
    );

    const utilities = collectUtilityLineItems(
        visibleFieldIds,
        fieldById,
        effectiveSelection,
        selectedOptionsByFieldId,
        qtyRes.quantity,
    );

    const warnings =
        mode === "dev"
            ? buildDevWarnings(
                  props,
                  services,
                  prunedFallbacks.original,
                  fieldById,
                  visibleFieldIds,
                  effectiveSelection,
              )
            : undefined;

    const meta = {
        schema_version: props.schema_version,
        workspaceId: settings.workspaceId,
        builder: settings.builderCommit ? { commit: settings.builderCommit } : undefined,
        context: {
            tag: tagId,
            constraints: (tagConstraints ?? {}) as Record<
                "refill" | "cancel" | "dripfeed",
                boolean | undefined
            >,
            nodeContexts: buildNodeContexts(
                tagId,
                visibleFieldIds,
                fieldById,
                effectiveSelection,
                selectedOptionsByFieldId,
            ),
            policy: toSnapshotPolicy(fbSettings),
        },
    };

    return {
        version: "1",
        mode,
        builtAt,
        selection: {
            tag: tagId,
            buttons: filteredSelectedButtonKeys,
            fields: selectionFields,
        },
        inputs: { form: formValues, selections },
        min,
        max: max ?? min,
        quantity: qtyRes.quantity,
        quantitySource: qtyRes.source,
        services: servicesList,
        serviceMap,
        ...(prunedFallbacks.pruned ? { fallbacks: prunedFallbacks.pruned } : {}),
        ...(utilities.length ? { utilities } : {}),
        ...(warnings ? { warnings } : {}),
        meta,
    };
}

function filterSelectedKeysByVisibility(
    selectedKeys: string[],
    visibleFieldIds: string[],
    optionsByFieldId: Record<string, string[]> | undefined,
    fieldById: Map<string, Field>,
): string[] {
    if (!optionsByFieldId) return selectedKeys;

    const visibleFields = new Set(visibleFieldIds);
    const out: string[] = [];

    for (const rawKey of selectedKeys) {
        const key = String(rawKey);
        if (fieldById.has(key)) {
            if (visibleFields.has(key)) out.push(key);
            continue;
        }

        const owner = findOptionOwnerField(fieldById.values(), key);

        if (!owner || !visibleFields.has(owner.id)) continue;

        const allowed = optionsByFieldId[owner.id];
        if (allowed && !allowed.includes(key)) continue;
        out.push(key);
    }

    return out;
}
