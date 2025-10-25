import React from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

export interface LeftPanelControls {
    readonly isCollapsed: boolean;
    readonly collapsedSizePct: number; // e.g., 4 (% of group when collapsed)
    readonly lastExpandedSizePct: number; // e.g., 22 (remembered)

    toggle(): void;
    collapse(): void;
    expand(): void;

    attachPanelRef(ref: ImperativePanelHandle | null): void;

    /** Called by the ResizablePanel when it collapses/expands/resizes */
    onPanelCollapsed(): void;
    onPanelExpanded(): void;
    onPanelResized(sizePct: number): void;

    /** Styling helper for the left container */
    getContainerProps(): {
        "data-collapsed": boolean;
        style?: React.CSSProperties;
    };
}

const LeftPanelCtx = React.createContext<LeftPanelControls | null>(null);

export function useLeftPanel(): LeftPanelControls {
    const ctx = React.useContext(LeftPanelCtx);
    if (!ctx)
        throw new Error(
            "useLeftPanel() must be used within <LeftPanelProvider>.",
        );
    return ctx;
}

interface ProviderProps {
    children: React.ReactNode;
    defaultExpandedSizePct?: number; // 0–100
    collapsedSizePct?: number; // 0–100 (small)
}

export function LeftPanelProvider({
    children,
    defaultExpandedSizePct = 22,
    collapsedSizePct = 4,
}: ProviderProps): JSX.Element {
    const panelRef = React.useRef<ImperativePanelHandle | null>(null);
    const [isCollapsed, setIsCollapsed] = React.useState<boolean>(false);
    const [lastExpandedSizePct, setLastExpandedSizePct] =
        React.useState<number>(defaultExpandedSizePct);

    const attachPanelRef = React.useCallback(
        (ref: ImperativePanelHandle | null) => {
            panelRef.current = ref;
        },
        [],
    );

    const collapse = React.useCallback(() => {
        if (!isCollapsed) {
            setIsCollapsed(true);
            panelRef.current?.collapse();
        }
    }, [isCollapsed]);

    const expand = React.useCallback(() => {
        if (isCollapsed) {
            setIsCollapsed(false);
            panelRef.current?.expand();
            if (lastExpandedSizePct > 0) {
                panelRef.current?.resize(lastExpandedSizePct);
            }
        }
    }, [isCollapsed, lastExpandedSizePct]);

    const toggle = React.useCallback(() => {
        (isCollapsed ? expand : collapse)();
    }, [isCollapsed, expand, collapse]);

    const onPanelCollapsed = React.useCallback(() => setIsCollapsed(true), []);
    const onPanelExpanded = React.useCallback(() => setIsCollapsed(false), []);
    const onPanelResized = React.useCallback(
        (sizePct: number) => {
            // Only remember sizes that are meaningfully larger than the rail
            if (sizePct > collapsedSizePct + 1) setLastExpandedSizePct(sizePct);
        },
        [collapsedSizePct],
    );

    const getContainerProps = React.useCallback(() => {
        return { "data-collapsed": isCollapsed } as const;
    }, [isCollapsed]);

    const value: LeftPanelControls = {
        isCollapsed,
        collapsedSizePct,
        lastExpandedSizePct,
        toggle,
        collapse,
        expand,
        attachPanelRef,
        onPanelCollapsed,
        onPanelExpanded,
        onPanelResized,
        getContainerProps,
    };

    return (
        <LeftPanelCtx.Provider value={value}>{children}</LeftPanelCtx.Provider>
    );
}
