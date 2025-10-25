import * as React from "react";
import { useBottomBar } from "@/layout/bottom-bar-context";
import { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

export const BottomOverlay: React.FC<PropsWithChildren> = ({ children }) => {
    const bar = useBottomBar();

    return (
        <BottomBarPanel
            isOpen={bar.isOpen}
            onOpenChange={bar.setOpen}
            heightPx={bar.heightPx}
            onHeightChange={bar.setHeight}
            minHeightPx={bar.minHeightPx}
            ariaLabel="Services Library"
            className="bg-background"
            zIndex={30}
        >
            {children}
        </BottomBarPanel>
    );
};

export interface BottomBarPanelProps {
    /** Controlled open state */
    isOpen: boolean;
    onOpenChange: (next: boolean) => void;

    /** Controlled height (px) */
    heightPx: number;
    onHeightChange: (px: number) => void;

    /** Bounds */
    minHeightPx?: number; // default: 240
    maxHeightPx?: number; // default: 90vh (computed)

    /** Styling / a11y */
    className?: string;
    zIndex?: number; // default: 30
    ariaLabel?: string;

    children: React.ReactNode;
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

/**
 * A non-modal, bottom-anchored PANEL (not a dialog).
 * - Full-width, sits inside a relatively-positioned parent (your WorkspaceLayout root is relative).
 * - Slides up/down via CSS transform.
 * - Resizes from an INVISIBLE top edge (4px) with a row-resize cursor.
 * - No overlay, no focus trap, no role=dialog — just role="region".
 */
const BottomBarPanel: React.FC<BottomBarPanelProps> = ({
    isOpen,
    onOpenChange,
    heightPx,
    onHeightChange,
    minHeightPx = 240,
    maxHeightPx,
    className,
    zIndex = 30,
    ariaLabel = "Bottom panel",
    children,
}) => {
    const [vh, setVh] = React.useState<number>(
        typeof window !== "undefined" ? window.innerHeight : 800,
    );

    React.useEffect(() => {
        const onResize = (): void => setVh(window.innerHeight);
        window.addEventListener("resize", onResize, { passive: true });
        return () => window.removeEventListener("resize", onResize);
    }, []);

    const computedMax: number = React.useMemo(() => {
        const ninety = Math.round(vh * 0.9);
        return typeof maxHeightPx === "number"
            ? Math.min(maxHeightPx, ninety)
            : ninety;
    }, [vh, maxHeightPx]);

    // Ensure external height stays within bounds (performant + avoids loops)
    React.useEffect(() => {
        const clamped = clamp(heightPx, minHeightPx, computedMax);
        if (clamped !== heightPx) onHeightChange(clamped);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [heightPx, minHeightPx, computedMax]);

    const clampedHeight = clamp(heightPx, minHeightPx, computedMax);

    // --- Top-edge drag logic (no visible handle) ---
    const dragRef = React.useRef<{
        startY: number;
        startHeight: number;
    } | null>(null);

    const onMouseMove = React.useCallback(
        (e: MouseEvent): void => {
            const st = dragRef.current;
            if (!st) return;
            const dy = st.startY - e.clientY; // dragging upward => increase height
            onHeightChange(
                clamp(st.startHeight + dy, minHeightPx, computedMax),
            );
        },
        [computedMax, minHeightPx, onHeightChange],
    );

    const endDrag = React.useCallback((): void => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", endDrag);
    }, [onMouseMove]);

    const beginDrag = React.useCallback(
        (e: React.MouseEvent<HTMLDivElement>): void => {
            if (e.button !== 0) return; // left button only
            dragRef.current = { startY: e.clientY, startHeight: clampedHeight };
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", endDrag);
            e.preventDefault();
            e.stopPropagation();
        },
        [clampedHeight, onMouseMove, endDrag],
    );

    return (
        <div
            role="region"
            aria-label={ariaLabel}
            className={cn(
                "absolute left-0 right-0",
                "transition-transform duration-200 ease-in-out",
                className,
            )}
            style={{
                bottom: 0,
                height: `${isOpen ? clampedHeight : 0}px`,
                display: isOpen ? "block" : "none",
                transform: isOpen ? "translateY(0)" : "translateY(100%)",
                zIndex,
                pointerEvents: isOpen ? "auto" : "none", // do not block underlying UI when closed
            }}
        >
            {/* Invisible draggable top edge */}
            <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize bottom panel"
                onMouseDown={beginDrag}
                className="absolute top-0 left-0 right-0 h-2 cursor-row-resize z-10"
                style={{ background: "transparent" }}
            />
            {/* Optional subtle hairline: uncomment if you want a visual affordance */}
            {/* <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-muted-foreground/30 mt-1" /> */}

            {/* Content area */}
            <div className="h-full w-full overflow-hidden bg-background border-t">
                {children}
            </div>

            {/* Close on Escape (panel itself doesn't trap focus) */}
            <div
                // Hidden key handler to support Esc close if desired
                tabIndex={-1}
                onKeyDown={(e) => {
                    if (e.key === "Escape" && isOpen) {
                        e.stopPropagation();
                        onOpenChange(false);
                    }
                }}
            />
        </div>
    );
};
