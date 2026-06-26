import {describe, it, expect} from 'vitest';
import React from 'react';
import {createInputRegistry, resolveInputDescriptor, registerEntries, Provider, useInputsMaybe} from "@/react";
import type {InputDescriptor} from "@/react";
import { createRoot } from "react-dom/client";
import { act } from "react";

function StubA(_: Record<string, unknown>) { return React.createElement('div'); }
function StubB(_: Record<string, unknown>) { return React.createElement('div'); }

describe('InputRegistry variant resolution', () => {
    it('returns the default descriptor when variant not provided', () => {
        const registry = createInputRegistry();

        const defaultDesc: InputDescriptor = { Component: StubA, defaultProps: {foo: 1} };
        registry.register('custom:Rating', defaultDesc); // default variant

        const resolved = resolveInputDescriptor(registry, 'custom:Rating');
        expect(resolved).toBeDefined();
        expect(resolved?.Component).toBe(StubA);
        expect(resolved?.defaultProps).toEqual({foo: 1});
    });

    it('returns the specific variant when registered', () => {
        const registry = createInputRegistry();

        const defaultDesc: InputDescriptor = { Component: StubA };
        const compactDesc: InputDescriptor = { Component: StubB, defaultProps: {size: 'sm'} };

        registry.register('custom:Rating', defaultDesc);                 // default
        registry.register('custom:Rating', compactDesc, 'compact');      // variant

        // explicit variant
        const resolvedCompact = resolveInputDescriptor(registry, 'custom:Rating', 'compact');
        expect(resolvedCompact).toBeDefined();
        expect(resolvedCompact?.Component).toBe(StubB);
        expect(resolvedCompact?.defaultProps).toEqual({size: 'sm'});

        // unknown variant → falls back to default
        const resolvedUnknown = resolveInputDescriptor(registry, 'custom:Rating', 'unknown' as any);
        expect(resolvedUnknown).toBeDefined();
        expect(resolvedUnknown?.Component).toBe(StubA);
    });

    it('registerMany works and fallback-to-default still applies', () => {
        const registry = createInputRegistry();

        const entries = [
            { kind: 'custom:Rating', descriptor: { Component: StubA } },
            { kind: 'custom:Rating', descriptor: { Component: StubB, defaultProps: {size: 'xs'} }, variant: 'compact' },
        ];
        registry.registerMany(entries);

        // exact variant
        const v = resolveInputDescriptor(registry, 'custom:Rating', 'compact');
        expect(v?.Component).toBe(StubB);
        expect(v?.defaultProps).toEqual({size: 'xs'});

        // fallback to default
        const d = resolveInputDescriptor(registry, 'custom:Rating', 'nope' as any);
        expect(d?.Component).toBe(StubA);
    });

    it("supports descriptor options metadata", () => {
        const registry = createInputRegistry();
        const descriptor: InputDescriptor = {
            Component: StubA,
            options: {
                supported: true,
                autoCreate: true,
                defaultLabel: "Option label",
                defaultValue: "option",
                children: {
                    supported: true,
                },
            },
        };

        registry.register("custom:Choice", descriptor);
        const resolved = resolveInputDescriptor(registry, "custom:Choice");
        expect(resolved?.options?.supported).toBe(true);
        expect(resolved?.options?.autoCreate).toBe(true);
        expect(resolved?.options?.children?.supported).toBe(true);
    });

    it("supports descriptor multi metadata", () => {
        const registry = createInputRegistry();
        const descriptor: InputDescriptor = {
            Component: StubA,
            multi: {
                supported: true,
                autoEnable: true,
            },
        };

        registry.register("custom:MultiChoice", descriptor);
        const resolved = resolveInputDescriptor(registry, "custom:MultiChoice");
        expect(resolved?.multi?.supported).toBe(true);
        expect(resolved?.multi?.autoEnable).toBe(true);
    });

    it("registers checkbox single and options variants separately", () => {
        const registry = createInputRegistry();
        registerEntries(registry);

        const single = resolveInputDescriptor(registry, "checkbox");
        const group = resolveInputDescriptor(registry, "checkbox", "options");
        const treeselect = resolveInputDescriptor(registry, "treeselect");
        const select = resolveInputDescriptor(registry, "select");

        expect(single?.defaultProps?.single).toBe(true);
        expect(single?.options?.supported).toBe(false);
        expect(group?.defaultProps?.single).toBe(false);
        expect(group?.options?.supported).toBe(true);
        expect(treeselect?.options?.children?.supported).toBe(true);
        expect(select?.options?.children?.supported).toBeUndefined();
    });
});

describe("useInputsMaybe", () => {
    it("returns null outside provider and context inside provider", async () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        const seen: Array<any> = [];

        function Probe() {
            seen.push(useInputsMaybe());
            return null;
        }

        await act(async () => {
            root.render(React.createElement(Probe));
        });
        expect(seen[0]).toBeNull();

        seen.length = 0;
        await act(async () => {
            root.render(
                React.createElement(
                    Provider,
                    null,
                    React.createElement(Probe),
                ),
            );
        });

        expect(seen[0]).toBeTruthy();
        expect(seen[0].registry).toBeTruthy();

        await act(async () => root.unmount());
        host.remove();
    });
});
