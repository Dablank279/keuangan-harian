import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import type { ToastItem } from '../types';

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-50 flex flex-col gap-2 pointer-events-none pt-safe"
    >
      {toasts.map((toast) => {
        const icon =
          toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
          ) : toast.type === 'warning' ? (
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : toast.type === 'error' ? (
            <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          ) : (
            <Info className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
          );

        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto animate-fade-in flex items-start gap-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg shadow-slate-900/10 p-3.5"
          >
            <div className="mt-0.5">{icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                {toast.title}
              </p>
              {toast.description && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {toast.description}
                </p>
              )}
              {toast.actionLabel && toast.onAction && (
                <button
                  type="button"
                  onClick={() => {
                    toast.onAction?.();
                    onDismiss(toast.id);
                  }}
                  className="mt-2 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline min-h-[32px] inline-flex items-center"
                >
                  {toast.actionLabel}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Tutup notifikasi"
              className="p-1.5 -m-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
