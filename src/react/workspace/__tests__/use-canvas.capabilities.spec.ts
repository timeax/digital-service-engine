import { describe, expect, it } from "vitest";
import type { ServiceProps } from "@/schema";
import type { CanvasSelection } from "@/react/workspace/context/hooks/use-canvas";
import { deriveSelectionCapabilities } from "@/react/workspace/context/hooks/use-canvas";

function makeSelection(ids: readonly string[]): CanvasSelection {
    const tagIds = ids.filter((id) => id.startsWith("t:"));
    const fieldIds = ids.filter((id) => id.startsWith("f:"));
    const optionIds = ids.filter((id) => id.startsWith("o:"));
    return { ids, tagIds, fieldIds, optionIds };
}

describe("deriveSelectionCapabilities", () => {
    it("detects selected tag/field/option kinds", () => {
        const caps = deriveSelectionCapabilities(
            { filters: [], fields: [] },
            makeSelection(["t:a", "f:b", "o:c"]),
        );
        expect(caps.hasTags).toBe(true);
        expect(caps.hasFields).toBe(true);
        expect(caps.hasOptions).toBe(true);
        expect(caps.canRebind).toBe(true);
        expect(caps.canIncludeExcludeTargets).toBe(true);
    });

    it("detects selected service-bearing tags/fields/options", () => {
        const props: ServiceProps = {
            filters: [{ id: "t:a", label: "A", service_id: 1 }],
            fields: [
                { id: "f:b", label: "B", type: "text", button: true, service_id: 2 } as any,
                {
                    id: "f:c",
                    label: "C",
                    type: "select",
                    options: [{ id: "o:c1", label: "C1", service_id: 3 }],
                } as any,
            ],
        };
        const caps = deriveSelectionCapabilities(
            props,
            makeSelection(["t:a", "f:b", "o:c1"]),
        );
        expect(caps.hasServiceBearingNodes).toBe(true);
    });

    it("detects selected fields that already have options", () => {
        const props: ServiceProps = {
            filters: [],
            fields: [{ id: "f:a", label: "A", type: "select", options: [{ id: "o:1", label: "One" }] } as any],
        };
        const caps = deriveSelectionCapabilities(props, makeSelection(["f:a"]));
        expect(caps.hasSelectedFieldWithOptions).toBe(true);
    });

    it("detects notices targeting selected nodes and ignores global notices", () => {
        const props: ServiceProps = {
            filters: [],
            fields: [],
            notices: [
                {
                    id: "n:global",
                    type: "public",
                    kind: "label",
                    severity: "info",
                    title: "Global",
                    target: { scope: "global" },
                },
                {
                    id: "n:node",
                    type: "public",
                    kind: "warning",
                    severity: "warning",
                    title: "Node",
                    target: { scope: "node", node_kind: "field", node_id: "f:a" },
                },
            ],
        };

        const withNode = deriveSelectionCapabilities(props, makeSelection(["f:a"]));
        const globalOnly = deriveSelectionCapabilities(props, makeSelection(["f:missing"]));

        expect(withNode.hasNoticesForSelection).toBe(true);
        expect(globalOnly.hasNoticesForSelection).toBe(false);
    });

    it("updates when selection and props/notices change", () => {
        const base: ServiceProps = {
            filters: [{ id: "t:a", label: "A" }],
            fields: [{ id: "f:a", label: "A", type: "text" } as any],
        };
        const a = deriveSelectionCapabilities(base, makeSelection(["t:a"]));
        expect(a.hasTags).toBe(true);
        expect(a.hasNoticesForSelection).toBe(false);

        const b = deriveSelectionCapabilities(
            {
                ...base,
                notices: [
                    {
                        id: "n:node",
                        type: "private",
                        kind: "warning",
                        severity: "warning",
                        title: "Node",
                        target: { scope: "node", node_kind: "tag", node_id: "t:a" },
                    },
                ],
            },
            makeSelection(["t:a"]),
        );
        expect(b.hasNoticesForSelection).toBe(true);
    });
});

