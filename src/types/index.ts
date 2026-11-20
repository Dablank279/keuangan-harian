export type TransactionType = 'income' | 'expense' | 'transfer';

export interface ReceiptMeta {
  /** ID file di Google Drive (jika sudah terupload) */
  fileId?: string;
  /** Link untuk membuka file langsung di Google Drive */
  webViewLink?: string;
  /** ID lokal di IndexedDB untuk pratinjau offline & antrian upload */
  localId?: string;
  /** Nama file otomatis: YYYY-MM-DD_kategori_nominal_ID.jpg */
  fileName: string;
  mimeType: string;
  size: number;
  uploadStatus: 'uploaded' | 'pending' | 'failed';
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  /** ISO datetime string (YYYY-MM-DDTHH:mm:ss) */
  date: string;
  categoryId: string;
  walletId: string;
  /** Khusus jenis 'transfer': dompet tujuan */
  toWalletId?: string;
  note: string;
  tags: string[];
  receipt?: ReceiptMeta;
  createdAt: string;
  updatedAt: string;
}

export interface Wallet {
  id: string;
  name: string;
  icon: string;
  color: string;
  initialBalance: number;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  emoji: string;
  color: string;
}

export interface Budget {
  categoryId: string;
  /** Batas pengeluaran bulanan dalam Rupiah */
  limit: number;
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type DateFormatOption = 'dd/MM/yyyy' | 'dd MMM yyyy' | 'yyyy-MM-dd';

export interface AppSettings {
  theme: ThemeMode;
  dateFormat: DateFormatOption;
  /** 1 = Senin, 0 = Minggu */
  firstDayOfWeek: 0 | 1;
  /** Hash SHA-256 ringan / tersimpan untuk kunci PIN opsional */
  pinCode: string | null;
  lastAutoBackupAt: string | null;
}

export interface AppData {
  version: number;
  updatedAt: string;
  transactions: Transaction[];
  wallets: Wallet[];
  categories: Category[];
  budgets: Budget[];
  settings: AppSettings;
}

export interface GoogleUser {
  name: string;
  email: string;
  photoUrl?: string;
}

export interface DriveFolders {
  rootId: string;
  rootUrl: string;
  dataFolderId: string;
  buktiFolderId: string;
  backupFolderId: string;
  laporanFolderId: string;
  transaksiFileId?: string;
}

export interface DriveBackupItem {
  id: string;
  name: string;
  createdTime: string;
  size?: string;
  webViewLink?: string;
}

export type SyncStatus =
  | 'local'
  | 'synced'
  | 'syncing'
  | 'offline_pending'
  | 'error';

export type NavTab = 'dashboard' | 'history' | 'reports' | 'settings';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}
