import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { differenceInDays, isSameMonth, parseISO } from 'date-fns';
import type {
  AppData,
  AppSettings,
  Budget,
  Category,
  DriveFolders,
  GoogleUser,
  SyncStatus,
  ToastItem,
  Transaction,
  Wallet,
} from '../types';
import { createEmptyAppData, createSeedAppData } from '../utils/defaults';
import { createId, formatRupiah } from '../utils/format';
import {
  clearAllLocalReceipts,
  deleteLocalReceipt,
  getPendingReceipts,
  markReceiptUploaded,
} from '../utils/receiptStore';
import {
  createDriveBackup,
  DriveServiceError,
  ensureDriveStructure,
  fetchGoogleUserProfile,
  getStoredFolders,
  getStoredToken,
  getStoredUser,
  readRemoteAppData,
  requestGoogleAccessToken,
  signOutGoogle,
  uploadReceiptToDrive,
  writeRemoteAppData,
} from '../services/drive';
import { useOnlineStatus } from './useOnlineStatus';

const STORAGE_KEY = 'keuangan_harian_data_v1';

function loadInitialData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed && Array.isArray(parsed.transactions) && Array.isArray(parsed.wallets)) {
        return parsed;
      }
    }
  } catch {
    // Jika rusak, pakai data awal
  }
  const seeded = createSeedAppData();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  } catch {
    // Abaikan kuota penuh
  }
  return seeded;
}

export function useFinanceStore() {
  const isOnline = useOnlineStatus();
  const [data, setData] = useState<AppData>(loadInitialData);
  const [user, setUser] = useState<GoogleUser | null>(getStoredUser);
  const [folders, setFolders] = useState<DriveFolders | null>(getStoredFolders);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    getStoredToken() ? (navigator.onLine ? 'synced' : 'offline_pending') : 'local'
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [pendingUploadCount, setPendingUploadCount] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => !loadInitialData().settings.pinCode);

  const dataRef = useRef(data);
  dataRef.current = data;
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const syncTimerRef = useRef<number | null>(null);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = createId('toast');
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4800);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Sinkronisasi tema terang/gelap + meta theme-color untuk status bar Android/iOS
  useEffect(() => {
    const applyTheme = () => {
      const mode = data.settings.theme;
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = mode === 'dark' || (mode === 'system' && prefersDark);
      document.documentElement.classList.toggle('dark', isDark);

      const meta = document.getElementById('theme-color-meta') as HTMLMetaElement | null;
      if (meta) {
        meta.content = isDark ? '#020617' : '#f8fafc';
      }
    };

    applyTheme();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [data.settings.theme]);

  // Hitung antrian bukti pembayaran offline
  const refreshPendingUploadCount = useCallback(async () => {
    try {
      const pending = await getPendingReceipts();
      setPendingUploadCount(pending.length);
    } catch {
      setPendingUploadCount(0);
    }
  }, []);

  useEffect(() => {
    refreshPendingUploadCount();
  }, [refreshPendingUploadCount]);

  // Simpan ke localStorage setiap kali state berubah
  const persistLocal = useCallback((next: AppData) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Abaikan jika storage penuh
    }
  }, []);

  // Push transaksi.json ke Google Drive
  const pushToDrive = useCallback(
    async (targetData?: AppData, targetFolders?: DriveFolders | null) => {
      const activeFolders = targetFolders ?? foldersRef.current;
      const token = getStoredToken();
      if (!token || !activeFolders) {
        setSyncStatus('local');
        return;
      }

      if (!navigator.onLine) {
        setSyncStatus('offline_pending');
        return;
      }

      setSyncStatus('syncing');
      setSyncError(null);
      try {
        const updatedFolders = await writeRemoteAppData(activeFolders, targetData ?? dataRef.current);
        setFolders(updatedFolders);
        setSyncStatus('synced');
      } catch (err) {
        const msg =
          err instanceof DriveServiceError
            ? err.message
            : 'Gagal menyinkronkan data ke Google Drive.';
        setSyncError(msg);
        setSyncStatus(navigator.onLine ? 'error' : 'offline_pending');
      }
    },
    []
  );

  const scheduleDriveSync = useCallback(
    (next: AppData) => {
      if (!getStoredToken() || !foldersRef.current) return;
      if (!navigator.onLine) {
        setSyncStatus('offline_pending');
        return;
      }
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
      setSyncStatus('syncing');
      syncTimerRef.current = window.setTimeout(() => {
        pushToDrive(next);
      }, 650);
    },
    [pushToDrive]
  );

  // Helper mutasi state utama: simpan lokal instan, lalu sync Drive
  const updateData = useCallback(
    (updater: (prev: AppData) => AppData) => {
      setData((prev) => {
        const draft = updater(prev);
        const next: AppData = {
          ...draft,
          updatedAt: new Date().toISOString(),
        };
        persistLocal(next);
        scheduleDriveSync(next);
        return next;
      });
    },
    [persistLocal, scheduleDriveSync]
  );

  // Kirim ulang antrian bukti pembayaran offline yang tertunda
  const flushOfflineReceipts = useCallback(
    async (activeFolders?: DriveFolders | null) => {
      const f = activeFolders ?? foldersRef.current;
      if (!f || !getStoredToken() || !navigator.onLine) return;

      const pending = await getPendingReceipts();
      if (pending.length === 0) {
        setPendingUploadCount(0);
        return;
      }

      let uploadedCount = 0;
      for (const item of pending) {
        try {
          const uploaded = await uploadReceiptToDrive({
            folders: f,
            monthFolderName: item.monthFolder,
            fileName: item.fileName,
            mimeType: item.mimeType,
            blob: item.blob,
          });
          await markReceiptUploaded(item.id);
          uploadedCount++;

          updateData((prev) => ({
            ...prev,
            transactions: prev.transactions.map((tx) =>
              tx.id === item.txId && tx.receipt
                ? {
                    ...tx,
                    receipt: {
                      ...tx.receipt,
                      fileId: uploaded.fileId,
                      webViewLink: uploaded.webViewLink,
                      uploadStatus: 'uploaded',
                    },
                  }
                : tx
            ),
          }));
        } catch {
          // Biarkan di antrian untuk percobaan berikutnya
        }
      }

      await refreshPendingUploadCount();
      if (uploadedCount > 0) {
        pushToast({
          type: 'success',
          title: `${uploadedCount} bukti tertunda berhasil diunggah ke Drive`,
        });
      }
    },
    [pushToast, refreshPendingUploadCount, updateData]
  );

  // Sinkronisasi penuh dengan resolusi konflik (updatedAt terbaru menang) + backup mingguan
  const syncWithDrive = useCallback(
    async (explicitFolders?: DriveFolders) => {
      const activeFolders = explicitFolders ?? foldersRef.current;
      if (!activeFolders || !getStoredToken()) return;

      if (!navigator.onLine) {
        setSyncStatus('offline_pending');
        return;
      }

      setSyncStatus('syncing');
      setSyncError(null);
      try {
        const remote = await readRemoteAppData(activeFolders);
        const local = dataRef.current;
        let resolvedData = local;

        if (remote && remote.updatedAt) {
          const remoteTs = new Date(remote.updatedAt).getTime();
          const localTs = new Date(local.updatedAt).getTime();

          if (remoteTs > localTs) {
            // Data di Drive lebih baru → gunakan data Drive
            resolvedData = remote;
            setData(remote);
            persistLocal(remote);
          } else {
            // Data lokal lebih baru atau sama → perbarui Drive
            const nextFolders = await writeRemoteAppData(activeFolders, local);
            setFolders(nextFolders);
          }
        } else {
          // Belum ada transaksi.json di Drive → unggah data lokal
          const nextFolders = await writeRemoteAppData(activeFolders, local);
          setFolders(nextFolders);
        }

        // Cek backup otomatis mingguan
        const lastBackup = resolvedData.settings.lastAutoBackupAt;
        const needsWeeklyBackup =
          !lastBackup || differenceInDays(new Date(), parseISO(lastBackup)) >= 7;

        if (needsWeeklyBackup) {
          try {
            await createDriveBackup(activeFolders, resolvedData, 'backup_mingguan');
            const withBackupStamp: AppData = {
              ...resolvedData,
              settings: {
                ...resolvedData.settings,
                lastAutoBackupAt: new Date().toISOString(),
              },
            };
            setData(withBackupStamp);
            persistLocal(withBackupStamp);
            await writeRemoteAppData(activeFolders, withBackupStamp);
          } catch {
            // Backup mingguan tidak menghalangi sinkronisasi utama
          }
        }

        setSyncStatus('synced');
        await flushOfflineReceipts(activeFolders);
      } catch (err) {
        const msg =
          err instanceof DriveServiceError
            ? err.message
            : 'Sinkronisasi ke Google Drive gagal.';
        setSyncError(msg);
        setSyncStatus(navigator.onLine ? 'error' : 'offline_pending');
      }
    },
    [flushOfflineReceipts, persistLocal]
  );

  // Otomatis sinkron ulang saat kembali online
  useEffect(() => {
    if (isOnline && getStoredToken() && foldersRef.current) {
      syncWithDrive();
    } else if (!isOnline && getStoredToken()) {
      setSyncStatus('offline_pending');
    }
  }, [isOnline, syncWithDrive]);

  // Login Google + inisialisasi struktur folder Drive
  const loginWithGoogle = useCallback(async () => {
    setIsAuthLoading(true);
    setSyncError(null);
    try {
      await requestGoogleAccessToken('select_account');
      const [profile, driveFolders] = await Promise.all([
        fetchGoogleUserProfile(),
        ensureDriveStructure(),
      ]);
      setUser(profile);
      setFolders(driveFolders);
      await syncWithDrive(driveFolders);
      pushToast({
        type: 'success',
        title: `Berhasil masuk sebagai ${profile.name}`,
        description: 'Folder "Keuangan Harian" siap disinkronkan di Google Drive.',
      });
    } catch (err) {
      const msg =
        err instanceof DriveServiceError
          ? err.message
          : 'Gagal masuk dengan akun Google.';
      setSyncError(msg);
      pushToast({
        type: 'error',
        title: 'Gagal masuk ke Google Drive',
        description: msg,
        actionLabel: err instanceof DriveServiceError && err.code === 'NO_CLIENT_ID' ? undefined : 'Coba lagi',
        onAction: () => {
          loginWithGoogle();
        },
      });
      throw err;
    } finally {
      setIsAuthLoading(false);
    }
  }, [pushToast, syncWithDrive]);

  const logoutGoogle = useCallback(() => {
    signOutGoogle();
    setUser(null);
    setFolders(null);
    setSyncStatus('local');
    setSyncError(null);
    pushToast({
      type: 'info',
      title: 'Keluar dari Google Drive',
      description: 'Data tetap tersimpan aman secara lokal di perangkat ini.',
    });
  }, [pushToast]);

  // Notifikasi otomatis saat anggaran kategori melewati 80% atau 100%
  const checkBudgetAlerts = useCallback(
    (categoryId: string, nextTransactions: Transaction[]) => {
      const budget = dataRef.current.budgets.find((b) => b.categoryId === categoryId);
      if (!budget || budget.limit <= 0) return;

      const now = new Date();
      const spent = nextTransactions
        .filter(
          (t) =>
            t.type === 'expense' &&
            t.categoryId === categoryId &&
            isSameMonth(parseISO(t.date), now)
        )
        .reduce((sum, t) => sum + t.amount, 0);

      const pct = Math.round((spent / budget.limit) * 100);
      const cat = dataRef.current.categories.find((c) => c.id === categoryId);
      const catName = cat ? cat.name : 'Kategori';

      if (pct >= 100) {
        pushToast({
          type: 'error',
          title: `Anggaran ${catName} melebihi batas (${pct}%)`,
          description: `Terpakai ${formatRupiah(spent)} dari batas ${formatRupiah(budget.limit)}.`,
        });
      } else if (pct >= 80) {
        pushToast({
          type: 'warning',
          title: `Anggaran ${catName} hampir penuh (${pct}%)`,
          description: `Sisa anggaran ${formatRupiah(budget.limit - spent)} bulan ini.`,
        });
      }
    },
    [pushToast]
  );

  // CRUD Transaksi
  const saveTransaction = useCallback(
    (txInput: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      const nowIso = new Date().toISOString();
      const isEdit = Boolean(txInput.id);
      const txId = txInput.id || createId('tx');

      let updatedTxList: Transaction[] = [];
      updateData((prev) => {
        const existing = prev.transactions.find((t) => t.id === txId);
        const record: Transaction = {
          ...txInput,
          id: txId,
          createdAt: existing?.createdAt || nowIso,
          updatedAt: nowIso,
        };
        updatedTxList = isEdit
          ? prev.transactions.map((t) => (t.id === txId ? record : t))
          : [record, ...prev.transactions];
        return { ...prev, transactions: updatedTxList };
      });

      refreshPendingUploadCount();

      if (txInput.type === 'expense') {
        checkBudgetAlerts(txInput.categoryId, updatedTxList);
      }
      return txId;
    },
    [checkBudgetAlerts, refreshPendingUploadCount, updateData]
  );

  const deleteTransaction = useCallback(
    async (txId: string) => {
      const target = dataRef.current.transactions.find((t) => t.id === txId);
      if (target?.receipt?.localId) {
        await deleteLocalReceipt(target.receipt.localId).catch(() => {});
      }
      updateData((prev) => ({
        ...prev,
        transactions: prev.transactions.filter((t) => t.id !== txId),
      }));
      refreshPendingUploadCount();
      pushToast({ type: 'info', title: 'Transaksi dihapus' });
    },
    [pushToast, refreshPendingUploadCount, updateData]
  );

  const duplicateTransaction = useCallback(
    (tx: Transaction) => {
      const nowIso = new Date().toISOString();
      const copy: Transaction = {
        ...tx,
        id: createId('tx'),
        date: nowIso.slice(0, 19),
        receipt: undefined, // Jangan duplikat file bukti lama
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      updateData((prev) => ({
        ...prev,
        transactions: [copy, ...prev.transactions],
      }));
      pushToast({ type: 'success', title: 'Transaksi berhasil diduplikat' });
    },
    [pushToast, updateData]
  );

  // CRUD Dompet
  const saveWallet = useCallback(
    (wallet: Omit<Wallet, 'id'> & { id?: string }) => {
      const id = wallet.id || createId('w');
      updateData((prev) => {
        const exists = prev.wallets.some((w) => w.id === id);
        return {
          ...prev,
          wallets: exists
            ? prev.wallets.map((w) => (w.id === id ? { ...wallet, id } : w))
            : [...prev.wallets, { ...wallet, id }],
        };
      });
      pushToast({ type: 'success', title: wallet.id ? 'Dompet diperbarui' : 'Dompet ditambahkan' });
    },
    [pushToast, updateData]
  );

  const deleteWallet = useCallback(
    (walletId: string) => {
      if (dataRef.current.wallets.length <= 1) {
        pushToast({ type: 'warning', title: 'Minimal harus ada 1 dompet aktif' });
        return;
      }
      updateData((prev) => ({
        ...prev,
        wallets: prev.wallets.filter((w) => w.id !== walletId),
      }));
      pushToast({ type: 'info', title: 'Dompet dihapus' });
    },
    [pushToast, updateData]
  );

  // CRUD Kategori
  const saveCategory = useCallback(
    (cat: Omit<Category, 'id'> & { id?: string }) => {
      const id = cat.id || createId('cat');
      updateData((prev) => {
        const exists = prev.categories.some((c) => c.id === id);
        return {
          ...prev,
          categories: exists
            ? prev.categories.map((c) => (c.id === id ? { ...cat, id } : c))
            : [...prev.categories, { ...cat, id }],
        };
      });
      pushToast({ type: 'success', title: cat.id ? 'Kategori diperbarui' : 'Kategori ditambahkan' });
    },
    [pushToast, updateData]
  );

  const deleteCategory = useCallback(
    (categoryId: string) => {
      updateData((prev) => ({
        ...prev,
        categories: prev.categories.filter((c) => c.id !== categoryId),
        budgets: prev.budgets.filter((b) => b.categoryId !== categoryId),
      }));
      pushToast({ type: 'info', title: 'Kategori dihapus' });
    },
    [pushToast, updateData]
  );

  // CRUD Anggaran Bulanan
  const saveBudget = useCallback(
    (budget: Budget) => {
      updateData((prev) => {
        const filtered = prev.budgets.filter((b) => b.categoryId !== budget.categoryId);
        return {
          ...prev,
          budgets: budget.limit > 0 ? [...filtered, budget] : filtered,
        };
      });
      pushToast({ type: 'success', title: 'Anggaran bulanan disimpan' });
    },
    [pushToast, updateData]
  );

  // Pengaturan
  const updateSettings = useCallback(
    (partial: Partial<AppSettings>) => {
      updateData((prev) => ({
        ...prev,
        settings: { ...prev.settings, ...partial },
      }));
    },
    [updateData]
  );

  // Restore seluruh data dari backup JSON (Drive atau lokal)
  const restoreFullData = useCallback(
    (restored: AppData) => {
      const normalized: AppData = {
        ...restored,
        updatedAt: new Date().toISOString(),
      };
      setData(normalized);
      persistLocal(normalized);
      scheduleDriveSync(normalized);
      pushToast({
        type: 'success',
        title: 'Data berhasil dipulihkan',
        description: `${normalized.transactions.length} transaksi telah dimuat kembali.`,
      });
    },
    [persistLocal, pushToast, scheduleDriveSync]
  );

  // Hapus semua data (konfirmasi dua langkah dijalankan di UI)
  const resetAllData = useCallback(async () => {
    await clearAllLocalReceipts().catch(() => {});
    const fresh = createEmptyAppData();
    setData(fresh);
    persistLocal(fresh);
    scheduleDriveSync(fresh);
    setPendingUploadCount(0);
    pushToast({
      type: 'info',
      title: 'Semua data telah dihapus',
      description: 'Dompet dan kategori bawaan telah dikembalikan ke awal.',
    });
  }, [persistLocal, pushToast, scheduleDriveSync]);

  // Hitung saldo real-time tiap dompet
  const walletBalances = useMemo(() => {
    const map = new Map<string, number>();
    data.wallets.forEach((w) => map.set(w.id, w.initialBalance));

    data.transactions.forEach((tx) => {
      if (tx.type === 'income') {
        map.set(tx.walletId, (map.get(tx.walletId) || 0) + tx.amount);
      } else if (tx.type === 'expense') {
        map.set(tx.walletId, (map.get(tx.walletId) || 0) - tx.amount);
      } else if (tx.type === 'transfer') {
        map.set(tx.walletId, (map.get(tx.walletId) || 0) - tx.amount);
        if (tx.toWalletId) {
          map.set(tx.toWalletId, (map.get(tx.toWalletId) || 0) + tx.amount);
        }
      }
    });

    return map;
  }, [data.wallets, data.transactions]);

  const totalBalance = useMemo(() => {
    let sum = 0;
    walletBalances.forEach((val) => {
      sum += val;
    });
    return sum;
  }, [walletBalances]);

  return {
    data,
    isOnline,
    user,
    folders,
    syncStatus,
    syncError,
    isAuthLoading,
    pendingUploadCount,
    toasts,
    isUnlocked,
    setIsUnlocked,
    walletBalances,
    totalBalance,
    pushToast,
    dismissToast,
    loginWithGoogle,
    logoutGoogle,
    syncWithDrive,
    flushOfflineReceipts,
    saveTransaction,
    deleteTransaction,
    duplicateTransaction,
    saveWallet,
    deleteWallet,
    saveCategory,
    deleteCategory,
    saveBudget,
    updateSettings,
    restoreFullData,
    resetAllData,
  };
}
