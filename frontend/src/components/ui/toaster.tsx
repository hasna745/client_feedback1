import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "default" | "success" | "destructive";

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface Toast extends ToastInput {
  id: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const icons = {
  default: Info,
  success: CheckCircle2,
  destructive: XCircle,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = Date.now() + Math.random();
      const nextToast = { id, variant: "default" as ToastVariant, ...input };
      setToasts((current) => [...current, nextToast].slice(-4));
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-50 grid w-[min(360px,calc(100vw-2rem))] gap-3">
        {toasts.map((item) => {
          const Icon = icons[item.variant ?? "default"];
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border bg-card p-4 text-sm text-card-foreground shadow-soft",
                item.variant === "success" && "border-emerald-200",
                item.variant === "destructive" && "border-red-200",
              )}
              role="status"
            >
              <div className="flex gap-3">
                <Icon
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    item.variant === "success" && "text-emerald-600",
                    item.variant === "destructive" && "text-red-600",
                    (!item.variant || item.variant === "default") && "text-primary",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.title}</p>
                  {item.description ? (
                    <p className="mt-1 text-muted-foreground">{item.description}</p>
                  ) : null}
                </div>
                <button
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => dismiss(item.id)}
                  type="button"
                  aria-label="Dismiss notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return value;
}
