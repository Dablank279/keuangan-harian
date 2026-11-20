import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Jika diisi (misal "HAPUS"), pengguna wajib mengetik kata tersebut untuk konfirmasi dua langkah */
  requireKeyword?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  danger = false,
  requireKeyword,
  onConfirm,
  onCancel,
}) => {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const isDisabled = Boolean(requireKeyword && typed.trim().toUpperCase() !== requireKeyword.toUpperCase());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {danger && (
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
            )}
            <h3
              id="confirm-dialog-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Tutup dialog"
            className="min-h-[40px] min-w-[40px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {description}
        </p>

        {requireKeyword && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Ketik <span className="font-semibold text-rose-600 dark:text-rose-400">{requireKeyword}</span> untuk melanjutkan:
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireKeyword}
              autoFocus
              className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isDisabled}
            onClick={onConfirm}
            className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              danger
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
