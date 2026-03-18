import Node from "./node";
import type { Node as RFNode, NodeProps } from "@xyflow/react";

type OptionNode = RFNode<{ label: string }, "option">;

function Options({ id, data: { label } }: NodeProps<OptionNode>) {
    return <Node label={label} id={id} type={"option"} />;
}

export default Options;
