"use client";

import { useEffect, useRef } from "react";
import { EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { animate } from "motion";
import { prefersReducedMotion } from "@/components/ui/motion";

export type ArchEdgeData = {
  protocol: string;
  label: string;
  async: boolean;
  active: boolean;
  selected: boolean;
  /** Changes on every simulation step so the pulse restarts. */
  runId: number;
  durationMs: number;
  [key: string]: unknown;
};
export type ArchEdgeType = Edge<ArchEdgeData, "arch">;

/** Trailing offsets (fraction of the path) for the comet tail of the pulse. */
const TAIL = [0, 0.035, 0.07, 0.105];

export function ArchEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }: EdgeProps<ArchEdgeType>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const pathRef = useRef<SVGPathElement>(null);
  const dots = useRef<(SVGCircleElement | null)[]>([]);

  const active = data?.active ?? false;
  const runId = data?.runId ?? 0;
  const durationMs = data?.durationMs ?? 1000;
  const isAsync = data?.async ?? false;
  const color = isAsync ? "var(--pulse-async)" : "var(--pulse-sync)";

  useEffect(() => {
    const hide = () => dots.current.forEach((d) => d?.setAttribute("opacity", "0"));
    const el = pathRef.current;
    // With "reduce motion" the glowing dot does not travel; the highlighted edge and nodes still
    // show which connection is active.
    if (!active || !el || prefersReducedMotion()) {
      hide();
      return;
    }
    const total = el.getTotalLength();
    // Travel takes ~80% of the step so the pulse "lands" before the next step starts.
    const controls = animate(0, 1, {
      duration: (durationMs * 0.8) / 1000,
      ease: "easeInOut",
      onUpdate: (t) => {
        TAIL.forEach((lag, i) => {
          const dot = dots.current[i];
          if (!dot) return;
          const progress = t - lag;
          if (progress <= 0) {
            dot.setAttribute("opacity", "0");
            return;
          }
          const p = el.getPointAtLength(progress * total);
          dot.setAttribute("cx", String(p.x));
          dot.setAttribute("cy", String(p.y));
          dot.setAttribute("opacity", String(1 - i * 0.22));
        });
      },
      onComplete: hide,
    });
    return () => {
      controls.stop();
      hide();
    };
  }, [active, runId, durationMs]);

  const stroke = active ? color : data?.selected ? "var(--ar-primary)" : isAsync ? "#a58ad6" : "#9aa3b8";

  return (
    <>
      <path
        ref={pathRef}
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={active || data?.selected ? 3 : 1.8}
        strokeDasharray={isAsync ? "7 5" : undefined}
        markerEnd={markerEnd}
        style={{ transition: "stroke 0.2s, stroke-width 0.2s" }}
      />
      {/* Wide transparent path: easier to click */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={18} style={{ pointerEvents: "stroke", cursor: "pointer" }} />
      {TAIL.map((_, i) => (
        <circle
          key={i}
          ref={(el) => {
            dots.current[i] = el;
          }}
          r={7 - i * 1.3}
          fill={color}
          opacity={0}
          style={{ filter: `drop-shadow(0 0 7px ${color}) drop-shadow(0 0 14px ${color})`, pointerEvents: "none" }}
        />
      ))}
      <EdgeLabelRenderer>
        <div
          className={`edge-label ${active ? "is-active" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {data?.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
