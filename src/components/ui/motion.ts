/**
 * Helpers for people who ask their system to reduce motion. The CSS media query covers CSS
 * transitions; animations driven from JavaScript (the flow pulse, smooth scrolling) must check
 * this themselves.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Scroll behaviour that never animates for users who asked for reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
