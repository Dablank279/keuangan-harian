import React, { useEffect, useState } from 'react';
import { Lock, Delete } from 'lucide-react';

interface PinLockScreenProps {
  expectedPin: string;
  onUnlock: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({ expectedPin, onUnlock }) => {
  const [entered, setEntered] = useState('');
  const [error, setError] = useState(false);

  const pinLen = expectedPin.length;

  const pushDigit = (digit: string) => {
    if (entered.length >= pinLen) return;
    const next = entered + digit;
    setEntered(next);
    setError(false);

    if (next.length === pinLen) {
      if (next === expectedPin) {
        onUnlock();
      } else {
        setError(true);
        if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
        window.setTimeout(() => setEntered(''), 420);
      }
    }
  };

  const popDigit = () => {
    setEntered((prev) => prev.slice(0, -1));
    setError(false);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') pushDigit(e.key);
      else if (e.key === 'Backspace') popDigit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 min-h-dvh">
      <div className="w-full max-w-xs flex flex-col items-center">
        <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-lg shadow-teal-600/20 mb-5">
          <Lock className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Keuangan Harian</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {error ? 'PIN salah, silakan coba lagi.' : `Masukkan ${pinLen} digit PIN keamanan`}
        </p>

        <div className="flex items-center gap-3.5 my-7">
          {Array.from({ length: pinLen }).map((_, idx) => {
            const filled = idx < entered.length;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                  error
                    ? 'border-rose-500 bg-rose-500 scale-110'
                    : filled
                    ? 'border-teal-600 bg-teal-600 dark:border-teal-400 dark:bg-teal-400 scale-105'
                    : 'border-slate-300 dark:border-slate-700 bg-transparent'
                }`}
              />
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-3.5 w-full">
          {keys.map((k, idx) => {
            if (k === '') return <div key={idx} />;
            if (k === 'del') {
              return (
                <button
                  key={k}
                  type="button"
                  onClick={popDigit}
                  aria-label="Hapus digit"
                  className="h-16 rounded-2xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 active:scale-95 transition"
                >
                  <Delete className="w-6 h-6" />
                </button>
              );
            }
            return (
              <button
                key={k}
                type="button"
                onClick={() => pushDigit(k)}
                className="h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums shadow-xs hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition"
              >
                {k}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
