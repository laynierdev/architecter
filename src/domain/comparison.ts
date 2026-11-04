import { DomainError } from "./common";
import type { Alternative, CriterionId, CriterionWeights } from "./types";

export const CRITERIA: CriterionId[] = ["complexity", "scalability", "reliability", "operations", "cost", "fit"];

export const DEFAULT_WEIGHTS: CriterionWeights = { complexity: 1, scalability: 1, reliability: 1, operations: 1, cost: 1, fit: 1 };

export interface ComparisonRow {
  criterion: CriterionId;
  a: number;
  b: number;
  winner: "a" | "b" | "tie";
}

export interface ComparisonResult {
  rows: ComparisonRow[];
  /** Weighted average on the 1–5 scale. */
  scoreA: number;
  scoreB: number;
  winner: "a" | "b" | "tie";
}

export function validateWeights(weights: CriterionWeights): void {
  const values = CRITERIA.map((c) => weights[c]);
  if (values.some((v) => !Number.isFinite(v) || v < 0)) throw new DomainError("Weights must be non-negative numbers");
  if (values.every((v) => v === 0)) throw new DomainError("At least one criterion must have a weight above zero");
}

/** Weighted average of the ratings of one alternative (1–5). */
export function weightedScore(alt: Alternative, weights: CriterionWeights = DEFAULT_WEIGHTS): number {
  validateWeights(weights);
  const total = CRITERIA.reduce((sum, c) => sum + weights[c], 0);
  return CRITERIA.reduce((sum, c) => sum + alt.ratings[c] * weights[c], 0) / total;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function compareAlternatives(a: Alternative, b: Alternative, weights: CriterionWeights = DEFAULT_WEIGHTS): ComparisonResult {
  const rows: ComparisonRow[] = CRITERIA.map((criterion) => {
    const av = a.ratings[criterion];
    const bv = b.ratings[criterion];
    return { criterion, a: av, b: bv, winner: av === bv ? "tie" : av > bv ? "a" : "b" };
  });
  const scoreA = round1(weightedScore(a, weights));
  const scoreB = round1(weightedScore(b, weights));
  return { rows, scoreA, scoreB, winner: scoreA === scoreB ? "tie" : scoreA > scoreB ? "a" : "b" };
}

export function rankAlternatives(alternatives: Alternative[], weights: CriterionWeights = DEFAULT_WEIGHTS) {
  return alternatives
    .map((alt) => ({ alternative: alt, score: round1(weightedScore(alt, weights)) }))
    .sort((x, y) => y.score - x.score || x.alternative.name.localeCompare(y.alternative.name));
}
