"use client";

/**
 * 저장·삭제 후 토스트. 프로토타입에는 없던 요소로,
 * README "구현 시 추가로 필요한 것 — 저장 후 토스트"에 해당한다.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import clsx from "clsx";

type ToastTone = "default" | "danger";
type Toast = { id: number; message: string; tone: ToastTone };

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(
  null,
);

const DURATION_MS = 3200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((message: string, tone: ToastTone = "default") => {
    const id = (seq.current += 1);
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATION_MS);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-[26px] left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-[8px]"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "rounded-ctl px-[16px] py-[11px] text-cell leading-none shadow-modal",
              t.tone === "danger"
                ? "bg-danger-fg text-on-dark"
                : "bg-dark text-on-dark",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast는 ToastProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
