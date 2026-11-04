"use client";

import { useMemo } from "react";
import { Background, Controls, MarkerType, MiniMap, ReactFlow, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ArchComponent, Relationship } from "@/domain/types";
import { computeLayout } from "@/services/diagramLayout";
import { ArchEdge, type ArchEdgeType } from "./ArchEdge";
import { ArchNode, type ArchNodeType } from "./ArchNode";

export type Selection = { type: "component" | "relationship"; id: string } | null;

interface Props {
  components: ArchComponent[];
  relationships: Relationship[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  activeEdgeIds: ReadonlySet<string>;
  runId: number;
  stepMs: number;
  simulating: boolean;
}

const nodeTypes = { arch: ArchNode };
const edgeTypes = { arch: ArchEdge };

export function DiagramCanvas({ components, relationships, selection, onSelect, activeEdgeIds, runId, stepMs, simulating }: Props) {
  // Layout depends only on the graph structure, never on selection or animation state.
  const positions = useMemo(() => computeLayout(components, relationships), [components, relationships]);

  const activeNodeIds = useMemo(() => {
    const ids = new Set<string>();
    relationships.forEach((r) => {
      if (activeEdgeIds.has(r.id)) {
        ids.add(r.source);
        ids.add(r.target);
      }
    });
    return ids;
  }, [relationships, activeEdgeIds]);

  const nodes: ArchNodeType[] = components.map((component) => ({
    id: component.id,
    type: "arch",
    position: positions[component.id] ?? { x: 0, y: 0 },
    width: 190,
    height: 64,
    draggable: false,
    data: {
      component,
      active: activeNodeIds.has(component.id),
      selected: selection?.type === "component" && selection.id === component.id,
      dimmed: simulating && !activeNodeIds.has(component.id),
    },
  }));

  const edges: ArchEdgeType[] = relationships.map((rel) => ({
    id: rel.id,
    source: rel.source,
    target: rel.target,
    type: "arch",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: rel.async ? "#a58ad6" : "#9aa3b8" },
    data: {
      protocol: rel.protocol,
      label: rel.label,
      async: rel.async,
      active: activeEdgeIds.has(rel.id),
      selected: selection?.type === "relationship" && selection.id === rel.id,
      runId,
      durationMs: stepMs,
    },
  }));

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges as Edge[]}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      minZoom={0.25}
      maxZoom={1.8}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      onNodeClick={(_, node) => onSelect({ type: "component", id: node.id })}
      onEdgeClick={(_, edge) => onSelect({ type: "relationship", id: edge.id })}
      onPaneClick={() => onSelect(null)}
      proOptions={{ hideAttribution: true }}
      aria-label="Architecture diagram. Click a component or connection to inspect it."
    >
      <Background gap={22} color="#e4e7ef" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeStrokeWidth={2}
        nodeColor={(n) => kindHex((n.data as { component: ArchComponent }).component.kind)}
        style={{ height: 90, width: 140 }}
      />
    </ReactFlow>
  );
}

// MiniMap draws raw SVG attributes where CSS variables are not reliably resolved.
function kindHex(kind: ArchComponent["kind"]): string {
  const map: Record<ArchComponent["kind"], string> = {
    client: "#5c6bc0",
    gateway: "#0f9d8a",
    service: "#2f7be5",
    database: "#d98a00",
    cache: "#d6455d",
    queue: "#8e5bd6",
    external: "#6b7385",
  };
  return map[kind];
}
