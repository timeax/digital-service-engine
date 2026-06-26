import { describe, expect, it } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
    Provider,
    createInputRegistry,
    registerEntries,
    resolveInputDescriptor,
    useInputsMaybe,
} from "@/react";
import type { Field, ServiceProps } from "@/schema";

describe("input registry option capability", () => {
    it("stores option capability metadata on descriptors", () => {
        const registry = createInputRegistry();
        registry.register("custom:option", {
            Component: (() => null) as any,
            options: {
                supported: true,
                autoCreate: true,
                defaultLabel: "Option label",
                defaultValue: "option",
                children: {
                    supported: true,
                    autoCreate: true,
                    defaultLabel: "Child option label",
                    defaultValue: "child-option",
                },
            },
        });

        const descriptor = resolveInputDescriptor(registry, "custom:option");
        expect(descriptor?.options?.supported).toBe(true);
        expect(descriptor?.options?.autoCreate).toBe(true);
        expect(descriptor?.options?.children?.supported).toBe(true);
        expect(descriptor?.options?.children?.autoCreate).toBe(true);
    });

    it("stores multi capability metadata on descriptors", () => {
        const registry = createInputRegistry();
        registry.register("custom:multi", {
            Component: (() => null) as any,
            multi: {
                supported: true,
                autoEnable: true,
            },
        });

        const descriptor = resolveInputDescriptor(registry, "custom:multi");
        expect(descriptor?.multi?.supported).toBe(true);
        expect(descriptor?.multi?.autoEnable).toBe(true);
    });

    it("registers checkbox single/default and checkbox options variant separately", () => {
        const registry = createInputRegistry();
        registerEntries(registry);

        const single = resolveInputDescriptor(registry, "checkbox");
        const group = resolveInputDescriptor(registry, "checkbox", "options");
        const chips = resolveInputDescriptor(registry, "chips");
        const treeselect = resolveInputDescriptor(registry, "treeselect");
        const select = resolveInputDescriptor(registry, "select");

        expect(single?.defaultProps?.single).toBe(true);
        expect(single?.options?.supported).toBe(false);
        expect(group?.defaultProps?.single).toBe(false);
        expect(group?.options?.supported).toBe(true);
        expect(group?.multi?.supported).toBe(true);
        expect(group?.multi?.autoEnable).toBe(true);
        expect(chips?.options?.supported).toBe(false);
        expect(chips?.multi).toBeUndefined();
        expect(treeselect?.options?.children?.supported).toBe(true);
        expect(select?.options?.children?.supported).toBeUndefined();
    });

    it("maps nested child options recursively for InputField props", () => {
        const registry = createInputRegistry();
        registerEntries(registry);

        const treeselect = resolveInputDescriptor(registry, "treeselect");
        const field: Field = {
            id: "f:category",
            type: "treeselect",
            label: "Category",
            options: [
                {
                    id: "o:social",
                    label: "Social",
                    children: [
                        {
                            id: "o:instagram",
                            label: "Instagram",
                        },
                    ],
                },
            ],
        };
        const props: ServiceProps = {
            schema_version: "1",
            filters: [],
            fields: [field],
            notices: [
                {
                    id: "n:instagram",
                    type: "public",
                    kind: "label",
                    severity: "info",
                    target: {
                        scope: "node",
                        node_kind: "option",
                        node_id: "o:instagram",
                    },
                    title: "Recommended",
                },
            ],
        };

        const inputProps = treeselect?.adapter?.getInputPropsFromField?.({
            field,
            props,
        }) as any;

        expect(inputProps.options?.[0]?.children?.[0]?.id).toBe(
            "o:instagram",
        );
        expect(inputProps.options?.[0]?.children?.[0]?.tags?.[0]?.label).toBe(
            "Recommended",
        );
    });
});

describe("useInputsMaybe", () => {
    it("returns null outside provider and value inside provider", async () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        let seen: any = "unset";

        function Probe() {
            seen = useInputsMaybe();
            return null;
        }

        await act(async () => {
            root.render(<Probe />);
        });
        expect(seen).toBeNull();

        await act(async () => {
            root.render(
                <Provider>
                    <Probe />
                </Provider>,
            );
        });

        expect(seen).toBeTruthy();
        expect(seen.registry).toBeTruthy();

        await act(async () => root.unmount());
        host.remove();
    });
});
