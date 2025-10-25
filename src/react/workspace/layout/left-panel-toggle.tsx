import React from "react";
import { useLeftPanel } from "./left-panel-context";
import { Button } from "@/components/ui/button";
import { ChevronsLeft, ChevronsRight } from "lucide-react";

export interface LeftPanelToggleProps {
    className?: string;
    size?: "icon" | "sm" | "default" | "lg";
}

export const LeftPanelToggle: React.FC<LeftPanelToggleProps> = ({
    className,
    size = "icon",
}) => {
    const { isCollapsed, toggle } = useLeftPanel();
    return (
        <Button
            variant="ghost"
            size={size}
            className={className}
            onClick={toggle}
            aria-label="Toggle left panel"
        >
            {isCollapsed ? (
                <ChevronsRight className="h-4 w-4" />
            ) : (
                <ChevronsLeft className="h-4 w-4" />
            )}
        </Button>
    );
};
