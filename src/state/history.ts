/** Generic undo/redo history. Pure functions, independent from React. */
export interface History<T> {
  present: T;
  past: T[];
  future: T[];
}

export const MAX_HISTORY = 50;

export const createHistory = <T>(present: T): History<T> => ({ present, past: [], future: [] });

export const canUndo = <T>(h: History<T>) => h.past.length > 0;
export const canRedo = <T>(h: History<T>) => h.future.length > 0;

/** Records a new state. Any redo history is discarded. */
export function push<T>(h: History<T>, next: T): History<T> {
  if (Object.is(next, h.present)) return h;
  return { present: next, past: [...h.past, h.present].slice(-MAX_HISTORY), future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  const previous = h.past[h.past.length - 1];
  if (previous === undefined) return h;
  return { present: previous, past: h.past.slice(0, -1), future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  const [next, ...rest] = h.future;
  if (next === undefined) return h;
  return { present: next, past: [...h.past, h.present], future: rest };
}
