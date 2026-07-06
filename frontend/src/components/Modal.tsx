import { ReactNode, useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** "md" (560), "wide-md" (720), "wide" (1200), or "full" (viewport minus 32px gutter) */
  size?: "md" | "wide-md" | "wide" | "full";
}

export default function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const boxClass =
    size === "full"
      ? "modal-box modal-full"
      : size === "wide"
        ? "modal-box modal-wide"
        : size === "wide-md"
          ? "modal-box modal-md"
          : "modal-box";

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={boxClass}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        {title && <h2 className="modal-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
