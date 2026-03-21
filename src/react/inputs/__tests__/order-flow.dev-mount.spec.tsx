import { describe, expect, it } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createBuilder } from "@/core";
import type { ServiceProps, ServicePropsNotice } from "@/schema";
import { CanvasAPI } from "@/react/canvas/api";
import { OrderFlowProvider, useOrderFlow, useOrderFlowContext } from "@/react/hooks";
import { registerEntries } from "@/react/inputs/entries";
import { createInputRegistry, type InputDescriptor, Wrapper } from "@/react";

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

function makeNotice(
    id: string,
    title: string,
    severity: "info" | "warning" | "error" = "info",
    target: ServicePropsNotice["target"] = { scope: "global" },
): ServicePropsNotice {
    return {
        id,
        type: "public",
        kind: "label",
        severity,
        target,
        title,
    };
}

function makeProps(noticeTitle: string, optionNoticeTitle: string): ServiceProps {
    return {
        schema_version: "1.0",
        filters: [{ id: "t:root", label: "Root" }],
        fields: [
            {
                id: "f:text",
                type: "text",
                bind_id: "t:root",
                label: "Text input",
            },
            {
                id: "f:select",
                type: "select",
                bind_id: "t:root",
                label: "Select input",
                options: [
                    { id: "o:alpha", label: "Alpha" },
                    { id: "o:beta", label: "Beta" },
                ],
            },
        ],
        notices: [
            makeNotice("f:text", noticeTitle),
            makeNotice("o:alpha", optionNoticeTitle, "warning"),
        ],
    };
}

function makeNodeScopedProps(
    noticeTitle: string,
    optionNoticeTitle: string,
): ServiceProps {
    return {
        schema_version: "1.0",
        filters: [{ id: "t:root", label: "Root" }],
        fields: [
            {
                id: "f:text",
                type: "text",
                bind_id: "t:root",
                label: "Text input",
            },
            {
                id: "f:select",
                type: "select",
                bind_id: "t:root",
                label: "Select input",
                options: [
                    { id: "o:alpha", label: "Alpha" },
                    { id: "o:beta", label: "Beta" },
                ],
            },
        ],
        notices: [
            makeNotice("n:f:text", noticeTitle, "info", {
                scope: "node",
                node_kind: "field",
                node_id: "f:text",
            }),
            makeNotice("n:o:alpha", optionNoticeTitle, "warning", {
                scope: "node",
                node_kind: "option",
                node_id: "o:alpha",
            }),
        ],
    };
}

type CapturedProps = Record<string, Record<string, unknown>>;

function createRegistry(records: CapturedProps) {
    const registry = createInputRegistry();
    registerEntries(registry);

    const withSpy = (kind: "text" | "select") => {
        const descriptor = registry.get(kind);
        if (!descriptor) {
            throw new Error(`Missing descriptor for ${kind}`);
        }

        const SpyComponent = (props: Record<string, unknown>) => {
            records[String(props.id)] = props;
            return React.createElement("div", {
                "data-testid": `${kind}:${String(props.id)}`,
            });
        };

        registry.register(kind, {
            ...descriptor,
            Component: SpyComponent,
        } satisfies InputDescriptor);
    };

    withSpy("text");
    withSpy("select");

    return registry;
}

describe("OrderFlowProvider dev mount regressions", () => {
    it("auto-initializes from dev/service-builder props and keeps raw + wrapper tags reactive", async () => {
        const initialProps = makeProps("Initial field notice", "Initial option notice");
        const updatedProps = makeProps("Updated field notice", "Updated option notice");
        const swappedProps = makeProps("Swapped field notice", "Swapped option notice");

        const initialBuilder = createBuilder();
        initialBuilder.load(initialProps);
        const initialApi = new CanvasAPI(initialBuilder, { autoEmitState: false });

        const swappedBuilder = createBuilder();
        swappedBuilder.load(swappedProps);
        const swappedApi = new CanvasAPI(swappedBuilder, { autoEmitState: false });

        const renderedProps: CapturedProps = {};
        const registry = createRegistry(renderedProps);

        let flow: ReturnType<typeof useOrderFlow> | null = null;
        let ctx: ReturnType<typeof useOrderFlowContext> | null = null;

        function Consumer({
            props,
        }: {
            props: ServiceProps;
        }) {
            flow = useOrderFlow();
            ctx = useOrderFlowContext();

            return (
                <>
                    {props.fields.map((field) => (
                        <Wrapper key={field.id} field={field} />
                    ))}
                </>
            );
        }

        const host = document.createElement("div");
        document.body.appendChild(host);

        let root: Root | null = null;

        const renderApp = async (
            props: ServiceProps,
            builder = initialApi.builder,
            selection = initialApi.selection,
        ) => {
            await act(async () => {
                if (!root) root = createRoot(host);
                root.render(
                    <OrderFlowProvider
                        serviceProps={props}
                        builder={builder}
                        selection={selection}
                        registry={registry}
                    >
                        <Consumer props={props} />
                    </OrderFlowProvider>,
                );
                await flush();
            });
        };

        await renderApp(initialProps);

        expect(flow).not.toBeNull();
        expect(ctx).not.toBeNull();
        expect(flow!.ready).toBe(true);
        expect(ctx!.builder).toBe(initialApi.builder);
        expect(ctx!.selection).toBe(initialApi.selection);
        expect(flow!.raw).toBeDefined();
        expect(flow!.raw).toEqual(initialApi.builder.getProps());
        expect(flow!.raw.notices?.map((notice) => notice.title)).toEqual([
            "Initial field notice",
            "Initial option notice",
        ]);
        expect(
            (renderedProps["f:text"]?.tags as Array<{ label: string }> | undefined)?.map(
                (tag) => tag.label,
            ),
        ).toEqual(["Initial field notice"]);
        expect(
            (
                renderedProps["f:select"]?.options as Array<{
                    id: string;
                    tags?: Array<{ label: string }>;
                }>
            )?.find((option) => option.id === "o:alpha")?.tags?.map((tag) => tag.label),
        ).toEqual(["Initial option notice"]);

        await renderApp(updatedProps);

        expect(flow!.ready).toBe(true);
        expect(ctx!.builder).toBe(initialApi.builder);
        expect(initialApi.builder.getProps().notices?.map((notice) => notice.title)).toEqual([
            "Updated field notice",
            "Updated option notice",
        ]);
        expect(flow!.raw).toEqual(initialApi.builder.getProps());
        expect(flow!.raw.notices?.map((notice) => notice.title)).toEqual([
            "Updated field notice",
            "Updated option notice",
        ]);
        expect(
            (renderedProps["f:text"]?.tags as Array<{ label: string }> | undefined)?.map(
                (tag) => tag.label,
            ),
        ).toEqual(["Updated field notice"]);
        expect(
            (
                renderedProps["f:select"]?.options as Array<{
                    id: string;
                    tags?: Array<{ label: string }>;
                }>
            )?.find((option) => option.id === "o:alpha")?.tags?.map((tag) => tag.label),
        ).toEqual(["Updated option notice"]);

        await renderApp(swappedProps, swappedApi.builder, swappedApi.selection);

        expect(flow!.ready).toBe(true);
        expect(ctx!.builder).toBe(swappedApi.builder);
        expect(ctx!.selection).toBe(swappedApi.selection);
        expect(flow!.raw).toEqual(swappedApi.builder.getProps());
        expect(flow!.raw.notices?.map((notice) => notice.title)).toEqual([
            "Swapped field notice",
            "Swapped option notice",
        ]);
        expect(
            (renderedProps["f:text"]?.tags as Array<{ label: string }> | undefined)?.map(
                (tag) => tag.label,
            ),
        ).toEqual(["Swapped field notice"]);
        expect(
            (
                renderedProps["f:select"]?.options as Array<{
                    id: string;
                    tags?: Array<{ label: string }>;
                }>
            )?.find((option) => option.id === "o:alpha")?.tags?.map((tag) => tag.label),
        ).toEqual(["Swapped option notice"]);

        await act(async () => {
            root?.unmount();
            await flush();
        });
    });

    it("maps node-scoped notices to field and option tags on mount", async () => {
        const props = makeNodeScopedProps(
            "Node-targeted field notice",
            "Node-targeted option notice",
        );

        const builder = createBuilder();
        builder.load(props);
        const api = new CanvasAPI(builder, { autoEmitState: false });

        const renderedProps: CapturedProps = {};
        const registry = createRegistry(renderedProps);

        function Consumer({
            consumerProps,
        }: {
            consumerProps: ServiceProps;
        }) {
            return (
                <>
                    {consumerProps.fields.map((field) => (
                        <Wrapper key={field.id} field={field} />
                    ))}
                </>
            );
        }

        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);

        await act(async () => {
            root.render(
                <OrderFlowProvider
                    serviceProps={props}
                    builder={api.builder}
                    selection={api.selection}
                    registry={registry}
                >
                    <Consumer consumerProps={props} />
                </OrderFlowProvider>,
            );
            await flush();
        });

        expect(
            (renderedProps["f:text"]?.tags as Array<{ label: string }> | undefined)?.map(
                (tag) => tag.label,
            ),
        ).toEqual(["Node-targeted field notice"]);
        expect(
            (
                renderedProps["f:select"]?.options as Array<{
                    id: string;
                    tags?: Array<{ label: string }>;
                }>
            )?.find((option) => option.id === "o:alpha")?.tags?.map((tag) => tag.label),
        ).toEqual(["Node-targeted option notice"]);

        await act(async () => {
            root.unmount();
            host.remove();
            await flush();
        });
    });
});
