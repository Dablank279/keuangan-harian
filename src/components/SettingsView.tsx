import React, { useEffect, useRef, useState } from 'react';
import {
  Cloud,
  ExternalLink,
  LogOut,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  Shield,
  Download,
  Upload,
  Trash2,
  Plus,
  Pencil,
  Lock,
  Unlock,
  FolderTree,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Loader2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import type {
  AppData,
  AppSettings,
  Category,
  DateFormatOption,
  DriveBackupItem,
  DriveFolders,
  GoogleUser,
  ResetMode,
  SyncStatus,
  ThemeMode,
  ToastItem,
  Wallet,
} from '../types';
import { formatDateBySetting, formatFileSize, formatRupiah, formatThousandsInput, parseThousandsInput } from '../utils/format';
import { triggerBrowserDownload } from '../utils/export';
import {
  createDriveBackup,
  isGoogleClientConfigured,
  listDriveBackups,
  readDriveBackup,
} from '../services/drive';
import { GoogleSignInButton, SyncStatusLine } from './GoogleSignInButton';
import { ConfirmDialog } from './ConfirmDialog';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface SettingsViewProps {
  data: AppData;
  user: GoogleUser | null;
  folders: DriveFolders | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  isAuthLoading: boolean;
  pendingUploadCount: number;
  walletBalances: Map<string, number>;
  onLoginGoogle: () => Promise<void>;
  onLogoutGoogle: () => void;
  onSyncNow: () => Promise<void>;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  onSaveWallet: (wallet: Omit<Wallet, 'id'> & { id?: string }) => void;
  onDeleteWallet: (walletId: string) => void;
  onSaveCategory: (cat: Omit<Category, 'id'> & { id?: string }) => void;
  onDeleteCategory: (catId: string) => void;
  onRestoreData: (restored: AppData) => void;
  isResetting: boolean;
  driveResetError: string | null;
  onExecuteReset: (
    mode: ResetMode,
    options?: { deleteDriveReceipts?: boolean }
  ) => Promise<{ ok: boolean; driveWarning?: string }>;
  onRetryDriveReset: () => Promise<{ ok: boolean; driveWarning?: string }>;
  onResetComplete: () => void;
  onLockNow: () => void;
  onToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const WALLET_ICONS = ['💵', '🏦', '📱', '💳', '🪙', '💼', '🏠'];
const CATEGORY_EMOJIS = ['🍽️', '🛵', '🛍️', '⚡', '🎬', '💊', '📚', '📦', '💼', '🎁', '🏪', '✨', '☕', '⛽', '✈️', '🧾'];
const COLORS = ['#0d9488', '#0284c7', '#7c3aed', '#f97316', '#ec4899', '#ef4444', '#eab308', '#10b981', '#64748b'];

export const SettingsView: React.FC<SettingsViewProps> = ({
  data,
  user,
  folders,
  syncStatus,
  syncError,
  isAuthLoading,
  pendingUploadCount,
  walletBalances,
  onLoginGoogle,
  onLogoutGoogle,
  onSyncNow,
  onUpdateSettings,
  onSaveWallet,
  onDeleteWallet,
  onSaveCategory,
  onDeleteCategory,
  onRestoreData,
  isResetting,
  driveResetError,
  onExecuteReset,
  onRetryDriveReset,
  onResetComplete,
  onLockNow,
  onToast,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showSetupGuide, setShowSetupGuide] = useState(!isGoogleClientConfigured());

  // Backup Drive state
  const [backups, setBackups] = useState<DriveBackupItem[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  // Editor Dompet
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [walletName, setWalletName] = useState('');
  const [walletIcon, setWalletIcon] = useState('💵');
  const [walletColor, setWalletColor] = useState('#0d9488');
  const [walletInitial, setWalletInitial] = useState('');
  const [showWalletForm, setShowWalletForm] = useState(false);

  // Editor Kategori
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<'expense' | 'income'>('expense');
  const [catEmoji, setCatEmoji] = useState('🍽️');
  const [catColor, setCatColor] = useState('#f97316');
  const [showCatForm, setShowCatForm] = useState(false);

  // Editor PIN
  const [pinInput, setPinInput] = useState('');
  const [showPinEditor, setShowPinEditor] = useState(false);

  // Reset Data (Zona Berbahaya)
  const [pendingResetMode, setPendingResetMode] = useState<ResetMode | null>(null);
  const [deleteDriveReceipts, setDeleteDriveReceipts] = useState(false);

  const loadDriveBackups = async () => {
    if (!folders) return;
    setLoadingBackups(true);
    try {
      const list = await listDriveBackups(folders);
      setBackups(list);
    } catch {
      // Abaikan jika offline
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    if (folders && user) {
      loadDriveBackups();
    } else {
      setBackups([]);
    }
  }, [folders, user]);

  const handleManualDriveBackup = async () => {
    if (!folders) return;
    setCreatingBackup(true);
    try {
      const created = await createDriveBackup(folders, data, 'backup_manual');
      setBackups((prev) => [created, ...prev]);
      onToast({
        type: 'success',
        title: 'Backup berhasil dibuat di Google Drive',
        description: `Keuangan Harian/backup/${created.name}`,
      });
    } catch (err) {
      onToast({
        type: 'error',
        title: 'Gagal membuat backup',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreFromDrive = async (item: DriveBackupItem) => {
    setRestoringId(item.id);
    try {
      const parsed = await readDriveBackup(item.id);
      if (!parsed || !Array.isArray(parsed.transactions)) {
        throw new Error('Format file backup tidak valid.');
      }
      onRestoreData(parsed);
    } catch (err) {
      onToast({
        type: 'error',
        title: 'Gagal memulihkan backup',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRestoringId(null);
    }
  };

  const handleDownloadLocalBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const stamp = new Date().toISOString().slice(0, 10);
    triggerBrowserDownload(blob, `Keuangan_Harian_Backup_${stamp}.json`);
    onToast({ type: 'success', title: 'Backup JSON lokal berhasil diunduh' });
  };

  const handleImportLocalJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AppData;
      if (!parsed || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.wallets)) {
        throw new Error('File bukan backup Keuangan Harian yang valid.');
      }
      onRestoreData(parsed);
    } catch (err) {
      onToast({
        type: 'error',
        title: 'Gagal mengimpor file backup',
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const openWalletForm = (w?: Wallet) => {
    if (w) {
      setEditingWallet(w);
      setWalletName(w.name);
      setWalletIcon(w.icon);
      setWalletColor(w.color);
      setWalletInitial(formatThousandsInput(String(w.initialBalance)));
    } else {
      setEditingWallet(null);
      setWalletName('');
      setWalletIcon('🏦');
      setWalletColor('#0d9488');
      setWalletInitial('');
    }
    setShowWalletForm(true);
  };

  const submitWallet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletName.trim()) return;
    onSaveWallet({
      id: editingWallet?.id,
      name: walletName.trim(),
      icon: walletIcon,
      color: walletColor,
      initialBalance: parseThousandsInput(walletInitial),
    });
    setShowWalletForm(false);
  };

  const openCatForm = (c?: Category) => {
    if (c) {
      setEditingCategory(c);
      setCatName(c.name);
      setCatType(c.type);
      setCatEmoji(c.emoji);
      setCatColor(c.color);
    } else {
      setEditingCategory(null);
      setCatName('');
      setCatType('expense');
      setCatEmoji('🍽️');
      setCatColor('#f97316');
    }
    setShowCatForm(true);
  };

  const submitCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    onSaveCategory({
      id: editingCategory?.id,
      name: catName.trim(),
      type: catType,
      emoji: catEmoji,
      color: catColor,
    });
    setShowCatForm(false);
  };

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pinInput.replace(/\D/g, '');
    if (clean.length < 4 || clean.length > 6) {
      onToast({ type: 'warning', title: 'PIN harus terdiri dari 4 sampai 6 angka' });
      return;
    }
    onUpdateSettings({ pinCode: clean });
    setPinInput('');
    setShowPinEditor(false);
    onToast({ type: 'success', title: 'Kunci PIN diaktifkan' });
  };

  return (
    <div className="space-y-5 max-w-4xl">
      {/* 1. Akun Google Drive & Sinkronisasi */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Cloud className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              Google Drive & Sinkronisasi
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Data transaksi & bukti pembayaran disimpan langsung ke Google Drive milik Anda sendiri.
            </p>
          </div>
          <SyncStatusLine
            status={syncStatus}
            pendingUploads={pendingUploadCount}
            onRetry={onSyncNow}
          />
        </div>

        {user ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                {user.photoUrl ? (
                  <img
                    src={user.photoUrl}
                    alt={user.name}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center shrink-0">
                    {user.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {user.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onLogoutGoogle}
                className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 inline-flex items-center gap-1.5 shrink-0"
              >
                <LogOut className="w-4 h-4" />
                Keluar
              </button>
            </div>

            {syncError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3 flex items-center justify-between gap-3 text-xs text-rose-700 dark:text-rose-300">
                <span>{syncError}</span>
                <button
                  type="button"
                  onClick={onSyncNow}
                  className="font-semibold underline whitespace-nowrap"
                >
                  Coba lagi
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onSyncNow}
                className="min-h-[44px] px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                Sinkronkan Sekarang
              </button>
              {folders?.rootUrl && (
                <a
                  href={folders.rootUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Buka folder di Google Drive
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 p-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
              <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Privasi Terjaga (Scope Minimal: drive.file)
              </p>
              <p>
                Aplikasi ini <strong>hanya mengakses file dan folder yang dibuatnya sendiri</strong> di Google Drive Anda. File pribadi lain di Drive Anda tidak pernah bisa dilihat atau diubah oleh aplikasi ini.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <GoogleSignInButton onClick={onLoginGoogle} loading={isAuthLoading} />
              <button
                type="button"
                onClick={() => setShowSetupGuide((s) => !s)}
                className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 inline-flex items-center gap-1"
              >
                Panduan Setup Google Cloud
                {showSetupGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Struktur Folder Drive */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 p-3.5 text-xs text-slate-600 dark:text-slate-400">
          <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-1.5">
            <FolderTree className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            Struktur Otomatis di Google Drive
          </p>
          <pre className="font-mono text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 overflow-x-auto">{`Keuangan Harian/
├── data/transaksi.json    (transaksi, dompet, kategori, anggaran)
├── bukti/YYYY-MM/         (foto/PDF bukti per bulan)
├── backup/                (backup otomatis mingguan & manual)
└── laporan/               (salinan ekspor CSV & PDF)`}</pre>
        </div>

        {/* Panduan Setup Google Cloud singkat */}
        {showSetupGuide && (
          <div className="rounded-xl border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/30 p-4 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              Cara Mengaktifkan Login Google Drive (1 kali setup):
            </p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Buka Google Cloud Console → buat Project baru → aktifkan <strong>Google Drive API</strong>.</li>
              <li>Atur <strong>OAuth Consent Screen</strong> (External) dan tambahkan scope <code>https://www.googleapis.com/auth/drive.file</code>.</li>
              <li>Buat <strong>Credentials → OAuth Client ID (Web application)</strong>, lalu isi <em>Authorized JavaScript origins</em> dengan URL aplikasi Anda (mis. <code>http://localhost:3000</code>).</li>
              <li>Salin Client ID ke file <code>.env</code> pada variabel <code>VITE_GOOGLE_CLIENT_ID</code>, lalu jalankan ulang server.</li>
            </ol>
          </div>
        )}
      </section>

      {/* 2. Tampilan & Preferensi */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-4">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Tampilan & Preferensi
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Tema */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
              Tema Aplikasi
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              {(
                [
                  { id: 'system', label: 'Sistem', Icon: Monitor },
                  { id: 'light', label: 'Terang', Icon: Sun },
                  { id: 'dark', label: 'Gelap', Icon: Moon },
                ] as { id: ThemeMode; label: string; Icon: React.ElementType }[]
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onUpdateSettings({ theme: id })}
                  className={`min-h-[40px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                    data.settings.theme === id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Format Tanggal */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
              Format Tanggal
            </label>
            <select
              value={data.settings.dateFormat}
              onChange={(e) =>
                onUpdateSettings({ dateFormat: e.target.value as DateFormatOption })
              }
              className="w-full h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="dd MMM yyyy">19 Nov 2026 (dd MMM yyyy)</option>
              <option value="dd/MM/yyyy">19/11/2026 (dd/MM/yyyy)</option>
              <option value="yyyy-MM-dd">2026-11-19 (yyyy-MM-dd)</option>
            </select>
          </div>

          {/* Hari Pertama dalam Minggu */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
              Hari Pertama Minggu
            </label>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => onUpdateSettings({ firstDayOfWeek: 1 })}
                className={`min-h-[40px] rounded-lg text-xs font-semibold ${
                  data.settings.firstDayOfWeek === 1
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Senin
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ firstDayOfWeek: 0 })}
                className={`min-h-[40px] rounded-lg text-xs font-semibold ${
                  data.settings.firstDayOfWeek === 0
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Minggu
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Manajemen Dompet / Akun */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Dompet & Akun
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Saldo otomatis dihitung dari saldo awal ditambah seluruh transaksi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openWalletForm()}
            className="min-h-[40px] px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Tambah
          </button>
        </div>

        {showWalletForm && (
          <form
            onSubmit={submitWallet}
            className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
                placeholder="Nama dompet (mis. BCA, GoPay)"
                className="h-11 px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100"
              />
              <div className="relative flex items-center">
                <span className="absolute left-3 text-xs text-slate-400">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={walletInitial}
                  onChange={(e) => setWalletInitial(formatThousandsInput(e.target.value))}
                  placeholder="Saldo awal"
                  className="w-full h-11 pl-9 pr-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm tabular-nums text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {WALLET_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setWalletIcon(ic)}
                  className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center border ${
                    walletIcon === ic
                      ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                  }`}
                >
                  {ic}
                </button>
              ))}
              <div className="flex items-center gap-1.5 ml-auto">
                {COLORS.slice(0, 6).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setWalletColor(c)}
                    className={`w-7 h-7 rounded-full border-2 ${
                      walletColor === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Pilih warna ${c}`}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowWalletForm(false)}
                className="min-h-[40px] px-3.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="submit"
                className="min-h-[40px] px-4 rounded-xl bg-teal-600 text-white text-xs font-semibold"
              >
                Simpan Dompet
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.wallets.map((w) => (
            <div key={w.id} className="py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                  style={{ backgroundColor: `${w.color}1A` }}
                >
                  {w.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {w.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    Saldo saat ini: <strong>{formatRupiah(walletBalances.get(w.id) ?? w.initialBalance)}</strong> · Awal {formatRupiah(w.initialBalance)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openWalletForm(w)}
                  aria-label={`Edit ${w.name}`}
                  className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteWallet(w.id)}
                  aria-label={`Hapus ${w.name}`}
                  className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Manajemen Kategori */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Kategori Transaksi
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sesuaikan kategori pemasukan & pengeluaran dengan emoji dan warna.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCatForm()}
            className="min-h-[40px] px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Tambah
          </button>
        </div>

        {showCatForm && (
          <form
            onSubmit={submitCategory}
            className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Nama kategori"
                className="h-11 px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100"
              />
              <select
                value={catType}
                onChange={(e) => setCatType(e.target.value as 'expense' | 'income')}
                className="h-11 px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="expense">Pengeluaran</option>
                <option value="income">Pemasukan</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setCatEmoji(em)}
                  className={`w-9 h-9 rounded-lg text-base flex items-center justify-center border ${
                    catEmoji === em
                      ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCatColor(c)}
                    className={`w-7 h-7 rounded-full border-2 ${
                      catColor === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Warna ${c}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCatForm(false)}
                  className="min-h-[40px] px-3 text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-4 rounded-xl bg-teal-600 text-white text-xs font-semibold"
                >
                  Simpan Kategori
                </button>
              </div>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {data.categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                  style={{ backgroundColor: `${cat.color}22` }}
                >
                  {cat.emoji}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {cat.name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {cat.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => openCatForm(cat)}
                  aria-label={`Edit ${cat.name}`}
                  className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-700"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteCategory(cat.id)}
                  aria-label={`Hapus ${cat.name}`}
                  className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Backup & Restore */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Backup & Pulihkan Data
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cadangkan data ke Google Drive atau unduh file JSON secara manual.
          </p>
        </div>

        <input
          ref={importFileRef}
          type="file"
          accept="application/json"
          onChange={handleImportLocalJson}
          className="hidden"
        />

        <div className="flex flex-wrap items-center gap-2.5">
          {folders && user && (
            <button
              type="button"
              disabled={creatingBackup}
              onClick={handleManualDriveBackup}
              className="min-h-[44px] px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-60"
            >
              {creatingBackup ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
              Backup Manual ke Drive
            </button>
          )}
          <button
            type="button"
            onClick={handleDownloadLocalBackup}
            className="min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Unduh Backup JSON
          </button>
          <button
            type="button"
            onClick={() => importFileRef.current?.click()}
            className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Impor dari JSON
          </button>
        </div>

        {folders && user && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Riwayat Backup di Google Drive
              </p>
              <button
                type="button"
                onClick={loadDriveBackups}
                className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
              >
                Muat ulang
              </button>
            </div>
            {loadingBackups ? (
              <p className="text-xs text-slate-400 py-2">Memuat daftar backup…</p>
            ) : backups.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">Belum ada file backup di Drive.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {backups.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {item.name}
                      </p>
                      <p className="text-slate-400 tabular-nums">
                        {formatDateBySetting(item.createdTime, data.settings.dateFormat)}
                        {item.size ? ` · ${formatFileSize(Number(item.size))}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={restoringId === item.id}
                      onClick={() => handleRestoreFromDrive(item)}
                      className="min-h-[36px] px-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 shrink-0"
                    >
                      {restoringId === item.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      Pulihkan
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 6. Keamanan PIN & Pasang PWA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Lock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Kunci Aplikasi (PIN)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {data.settings.pinCode
              ? 'Kunci PIN aktif. Aplikasi meminta PIN setiap kali dibuka.'
              : 'Tambahkan PIN 4–6 angka untuk melindungi catatan keuangan Anda.'}
          </p>

          {showPinEditor ? (
            <form onSubmit={handleSavePin} className="space-y-2.5">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Masukkan 4–6 digit angka"
                className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm tracking-widest tabular-nums"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="min-h-[40px] px-4 rounded-xl bg-teal-600 text-white text-xs font-semibold"
                >
                  Simpan PIN
                </button>
                <button
                  type="button"
                  onClick={() => setShowPinEditor(false)}
                  className="min-h-[40px] px-3 text-xs font-semibold text-slate-500"
                >
                  Batal
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowPinEditor(true)}
                className="min-h-[42px] px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                {data.settings.pinCode ? 'Ubah PIN' : 'Aktifkan PIN'}
              </button>
              {data.settings.pinCode && (
                <>
                  <button
                    type="button"
                    onClick={onLockNow}
                    className="min-h-[42px] px-3.5 rounded-xl bg-teal-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Kunci Sekarang
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateSettings({ pinCode: null });
                      onToast({ type: 'info', title: 'Kunci PIN dinonaktifkan' });
                    }}
                    className="min-h-[42px] px-3.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Matikan
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Pasang di Perangkat (PWA)
          </h3>
          {isInstalled ? (
            <p className="text-xs text-teal-700 dark:text-teal-400 font-medium">
              Aplikasi sudah terpasang dan berjalan dalam mode mandiri (standalone).
            </p>
          ) : isInstallable ? (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pasang Keuangan Harian ke layar utama agar dapat dibuka cepat dan tetap berfungsi saat offline.
              </p>
              <button
                type="button"
                onClick={install}
                className="min-h-[42px] px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Pasang Aplikasi
              </button>
            </>
          ) : isIOS ? (
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Di Safari iPhone/iPad: ketuk ikon <strong>Bagikan (Share)</strong> di bagian bawah, lalu pilih <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong>.
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Buka menu browser (⋮) lalu pilih <strong>Instal aplikasi / Tambahkan ke layar utama</strong> untuk memasang Keuangan Harian.
            </p>
          )}
        </section>
      </div>

      {/* 7. Zona Berbahaya */}
      <section className="rounded-2xl bg-rose-50/70 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/60 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-rose-800 dark:text-rose-300">
              Zona Berbahaya
            </h3>
            <p className="text-xs text-rose-700/80 dark:text-rose-300/80 mt-0.5 leading-relaxed">
              Tindakan di bawah ini bersifat permanen. Jika sudah masuk Google, aplikasi otomatis mencadangkan data ke folder backup di Drive sebelum menghapus.
            </p>
          </div>
        </div>

        {driveResetError && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
            <span>{driveResetError}</span>
            <button
              type="button"
              disabled={isResetting}
              onClick={() => void onRetryDriveReset()}
              className="min-h-[44px] px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold shrink-0 disabled:opacity-50"
            >
              {isResetting ? 'Mencoba ulang…' : 'Coba lagi'}
            </button>
          </div>
        )}

        <div className="divide-y divide-rose-200/70 dark:divide-rose-900/50 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-rose-200/70 dark:border-rose-900/50">
          {/* Opsi A: Hapus semua transaksi */}
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Hapus semua transaksi
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                Menghapus seluruh transaksi saja. Dompet, kategori, dan anggaran tetap dipertahankan; saldo dompet kembali ke saldo awal.
              </p>
            </div>
            <button
              type="button"
              disabled={isResetting}
              onClick={() => setPendingResetMode('transactions_only')}
              className="min-h-[44px] px-4 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100/70 dark:hover:bg-rose-950/60 text-xs font-semibold inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Hapus semua transaksi
            </button>
          </div>

          {/* Opsi B: Reset ke pengaturan awal */}
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Reset ke pengaturan awal
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                Menghapus transaksi, anggaran, serta dompet & kategori buatan sendiri. Kembali ke 3 dompet bawaan (Rp 0) dan kategori standar.
              </p>
            </div>
            <button
              type="button"
              disabled={isResetting}
              onClick={() => setPendingResetMode('factory_reset')}
              className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Reset ke pengaturan awal
            </button>
          </div>

          {/* Opsi C: Hapus semua data + file Drive (hanya tampil jika login Google) */}
          {user && (
            <div className="p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                    Hapus semua data + file Drive
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Reset seluruh data lokal dan hapus <code className="text-[11px]">data/transaksi.json</code> di Google Drive (hanya file buatan aplikasi; folder &quot;Keuangan Harian&quot; tetap dibiarkan).
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isResetting}
                  onClick={() => setPendingResetMode('full_with_drive')}
                  className="min-h-[44px] px-4 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus semua data + file Drive
                </button>
              </div>

              <label className="min-h-[44px] px-3 py-2 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50 flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteDriveReceipts}
                  disabled={isResetting}
                  onChange={(e) => setDeleteDriveReceipts(e.target.checked)}
                  className="w-4 h-4 rounded border-rose-400 text-rose-600 focus:ring-rose-500 shrink-0"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300">
                  Hapus juga foto bukti pembayaran di Drive
                </span>
              </label>
            </div>
          )}
        </div>
      </section>

      {/* Dialog Konfirmasi Reset Aman 5 Langkah */}
      {(() => {
        const txCount = data.transactions.length;
        const receiptCount = data.transactions.filter((t) => Boolean(t.receipt)).length;
        const budgetCount =
          pendingResetMode === 'transactions_only' ? 0 : data.budgets.length;

        const dialogTitle =
          pendingResetMode === 'transactions_only'
            ? 'Hapus Semua Transaksi?'
            : pendingResetMode === 'factory_reset'
            ? 'Reset ke Pengaturan Awal?'
            : 'Hapus Semua Data & File Drive?';

        const dialogDescription =
          pendingResetMode === 'transactions_only'
            ? 'Seluruh riwayat transaksi dan cache bukti lokal akan dihapus permanen. Dompet, kategori, dan anggaran Anda tetap disimpan.'
            : pendingResetMode === 'factory_reset'
            ? 'Seluruh transaksi, anggaran, serta dompet dan kategori buatan sendiri akan dihapus. Aplikasi kembali ke kondisi awal dengan saldo Rp 0.'
            : 'Seluruh data lokal dan file data/transaksi.json di Google Drive akan dihapus permanen. Sesi login Google dan folder induk "Keuangan Harian" tetap dipertahankan.';

        return (
          <ConfirmDialog
            open={Boolean(pendingResetMode)}
            title={dialogTitle}
            description={dialogDescription}
            confirmLabel="Hapus Permanen"
            cancelLabel="Batal"
            danger
            requireKeyword="RESET"
            loading={isResetting}
            loadingLabel={user ? 'Mencadangkan & mereset…' : 'Mereset data…'}
            secondaryActionLabel="Unduh backup dulu (JSON)"
            onSecondaryAction={handleDownloadLocalBackup}
            onConfirm={async () => {
              if (!pendingResetMode) return;
              const result = await onExecuteReset(pendingResetMode, {
                deleteDriveReceipts,
              });
              if (result.ok) {
                setPendingResetMode(null);
                setDeleteDriveReceipts(false);
                onResetComplete();
              }
            }}
            onCancel={() => {
              if (!isResetting) setPendingResetMode(null);
            }}
          >
            <div className="space-y-3">
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-3 text-xs text-rose-800 dark:text-rose-200 space-y-1">
                <p className="font-semibold tabular-nums">
                  Akan menghapus {txCount} transaksi, {receiptCount} bukti, {budgetCount} anggaran
                </p>
                {user && (
                  <p className="text-[11px] text-rose-700/90 dark:text-rose-300/90">
                    Backup otomatis akan disimpan ke Google Drive sebelum penghapusan dijalankan.
                  </p>
                )}
              </div>

              {pendingResetMode === 'full_with_drive' && (
                <label className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteDriveReceipts}
                    disabled={isResetting}
                    onChange={(e) => setDeleteDriveReceipts(e.target.checked)}
                    className="w-4 h-4 rounded border-rose-400 text-rose-600 focus:ring-rose-500 shrink-0"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300">
                    Hapus juga foto bukti pembayaran di Drive
                  </span>
                </label>
              )}
            </div>
          </ConfirmDialog>
        );
      })()}
    </div>
  );
};
