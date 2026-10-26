import { createContext, ReactNode, useCallback, useContext, useRef, useState } from "react";

import Modal from "./Modal";

export interface ConfirmOptions {
  title: string;
  /** Optional detail line under the title. */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, and focus starts on Cancel. */
  danger?: boolean;
}

/** Resolves true if the user confirmed, false if they cancelled, closed or pressed Escape. */
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

interface Pending {
  opts: ConfirmOptions;
  settle: (ok: boolean) => void;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * In-app replacement for window.confirm(). Mount once at the top of the tree;
 * call useConfirm() anywhere below it.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  // Mirrored in a ref so settle() never resolves a stale request.
  const pendingRef = useRef<Pending | null>(null);

  const settle = useCallback((ok: boolean) => {
    pendingRef.current?.settle(ok);
    pendingRef.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        // A second request supersedes one still on screen; the old caller gets false.
        pendingRef.current?.settle(false);
        const next: Pending = { opts, settle: resolve };
        pendingRef.current = next;
        setPending(next);
      }),
    [],
  );

  const danger = pending?.opts.danger ?? false;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={pending !== null} onClose={() => settle(false)} title={pending?.opts.title}>
        {pending && (
          <>
            {pending.opts.body && (
              <p className="muted" style={{ marginBottom: 16 }}>
                {pending.opts.body}
              </p>
            )}
            <div className="row-end">
              <button className="btn" autoFocus={danger} onClick={() => settle(false)}>
                {pending.opts.cancelLabel ?? "Cancel"}
              </button>
              <button
                className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
                autoFocus={!danger}
                onClick={() => settle(true)}
              >
                {pending.opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
