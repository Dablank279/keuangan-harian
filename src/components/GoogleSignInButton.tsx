import React from 'react';
import { Cloud, CloudOff, RefreshCw, AlertCircle, Check, Loader2 } from 'lucide-react';
import type { SyncStatus } from '../types';

interface GoogleSignInButtonProps {
  onClick: () => void;
  loading?: boolean;
  fullWidth?: boolean;
  label?: string;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onClick,
  loading = false,
  fullWidth = false,
  label = 'Masuk dengan Google',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`${
        fullWidth ? 'w-full' : ''
      } min-h-[44px] px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-sm font-semibold inline-flex items-center justify-center gap-2.5 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-[0.99] transition whitespace-nowrap disabled:opacity-60`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
      ) : (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          />
        </svg>
      )}
      <span>{loading ? 'Menghubungkan…' : label}</span>
    </button>
  );
};

interface SyncStatusLineProps {
  status: SyncStatus;
  pendingUploads?: number;
  onRetry?: () => void;
  compact?: boolean;
}

export const SyncStatusLine: React.FC<SyncStatusLineProps> = ({
  status,
  pendingUploads = 0,
  onRetry,
  compact = false,
}) => {
  if (status === 'synced') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 whitespace-nowrap">
        <Check className="w-3.5 h-3.5 shrink-0" />
        <span>Tersinkron ✓</span>
        {pendingUploads > 0 && !compact && (
          <span className="text-amber-600 dark:text-amber-400">· {pendingUploads} bukti antri</span>
        )}
      </span>
    );
  }

  if (status === 'syncing') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
        <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 text-teal-600 dark:text-teal-400" />
        <span>Menyinkronkan…</span>
      </span>
    );
  }

  if (status === 'offline_pending') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
        <CloudOff className="w-3.5 h-3.5 shrink-0" />
        <span>{compact ? 'Offline' : 'Offline – menunggu sinkron'}</span>
      </span>
    );
  }

  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline whitespace-nowrap"
      >
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span>Gagal sinkron · Coba lagi</span>
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
      <Cloud className="w-3.5 h-3.5 shrink-0" />
      <span>{compact ? 'Mode Lokal' : 'Tersimpan di perangkat'}</span>
    </span>
  );
};
