import { WorkspaceLayout } from "@/layout/workspace-layout";
import { LeftPanelProvider } from "@/layout/left-panel-context";
import { BottomBarProvider } from "@/layout/bottom-bar-context";

export const Workspace = () => {
    return (
        <BottomBarProvider>
            <LeftPanelProvider>
                <WorkspaceLayout>
                    <div>Workspace Left</div>
                    <div>Workspace Middle</div>
                    <div>Workspace Right</div>
                    <div>Workspace Bottom</div>
                </WorkspaceLayout>
            </LeftPanelProvider>
        </BottomBarProvider>
    );
};
