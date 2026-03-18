import Node from "./node";
import type { FlowNode } from "@/schema/graph";

function Tag({
    id,
    data: {
        node: { label },
    },
}: FlowNode) {
    return <Node type={"tag"} label={label} id={id} />;
}

export default Tag;
