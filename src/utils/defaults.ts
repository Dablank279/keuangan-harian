import { subDays, subMonths, format } from 'date-fns';
import type { AppData, Budget, Category, Transaction, Wallet, AppSettings } from '../types';

export const DEFAULT_WALLETS: Wallet[] = [
  { id: 'w_tunai', name: 'Tunai', icon: '💵', color: '#0d9488', initialBalance: 850000 },
  { id: 'w_bank', name: 'Bank', icon: '🏦', color: '#0284c7', initialBalance: 6500000 },
  { id: 'w_ewallet', name: 'E-Wallet', icon: '📱', color: '#7c3aed', initialBalance: 1200000 },
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

export const DEFAULT_BUDGETS: Budget[] = [
  { categoryId: 'cat_makan', limit: 2200000 },
  { categoryId: 'cat_transport', limit: 750000 },
  { categoryId: 'cat_belanja', limit: 1200000 },
  { categoryId: 'cat_tagihan', limit: 1500000 },
  { categoryId: 'cat_hiburan', limit: 500000 },
  { categoryId: 'cat_kesehatan', limit: 400000 },
];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  dateFormat: 'dd MMM yyyy',
  firstDayOfWeek: 1,
  pinCode: null,
  lastAutoBackupAt: null,
};

function makeDate(base: Date, daysAgo: number, timeStr: string): string {
  const d = subDays(base, daysAgo);
  return `${format(d, 'yyyy-MM-dd')}T${timeStr}:00`;
}

function makePrevMonthDate(base: Date, dayOfMonth: number, timeStr: string): string {
  const prev = subMonths(base, 1);
  const safeDay = Math.min(dayOfMonth, 28);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(safeDay)}T${timeStr}:00`;
}

/** Data awal contoh yang realistis agar grafik & laporan langsung informatif saat pertama dibuka */
export function createSeedAppData(): AppData {
  const now = new Date();
  const nowIso = now.toISOString();

  const sampleTransactions: Transaction[] = [
    {
      id: 'tx_seed_01',
      type: 'expense',
      amount: 42000,
      date: makeDate(now, 0, '12:30'),
      categoryId: 'cat_makan',
      walletId: 'w_ewallet',
      note: 'Makan siang nasi padang & es teh',
      tags: ['harian', 'kantor'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tx_seed_02',
      type: 'expense',
      amount: 24000,
      date: makeDate(now, 0, '08:15'),
      categoryId: 'cat_transport',
      walletId: 'w_ewallet',
      note: 'Ojek online berangkat kerja',
      tags: ['komuter'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tx_seed_03',
      type: 'expense',
      amount: 185000,
      date: makeDate(now, 1, '19:10'),
      categoryId: 'cat_belanja',
      walletId: 'w_bank',
      note: 'Belanja kebutuhan dapur mingguan',
      tags: ['bulanan'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tx_seed_04',
      type: 'expense',
      amount: 65000,
      date: makeDate(now, 1, '15:40'),
      categoryId: 'cat_makan',
      walletId: 'w_tunai',
      note: 'Kopi susu & roti sore',
      tags: ['nongkrong'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tx_seed_05',
      type: 'transfer',
      amount: 500000,
      date: makeDate(now, 2, '10:05'),
      categoryId: 'cat_lain_out',
      walletId: 'w_bank',
      toWalletId: 'w_ewallet',
      note: 'Isi saldo e-wallet untuk transaksi harian',
      tags: ['topup'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tx_seed_06',
      type: 'expense',
      amount: 420000,
      date: makeDate(now, 3, '09:30'),
      categoryId: 'cat_tagihan',
      walletId: 'w_bank',
      note: 'Tagihan internet rumah & token listrik',
      tags: ['rutin'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tx_seed_07',
      type: 'expense',
      amount: 150000,
      date: makeDate(now, 4, '20:00'),
      categoryId: 'cat_hiburan',
      walletId: 'w_ewallet',
      note: 'Nonton bioskop akhir pekan',
      tags: ['akhir-pekan'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tx_seed_08',
      type: 'income',
      amount: 1250000,
      date: makeDate(now, 5, '14:20'),
      categoryId: 'cat_usaha',
      walletId: 'w_bank',
      note: 'Pembayaran proyek desain lepas',
      tags: ['freelance'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tx_seed_09',
      type: 'expense',
      amount: 195000,
      date: makeDate(now, 6, '11:45'),
      categoryId: 'cat_kesehatan',
      walletId: 'w_bank',
      note: 'Vitamin & pemeriksaan rutin',
      tags: ['kesehatan'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tx_seed_10',
      type: 'expense',
      amount: 310000,
      date: makeDate(now, 8, '18:20'),
      categoryId: 'cat_makan',
      walletId: 'w_bank',
      note: 'Makan malam bersama keluarga',
      tags: ['keluarga'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tx_seed_11',
      type: 'expense',
      amount: 250000,
      date: makeDate(now, 10, '16:00'),
      categoryId: 'cat_pendidikan',
      walletId: 'w_bank',
      note: 'Buku referensi & kursus daring',
      tags: ['belajar'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tx_seed_12',
      type: 'income',
      amount: 8500000,
      date: `${format(now, 'yyyy-MM')}-01T09:00:00`,
      categoryId: 'cat_gaji',
      walletId: 'w_bank',
      note: 'Gaji bulanan',
      tags: ['utama'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    // Data bulan lalu untuk perbandingan di grafik dashboard
    {
      id: 'tx_prev_01',
      type: 'income',
      amount: 8500000,
      date: makePrevMonthDate(now, 1, '09:00'),
      categoryId: 'cat_gaji',
      walletId: 'w_bank',
      note: 'Gaji bulanan',
      tags: ['utama'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tx_prev_02',
      type: 'expense',
      amount: 1450000,
      date: makePrevMonthDate(now, 10, '13:00'),
      categoryId: 'cat_makan',
      walletId: 'w_ewallet',
      note: 'Rekap makan & minum bulan lalu',
      tags: ['harian'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tx_prev_03',
      type: 'expense',
      amount: 920000,
      date: makePrevMonthDate(now, 14, '10:30'),
      categoryId: 'cat_tagihan',
      walletId: 'w_bank',
      note: 'Listrik, air & internet bulan lalu',
      tags: ['rutin'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tx_prev_04',
      type: 'expense',
      amount: 540000,
      date: makePrevMonthDate(now, 19, '17:00'),
      categoryId: 'cat_belanja',
      walletId: 'w_bank',
      note: 'Belanja bulanan',
      tags: ['bulanan'],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  return {
    version: 1,
    updatedAt: nowIso,
    transactions: sampleTransactions,
    wallets: DEFAULT_WALLETS,
    categories: DEFAULT_CATEGORIES,
    budgets: DEFAULT_BUDGETS,
    settings: DEFAULT_SETTINGS,
  };
}

export function createEmptyAppData(): AppData {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    transactions: [],
    wallets: DEFAULT_WALLETS,
    categories: DEFAULT_CATEGORIES,
    budgets: DEFAULT_BUDGETS,
    settings: DEFAULT_SETTINGS,
  };
}
