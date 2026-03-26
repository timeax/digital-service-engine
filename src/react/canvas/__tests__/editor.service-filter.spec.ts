import { describe, expect, it } from "vitest";
import {
    createBuilder,
    filterServicesForVisibleGroup as filterServicesForVisibleGroupCore,
} from "@/core";
import type { ServiceProps } from "@/schema";
import type { DgpServiceMap } from "@/schema/provider";
import { CanvasAPI } from "../api";

const serviceMap: DgpServiceMap = {
    100: { id: 100, rate: 10, platform_id: "p1" },
    201: { id: 201, rate: 9, platform_id: "p2" },
    202: { id: 202, rate: 8, platform_id: "p1" },
};

function propsWithVisibilitySwitch(): ServiceProps {
    return {
        schema_version: "1.0",
        filters: [{ id: "root", label: "Root", service_id: 100 }],
        fields: [
            {
                id: "f:toggle",
                type: "checkbox",
                label: "Toggle",
                bind_id: "root",
                button: true,
            },
            {
                id: "f:hidden",
                type: "select",
                label: "Hidden",
                options: [{ id: "o:hidden", label: "Hidden", service_id: 201 }],
            },
        ],
        includes_for_buttons: {
            "f:toggle": ["f:hidden"],
        },
    } as unknown as ServiceProps;
}

describe("Editor.filterServicesForVisibleGroup", () => {
    it("delegates to core and returns the same checks", () => {
        const b = createBuilder({ serviceMap });
        b.load(propsWithVisibilitySwitch());

        const api = new CanvasAPI(b, { autoEmitState: false });
        const { editor } = api;
        const policies = [
            {
                id: "no_mix_platform",
                scope: "visible_group",
                subject: "services",
                op: "no_mix",
                projection: "service.platform_id",
                severity: "error",
            },
        ];

        const ctx = {
            tagId: "root",
            selectedButtons: [],
            usedServiceIds: [100, 201],
            policies,
        };
        const editorChecks = editor.filterServicesForVisibleGroup([202], ctx);
        const coreChecks = filterServicesForVisibleGroupCore(
            { candidates: [202], context: ctx },
            { builder: b },
        ).checks;

        expect(editorChecks).toEqual(coreChecks);
    });

    it("forwards selectedButtons context and stores core policy diagnostics", () => {
        const b = createBuilder({ serviceMap });
        b.load(propsWithVisibilitySwitch());

        const api = new CanvasAPI(b, { autoEmitState: false });
        const { editor } = api;

        const visibilityPolicies = [
            {
                id: "no_mix_platform",
                scope: "visible_group",
                subject: "services",
                op: "no_mix",
                projection: "service.platform_id",
                severity: "error",
            },
        ];
        const loosePolicies = [
            { subject: "services", scope: "visible_group", op: "all_true" },
        ];

        const hiddenCtx = {
            tagId: "root",
            selectedButtons: [],
            usedServiceIds: [100, 201],
            policies: visibilityPolicies,
        };
        const shownCtx = {
            ...hiddenCtx,
            selectedButtons: ["f:toggle"],
        };

        const hidden = editor.filterServicesForVisibleGroup([202], hiddenCtx);
        const shown = editor.filterServicesForVisibleGroup([202], shownCtx);
        editor.filterServicesForVisibleGroup([202], {
            ...hiddenCtx,
            policies: loosePolicies,
        });

        expect(hidden[0].passesPolicies).toBe(true);
        expect(shown[0].passesPolicies).toBe(false);
        expect((editor.getLastPolicyDiagnostics() ?? []).length).toBeGreaterThan(0);
    });

    it("uses builder defaults when call-time governance values are omitted", () => {
        const b = createBuilder({
            serviceMap,
            policies: [
                {
                    id: "no_mix_platform",
                    scope: "visible_group",
                    subject: "services",
                    op: "no_mix",
                    projection: "service.platform_id",
                    severity: "error",
                },
            ],
            ratePolicy: { kind: "eq_primary" },
        });
        b.load(propsWithVisibilitySwitch());

        const api = new CanvasAPI(b, { autoEmitState: false });
        const { editor } = api;

        const checks = editor.filterServicesForVisibleGroup([202], {
            tagId: "root",
            selectedButtons: ["f:toggle"],
            usedServiceIds: [100, 201],
        });

        expect(checks[0].passesRate).toBe(false);
        expect(checks[0].passesPolicies).toBe(false);
    });

    it("honors explicit per-call overrides over builder defaults", () => {
        const b = createBuilder({
            serviceMap,
            policies: [
                {
                    id: "no_mix_platform",
                    scope: "visible_group",
                    subject: "services",
                    op: "no_mix",
                    projection: "service.platform_id",
                    severity: "error",
                },
            ],
            ratePolicy: { kind: "eq_primary" },
        });
        b.load(propsWithVisibilitySwitch());

        const api = new CanvasAPI(b, { autoEmitState: false });
        const { editor } = api;

        const checks = editor.filterServicesForVisibleGroup([202], {
            tagId: "root",
            selectedButtons: ["f:toggle"],
            usedServiceIds: [100, 201],
            policies: [],
            ratePolicy: { kind: "within_pct", pct: 30 },
        });

        expect(checks[0].passesRate).toBe(true);
        expect(checks[0].passesPolicies).toBe(true);
    });
});
