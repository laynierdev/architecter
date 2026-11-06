/**
 * Visible credit required by the project license (LICENSE, clause 1b). Forks and derived services
 * must keep an equivalent credit visible to their users.
 */
export function Credits({ className = "" }: { className?: string }) {
  return (
    <p className={`fs-xs text-muted-ar ${className}`}>
      Architecter by{" "}
      <a href="https://github.com/laynierdev" target="_blank" rel="noopener noreferrer">
        laynierdev
      </a>{" "}
      ·{" "}
      <a href="https://github.com/laynierdev/architecter" target="_blank" rel="noopener noreferrer">
        Source and license
      </a>
    </p>
  );
}
