import React, { useState } from 'react';
import { Download, Share, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

const DISMISS_KEY = 'kh_pwa_banner_dismissed';

export const PWABanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [showIosSteps, setShowIosSteps] = useState(false);

  if (isInstalled || dismissed) return null;
  if (!isInstallable && !isIOS) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Abaikan
    }
  };

  return (
    <>
      <div className="mb-4 rounded-2xl bg-teal-50/90 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-800/70 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              Pasang Keuangan Harian di HP
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
              {isIOS
                ? 'Ketuk Bagikan → Tambahkan ke Layar Utama untuk akses offline.'
                : 'Akses lebih cepat seperti aplikasi native, tetap jalan saat offline.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isInstallable ? (
            <button
              type="button"
              onClick={install}
              className="min-h-[40px] px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Pasang
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowIosSteps(true)}
              className="min-h-[40px] px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold whitespace-nowrap"
            >
              Cara Pasang
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Tutup panduan pasang aplikasi"
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showIosSteps && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/55 backdrop-blur-xs p-4"
          onClick={() => setShowIosSteps(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Pasang di iPhone / iPad
            </h3>
            <ol className="mt-3 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="font-semibold text-teal-600 dark:text-teal-400">1.</span>
                <span>
                  Ketuk ikon <strong className="inline-flex items-center gap-1"><Share className="w-3.5 h-3.5" /> Bagikan</strong> di bilah bawah Safari.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-semibold text-teal-600 dark:text-teal-400">2.</span>
                <span>
                  Gulir ke bawah lalu pilih <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-semibold text-teal-600 dark:text-teal-400">3.</span>
                <span>Ketuk <strong>Tambah</strong> di pojok kanan atas.</span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIosSteps(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
};
