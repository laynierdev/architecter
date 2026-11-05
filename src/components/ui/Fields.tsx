"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { scrollBehavior } from "./motion";

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  textarea?: boolean;
  rows?: number;
  placeholder?: string;
  help?: string;
  type?: string;
  required?: boolean;
}

export function Field({ label, value, onChange, textarea, rows = 3, placeholder, help, type = "text", required }: FieldProps) {
  const id = useId();
  const common = { id, className: "form-control", value, placeholder, required, "aria-describedby": help ? `${id}-help` : undefined };
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label fw-semibold">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {textarea ? <textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} /> : <input {...common} type={type} onChange={(e) => onChange(e.target.value)} />}
      {help && (
        <div id={`${id}-help`} className="form-text">
          {help}
        </div>
      )}
    </div>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}

export function SelectField<T extends string>({ label, value, onChange, options }: SelectProps<T>) {
  const id = useId();
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label fw-semibold">
        {label}
      </label>
      <select id={id} className="form-select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Edits a list of strings, one per line. */
export function LinesField({ label, value, onChange, help }: { label: string; value: string[]; onChange: (v: string[]) => void; help?: string }) {
  return <Field label={label} textarea rows={3} help={help ?? "One item per line."} value={value.join("\n")} onChange={(v) => onChange(v.split("\n"))} />;
}

export const cleanLines = (lines: string[]): string[] => lines.map((l) => l.trim()).filter(Boolean);

export function FormError({ message }: { message: string | null }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  // A message above a long form is useless if it is off screen: bring it into view when it appears.
  useEffect(() => {
    if (message) ref.current?.scrollIntoView?.({ block: "nearest", behavior: scrollBehavior() });
  }, [message]);

  if (!message) return null;
  return (
    <div ref={ref} className="alert alert-danger py-2" role="alert">
      {message}
    </div>
  );
}
