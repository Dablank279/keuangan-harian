import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { differenceInDays, format, isSameMonth, parseISO } from 'date-fns';
import type {
  AppData,
  AppSettings,
  Budget,
  Category,
  DriveFolders,
  GoogleUser,
  ResetMode,
  SyncStatus,
  ToastItem,
  Transaction,
  Wallet,
} from '../types';
import {
  DATA_VERSION,
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  DEFAULT_WALLETS,
  createEmptyAppData,
  isLegacyData,
} from '../utils/defaults';
import { createId, formatRupiah } from '../utils/format';
import {
  clearAllLocalReceipts,
  deleteLocalReceipt,
  getPendingReceipts,
  markReceiptUploaded,
} from '../utils/receiptStore';
import {
  createDriveBackup,
  deleteAllDriveReceipts,
  deleteRemoteTransaksiFile,
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
const APP_STORAGE_PREFIXES = ['keuangan_harian_', 'kh_'];

interface InitialLoadResult {
  data: AppData;
  legacyDetected: boolean;
}

interface PendingDriveResetTask {
  mode: ResetMode;
  deleteDriveReceipts: boolean;
  nextData: AppData;
  snapshotBeforeReset: AppData;
  backupFileName: string;
  backupDone: boolean;
}

function normalizeLoadedData(parsed: Partial<AppData>): AppData {
  return {
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    wallets:
      Array.isArray(parsed.wallets) && parsed.wallets.length > 0
        ? parsed.wallets
        : DEFAULT_WALLETS.map((w) => ({ ...w })),
    categories:
      Array.isArray(parsed.categories) && parsed.categories.length > 0
        ? parsed.categories
        : DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(parsed.settings || {}),
    },
  };
}

function loadInitialState(): InitialLoadResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppData>;
      if (parsed && Array.isArray(parsed.transactions) && Array.isArray(parsed.wallets)) {
        const legacyDetected = isLegacyData(parsed);
        return {
          data: normalizeLoadedData(parsed),
          legacyDetected,
        };
      }
    }
  } catch {
    // Jika rusak, mulai dengan data kosong
  }
  const empty = createEmptyAppData();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
  } catch {
    // Abaikan kuota penuh
  }
  return { data: empty, legacyDetected: false };
}

/** Hapus semua key localStorage milik aplikasi saja (tidak menyentuh key milik situs lain) */
function clearAppOwnedLocalStorage(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && APP_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Abaikan jika akses storage dibatasi
  }
}

export function useFinanceStore() {
  const isOnline = useOnlineStatus();
  const [initialState] = useState<InitialLoadResult>(loadInitialState);
  const [data, setData] = useState<AppData>(initialState.data);
  const [hasLegacyPrompt, setHasLegacyPrompt] = useState<boolean>(initialState.legacyDetected);
  const [user, setUser] = useState<GoogleUser | null>(getStoredUser);
  const [folders, setFolders] = useState<DriveFolders | null>(getStoredFolders);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    getStoredToken() ? (navigator.onLine ? 'synced' : 'offline_pending') : 'local'
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [driveResetError, setDriveResetError] = useState<string | null>(null);
  const [pendingUploadCount, setPendingUploadCount] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => !initialState.data.settings.pinCode);

  const dataRef = useRef(data);
  dataRef.current = data;
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const userRef = useRef(user);
  userRef.current = user;
  const syncTimerRef = useRef<number | null>(null);
  const pendingDriveResetRef = useRef<PendingDriveResetTask | null>(null);

  const pushToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = createId('toast');
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5200);
  }, []);

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
        const updatedFolders = await writeRemoteAppData(
          activeFolders,
          targetData ?? dataRef.current
        );
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
          version: DATA_VERSION,
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
        const remoteRaw = await readRemoteAppData(activeFolders);
        const local = dataRef.current;
        let resolvedData = local;

        if (remoteRaw && remoteRaw.updatedAt) {
          const remote = normalizeLoadedData(remoteRaw);
          const remoteTs = new Date(remote.updatedAt).getTime();
          const localTs = new Date(local.updatedAt).getTime();

          if (remoteTs > localTs) {
            resolvedData = remote;
            setData(remote);
            persistLocal(remote);
          } else {
            const nextFolders = await writeRemoteAppData(activeFolders, local);
            setFolders(nextFolders);
          }
        } else {
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
        err instanceof DriveServiceError ? err.message : 'Gagal masuk dengan akun Google.';
      setSyncError(msg);
      pushToast({
        type: 'error',
        title: 'Gagal masuk ke Google Drive',
        description: msg,
        actionLabel:
          err instanceof DriveServiceError && err.code === 'NO_CLIENT_ID' ? undefined : 'Coba lagi',
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
    pendingDriveResetRef.current = null;
    setDriveResetError(null);
    pushToast({
      type: 'info',
      title: 'Keluar dari Google Drive',
      description: 'Data tetap tersimpan aman secara lokal di perangkat ini.',
    });
  }, [pushToast]);

  // Penanganan dialog satu kali untuk data contoh/versi lama
  const resolveLegacyData = useCallback(
    async (action: 'delete' | 'keep') => {
      if (action === 'delete') {
        if (syncTimerRef.current) {
          window.clearTimeout(syncTimerRef.current);
          syncTimerRef.current = null;
        }
        await clearAllLocalReceipts().catch(() => {});
        clearAppOwnedLocalStorage();
        const empty = createEmptyAppData();
        setData(empty);
        persistLocal(empty);
        setPendingUploadCount(0);
        setHasLegacyPrompt(false);
        if (getStoredToken() && foldersRef.current) {
          await pushToDrive(empty, foldersRef.current);
        }
        pushToast({
          type: 'success',
          title: 'Data contoh berhasil dihapus',
          description: 'Anda sekarang memulai dengan catatan keuangan kosong.',
        });
        return;
      }

      const upgraded: AppData = {
        ...dataRef.current,
        version: DATA_VERSION,
        updatedAt: new Date().toISOString(),
      };
      setData(upgraded);
      persistLocal(upgraded);
      setHasLegacyPrompt(false);
      scheduleDriveSync(upgraded);
      pushToast({
        type: 'info',
        title: 'Data sebelumnya disimpan',
        description: 'Anda dapat menghapus atau mereset kapan saja di Pengaturan.',
      });
    },
    [persistLocal, pushToast, pushToDrive, scheduleDriveSync]
  );

  // Eksekutor bagian Drive untuk proses reset (bisa dipanggil ulang via "Coba lagi")
  const runDriveResetPhase = useCallback(
    async (task: PendingDriveResetTask): Promise<{ ok: boolean; warning?: string }> => {
      const activeFolders = foldersRef.current;
      const token = getStoredToken();
      if (!userRef.current || !activeFolders || !token) {
        pendingDriveResetRef.current = null;
        setDriveResetError(null);
        return { ok: true };
      }

      if (!navigator.onLine) {
        const warning =
          'Data lokal berhasil dihapus, namun perubahan di Google Drive tertunda karena koneksi offline.';
        setSyncStatus('offline_pending');
        setDriveResetError(warning);
        pendingDriveResetRef.current = task;
        return { ok: false, warning };
      }

      setSyncStatus('syncing');
      try {
        // 1. Wajib buat backup otomatis di Drive sebelum menghapus/menimpa data Drive
        if (!task.backupDone) {
          await createDriveBackup(
            activeFolders,
            task.snapshotBeforeReset,
            'backup',
            task.backupFileName
          );
          task.backupDone = true;
        }

        // 2. Sinkronkan atau hapus file di Google Drive sesuai mode reset
        if (task.mode === 'full_with_drive') {
          const updatedFolders = await deleteRemoteTransaksiFile(activeFolders);
          setFolders(updatedFolders);
          foldersRef.current = updatedFolders;

          if (task.deleteDriveReceipts) {
            await deleteAllDriveReceipts(updatedFolders);
          }
        } else {
          // Mode A & B: timpa data/transaksi.json dengan state baru agar data lama tidak hidup kembali
          const updatedFolders = await writeRemoteAppData(activeFolders, task.nextData);
          setFolders(updatedFolders);
          foldersRef.current = updatedFolders;
        }

        setSyncStatus('synced');
        setSyncError(null);
        setDriveResetError(null);
        pendingDriveResetRef.current = null;
        return { ok: true };
      } catch (err) {
        const detail =
          err instanceof DriveServiceError
            ? err.message
            : 'Terjadi gangguan saat memperbarui Google Drive.';
        const warning = `Data lokal berhasil dihapus, namun file di Google Drive belum terhapus/tersinkron (${detail}).`;
        setSyncStatus(navigator.onLine ? 'error' : 'offline_pending');
        setSyncError(detail);
        setDriveResetError(warning);
        pendingDriveResetRef.current = task;
        return { ok: false, warning };
      }
    },
    []
  );

  // Reset Data 3 Opsi di Pengaturan (tetap menjaga sesi login Google & folder induk Drive)
  const executeReset = useCallback(
    async (
      mode: ResetMode,
      options?: { deleteDriveReceipts?: boolean }
    ): Promise<{ ok: boolean; driveWarning?: string }> => {
      if (isResetting) {
        return { ok: false };
      }

      setIsResetting(true);
      setDriveResetError(null);

      try {
        if (syncTimerRef.current) {
          window.clearTimeout(syncTimerRef.current);
          syncTimerRef.current = null;
        }

        const snapshotBeforeReset: AppData = JSON.parse(JSON.stringify(dataRef.current));
        const nowIso = new Date().toISOString();
        const backupFileName = `backup-sebelum-reset-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;

        // Bersihkan antrian upload bukti di IndexedDB + cache preview Blob URL
        await clearAllLocalReceipts().catch(() => {});
        setPendingUploadCount(0);

        // Bersihkan localStorage milik aplikasi saja (tidak menyentuh situs lain atau sessionStorage login)
        clearAppOwnedLocalStorage();

        // Bangun state lokal baru sesuai mode reset
        let nextData: AppData;
        if (mode === 'transactions_only') {
          nextData = {
            ...snapshotBeforeReset,
            version: DATA_VERSION,
            updatedAt: nowIso,
            transactions: [],
          };
        } else {
          nextData = createEmptyAppData();
        }

        setData(nextData);
        dataRef.current = nextData;
        persistLocal(nextData);
        setHasLegacyPrompt(false);
        setSyncError(null);

        const isLoggedInDrive = Boolean(userRef.current && foldersRef.current && getStoredToken());
        if (isLoggedInDrive) {
          const task: PendingDriveResetTask = {
            mode,
            deleteDriveReceipts: Boolean(options?.deleteDriveReceipts),
            nextData,
            snapshotBeforeReset,
            backupFileName,
            backupDone: false,
          };
          const driveResult = await runDriveResetPhase(task);
          if (!driveResult.ok && driveResult.warning) {
            pushToast({
              type: 'warning',
              title: 'Data lokal direset, Drive tertunda',
              description: driveResult.warning,
              actionLabel: 'Coba lagi',
              onAction: () => {
                void retryDriveReset();
              },
            });
            return { ok: true, driveWarning: driveResult.warning };
          }
        }

        pushToast({
          type: 'success',
          title: 'Data berhasil direset',
          description:
            mode === 'transactions_only'
              ? 'Semua transaksi dihapus. Dompet, kategori, dan anggaran tetap dipertahankan.'
              : mode === 'full_with_drive'
              ? 'Data lokal dan file di Google Drive berhasil dibersihkan.'
              : 'Aplikasi telah dikembalikan ke pengaturan awal.',
        });
        return { ok: true };
      } finally {
        setIsResetting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isResetting, persistLocal, pushToast, runDriveResetPhase]
  );

  const retryDriveReset = useCallback(async (): Promise<{ ok: boolean; driveWarning?: string }> => {
    const task = pendingDriveResetRef.current;
    if (!task) return { ok: true };
    if (isResetting) return { ok: false };

    setIsResetting(true);
    try {
      const result = await runDriveResetPhase(task);
      if (result.ok) {
        pushToast({
          type: 'success',
          title: 'Google Drive berhasil diperbarui',
          description: 'Sinkronisasi/penghapusan data di Google Drive telah selesai.',
        });
        return { ok: true };
      }
      pushToast({
        type: 'error',
        title: 'Gagal memperbarui Google Drive',
        description: result.warning,
        actionLabel: 'Coba lagi',
        onAction: () => {
          void retryDriveReset();
        },
      });
      return { ok: false, driveWarning: result.warning };
    } finally {
      setIsResetting(false);
    }
  }, [isResetting, pushToast, runDriveResetPhase]);

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
        ...normalizeLoadedData(restored),
        version: DATA_VERSION,
        updatedAt: new Date().toISOString(),
      };
      setData(normalized);
      persistLocal(normalized);
      scheduleDriveSync(normalized);
      setHasLegacyPrompt(false);
      pushToast({
        type: 'success',
        title: 'Data berhasil dipulihkan',
        description: `${normalized.transactions.length} transaksi telah dimuat kembali.`,
      });
    },
    [persistLocal, pushToast, scheduleDriveSync]
  );

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
    isResetting,
    driveResetError,
    hasLegacyPrompt,
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
    resolveLegacyData,
    executeReset,
    retryDriveReset,
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
  };
}
