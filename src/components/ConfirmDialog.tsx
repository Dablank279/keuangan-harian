import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Jika diisi (misal "RESET"), pengguna wajib mengetik kata tersebut untuk mengaktifkan tombol hapus */
  requireKeyword?: string;
  /** Sedang memproses: tampilkan loading dan kunci seluruh tombol agar tidak terklik dua kali */
  loading?: boolean;
  loadingLabel?: string;
  /** Aksi sekunder tambahan (misal "Unduh backup dulu (JSON)") */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  /** Konten tambahan di dalam dialog (ringkasan jumlah item, checkbox, pesan error) */
  children?: React.ReactNode;
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
  loading = false,
  loadingLabel = 'Memproses…',
  secondaryActionLabel,
  onSecondaryAction,
  children,
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
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const keywordNotMatched = Boolean(
    requireKeyword && typed.trim().toUpperCase() !== requireKeyword.toUpperCase()
  );
  const isConfirmDisabled = loading || keywordNotMatched;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs sm:p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl p-5 pb-safe max-h-[90dvh] overflow-y-auto animate-sheet-up sm:animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle khusus mobile bottom sheet */}
        <div className="sm:hidden flex justify-center pb-3 -mt-1">
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
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
            disabled={loading}
            onClick={onCancel}
            aria-label="Tutup dialog"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {description}
        </p>

        {children && <div className="mt-3.5">{children}</div>}

        {secondaryActionLabel && onSecondaryAction && (
          <div className="mt-3.5">
            <button
              type="button"
              disabled={loading}
              onClick={onSecondaryAction}
              className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold text-teal-700 dark:text-teal-400 transition-colors disabled:opacity-50"
            >
              {secondaryActionLabel}
            </button>
          </div>
        )}

        {requireKeyword && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Ketik <span className="font-bold text-rose-600 dark:text-rose-400">{requireKeyword}</span> untuk mengaktifkan tombol hapus:
            </label>
            <input
              type="text"
              value={typed}
              disabled={loading}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireKeyword}
              autoComplete="off"
              className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-60"
            />
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isConfirmDisabled}
            onClick={onConfirm}
            className={`w-full sm:w-auto min-h-[44px] px-4 rounded-xl text-sm font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              danger
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{loading ? loadingLabel : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
