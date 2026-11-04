"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FlowScenario } from "@/domain/types";

export interface FlowSimulationState {
  runningFlowId: string | null;
  stepIndex: number;
  activeEdgeIds: ReadonlySet<string>;
  /** Increments on every step so edges can restart their animation. */
  runId: number;
  caption: string | null;
  stepMs: number;
}

const BASE_STEP_MS = 1300;
const EMPTY: ReadonlySet<string> = new Set();

/** Plays a flow scenario step by step, exposing which edges are currently "firing". */
export function useFlowSimulation(speed: number) {
  const [state, setState] = useState<FlowSimulationState>({
    runningFlowId: null,
    stepIndex: -1,
    activeEdgeIds: EMPTY,
    runId: 0,
    caption: null,
    stepMs: BASE_STEP_MS,
  });
  const token = useRef(0);
  const speedRef = useRef(speed);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const stop = useCallback(() => {
    token.current += 1;
    clearTimer();
    setState((s) => ({ ...s, runningFlowId: null, stepIndex: -1, activeEdgeIds: EMPTY, caption: null }));
  }, []);

  const play = useCallback((flow: FlowScenario) => {
    token.current += 1;
    const myToken = token.current;
    clearTimer();

    const runStep = (index: number, runId: number) => {
      if (token.current !== myToken) return;
      const step = flow.steps[index];
      if (!step) {
        setState((s) => ({ ...s, runningFlowId: null, stepIndex: -1, activeEdgeIds: EMPTY, caption: null }));
        return;
      }
      const stepMs = BASE_STEP_MS / speedRef.current;
      setState({
        runningFlowId: flow.id,
        stepIndex: index,
        activeEdgeIds: new Set(step.edgeIds),
        runId,
        caption: step.caption,
        stepMs,
      });
      timer.current = setTimeout(() => runStep(index + 1, runId + 1), stepMs);
    };

    runStep(0, Date.now());
  }, []);

  useEffect(() => {
    const t = token;
    return () => {
      t.current += 1;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { state, play, stop };
}
