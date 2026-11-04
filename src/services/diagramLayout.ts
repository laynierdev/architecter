import dagre from "dagre";
import type { ArchComponent, Relationship } from "@/domain/types";

export const NODE_WIDTH = 190;
export const NODE_HEIGHT = 64;

export interface NodePosition {
  x: number;
  y: number;
}

/** Computes a left-to-right layered layout for the architecture graph. Pure function. */
export function computeLayout(
  components: ArchComponent[],
  relationships: Relationship[],
): Record<string, NodePosition> {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 34, ranksep: 110, marginx: 20, marginy: 20 });
  graph.setDefaultEdgeLabel(() => ({}));

  components.forEach((c) => graph.setNode(c.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  relationships.forEach((r) => graph.setEdge(r.source, r.target));

  dagre.layout(graph);

  const positions: Record<string, NodePosition> = {};
  components.forEach((c) => {
    const n = graph.node(c.id);
    positions[c.id] = { x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 };
  });
  return positions;
}
