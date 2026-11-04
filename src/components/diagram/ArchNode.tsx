"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ArchComponent } from "@/domain/types";
import { KIND_META } from "@/services/kindMeta";

export type ArchNodeData = {
  component: ArchComponent;
  active: boolean;
  selected: boolean;
  dimmed: boolean;
  [key: string]: unknown;
};
export type ArchNodeType = Node<ArchNodeData, "arch">;

export function ArchNode({ data }: NodeProps<ArchNodeType>) {
  const { component, active, selected, dimmed } = data;
  const meta = KIND_META[component.kind];
  const classes = [
    "arch-node",
    `kind-${component.kind}`,
    active ? "is-active" : "",
    selected ? "is-selected" : "",
    dimmed ? "is-dim" : "",
    component.provenance === "assumption" ? "is-assumption" : "",
  ].join(" ");

  return (
    <div className={classes} title={`${component.name} — ${meta.label}`}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="node-icon" aria-hidden="true">
        <i className={`bi ${meta.icon}`} />
      </div>
      <div className="min-w-0">
        <div className="node-name">{component.name}</div>
        <div className="node-tech">{component.technology}</div>
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
