"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg";
}

/**
 * Accessible modal built on the native <dialog> element: it traps focus, closes on Escape
 * and restores focus to the previously focused control.
 */
export function Modal({ title, onClose, children, size = "md" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus?.();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`ar-dialog ${size === "lg" ? "ar-dialog-lg" : ""}`}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="ar-dialog-header">
        <h2 id="modal-title" className="h5 mb-0">
          {title}
        </h2>
        <button type="button" className="btn-close" aria-label="Close dialog" onClick={onClose} />
      </div>
      <div className="ar-dialog-body">{children}</div>
    </dialog>
  );
}
