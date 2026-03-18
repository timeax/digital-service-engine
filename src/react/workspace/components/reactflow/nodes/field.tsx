import Node from "./node";
import { FlowNode } from "@/schema/graph";

function Field(props: FlowNode) {
    const {
        id,
        data: {
            node: { label },
        },
    } = props;
    return (
        <Node label={label} id={id} type={"field"}>
            {(label, icon) => {
                return (
                    <span className="flex gap-2 items-center">
                        {icon}
                        {label}
                    </span>
                );
            }}
        </Node>
    );
}

export default Field;
