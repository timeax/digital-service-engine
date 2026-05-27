import type { Builder } from "@/core";
import { resolveOrderKind } from "../order-kind";
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
    const visibleFieldIds = builder.visibleFields(tagId, selectedButtonKeys);

    const tagById = new Map((props.filters ?? []).map((t: Tag) => [t.id, t]));
    const fieldById = new Map((props.fields ?? []).map((f: Field) => [f.id, f]));
    const tagConstraints = tagById.get(tagId)?.constraints ?? undefined;
    const selectedOptionsByFieldId = getSelectedOptionsByFieldId(selection, fieldById);

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
        selection,
        selectedOptionsByFieldId,
    );

    const qtyRes = resolveQuantity(
        visibleFieldIds,
        fieldById,
        tagById,
        selection,
        tagId,
        hostDefaultQty,
    );

    const { serviceMap, servicesList } = resolveServices(
        tagId,
        visibleFieldIds,
        selection,
        tagById,
        fieldById,
        services,
    );

    const { min, max } = resolveMinMax(servicesList, services);
    const maybeNodeMap =
        typeof (builder as Partial<Builder> & { getNodeMap?: () => any }).getNodeMap ===
        "function"
            ? (builder as Partial<Builder> & { getNodeMap?: () => any }).getNodeMap!()
            : undefined;
    const resolvedOrderKind = resolveOrderKind({
        props,
        activeTagId: tagId,
        selectedTriggerKeys: selectedButtonKeys,
        nodeMap: maybeNodeMap,
    });

    const prunedFallbacks = pruneFallbacksConservative(
        props.fallbacks as any,
        { tagId, constraints: tagConstraints, serviceMap, servicesList },
        services,
        fbSettings,
    );

    const utilities = collectUtilityLineItems(
        visibleFieldIds,
        fieldById,
        selection,
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
                  selection,
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
                selection,
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
            buttons: selectedButtonKeys,
            fields: selectionFields,
        },
        inputs: { form: formValues, selections },
        min,
        max: max ?? min,
        orderKind: resolvedOrderKind.kind,
        orderKindSource: resolvedOrderKind.source,
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
