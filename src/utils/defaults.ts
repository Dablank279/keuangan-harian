import type { AppData, Budget, Category, Wallet, AppSettings } from '../types';

/** Versi skema data aplikasi (dinaikkan dari 1 ke 2 saat seed data dihapus) */
export const DATA_VERSION = 2;

export const DEFAULT_WALLETS: Wallet[] = [
  { id: 'w_tunai', name: 'Tunai', icon: '💵', color: '#0d9488', initialBalance: 0 },
  { id: 'w_bank', name: 'Bank', icon: '🏦', color: '#0284c7', initialBalance: 0 },
  { id: 'w_ewallet', name: 'E-Wallet', icon: '📱', color: '#7c3aed', initialBalance: 0 },
];

export const DEFAULT_CATEGORIES: Category[] = [
  // Pengeluaran
  { id: 'cat_makan', name: 'Makan & Minum', type: 'expense', emoji: '🍽️', color: '#f97316' },
  { id: 'cat_transport', name: 'Transportasi', type: 'expense', emoji: '🛵', color: '#0ea5e9' },
  { id: 'cat_belanja', name: 'Belanja', type: 'expense', emoji: '🛍️', color: '#ec4899' },
  { id: 'cat_tagihan', name: 'Tagihan', type: 'expense', emoji: '⚡', color: '#eab308' },
  { id: 'cat_hiburan', name: 'Hiburan', type: 'expense', emoji: '🎬', color: '#8b5cf6' },
  { id: 'cat_kesehatan', name: 'Kesehatan', type: 'expense', emoji: '💊', color: '#ef4444' },
  { id: 'cat_pendidikan', name: 'Pendidikan', type: 'expense', emoji: '📚', color: '#3b82f6' },
  { id: 'cat_lain_out', name: 'Lainnya', type: 'expense', emoji: '📦', color: '#64748b' },
  // Pemasukan
  { id: 'cat_gaji', name: 'Gaji', type: 'income', emoji: '💼', color: '#0d9488' },
  { id: 'cat_bonus', name: 'Bonus', type: 'income', emoji: '🎁', color: '#10b981' },
  { id: 'cat_usaha', name: 'Usaha', type: 'income', emoji: '🏪', color: '#059669' },
  { id: 'cat_lain_in', name: 'Lainnya', type: 'income', emoji: '✨', color: '#14b8a6' },
];

export const DEFAULT_BUDGETS: Budget[] = [];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  dateFormat: 'dd MMM yyyy',
  firstDayOfWeek: 1,
  pinCode: null,
  lastAutoBackupAt: null,
};

/** Buat state kosong bersih untuk pengguna baru maupun hasil reset */
export function createEmptyAppData(settingsOverride?: Partial<AppSettings>): AppData {
  return {
    version: DATA_VERSION,
    updatedAt: new Date().toISOString(),
    transactions: [],
    wallets: DEFAULT_WALLETS.map((w) => ({ ...w })),
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    budgets: [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...settingsOverride,
    },
  };
}

/** Deteksi apakah data berasal dari versi lama atau masih memuat data contoh bawaan */
export function isLegacyData(parsed: Partial<AppData> | null | undefined): boolean {
  if (!parsed) return false;
  if (typeof parsed.version !== 'number' || parsed.version < DATA_VERSION) {
    return true;
  }
  return false;
}
