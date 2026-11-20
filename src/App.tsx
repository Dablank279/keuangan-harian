import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Clock,
  BarChart3,
  Settings,
  Plus,
  ExternalLink,
  RefreshCw,
  LogOut,
  Wallet as WalletIcon,
} from 'lucide-react';
import type { NavTab, ReceiptMeta, Transaction } from './types';
import { useFinanceStore } from './hooks/useFinanceStore';
import { formatRupiah } from './utils/format';
import { DashboardView } from './components/DashboardView';
import { HistoryView } from './components/HistoryView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { TransactionSheet } from './components/TransactionSheet';
import { ReceiptLightbox } from './components/ReceiptLightbox';
import { ConfirmDialog } from './components/ConfirmDialog';
import { PinLockScreen } from './components/PinLockScreen';
import { ToastStack } from './components/ToastStack';
import { GoogleSignInButton, SyncStatusLine } from './components/GoogleSignInButton';
import { PWABanner } from './components/PWABanner';

const NAV_ITEMS: { id: NavTab; label: string; title: string; Icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Beranda', title: 'Beranda', Icon: LayoutDashboard },
  { id: 'history', label: 'Riwayat', title: 'Riwayat Transaksi', Icon: Clock },
  { id: 'reports', label: 'Laporan', title: 'Laporan & Anggaran', Icon: BarChart3 },
  { id: 'settings', label: 'Pengaturan', title: 'Pengaturan', Icon: Settings },
];

export function App() {
  const store = useFinanceStore();
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [scrolled, setScrolled] = useState(false);

  // Modal & Overlay states
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [lightboxReceipt, setLightboxReceipt] = useState<ReceiptMeta | null>(null);
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  const [legacyActionLoading, setLegacyActionLoading] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const historyPushedRef = useRef(false);

  const hasAnyModalOpen =
    sheetOpen || Boolean(lightboxReceipt) || Boolean(txToDelete) || store.hasLegacyPrompt;

  // Deteksi scroll untuk efek iOS Large Title di mobile
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 28);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Dukungan tombol Back bawaan Android: tutup modal/bottom sheet dulu sebelum keluar halaman
  useEffect(() => {
    if (hasAnyModalOpen && !historyPushedRef.current) {
      window.history.pushState({ khModal: true }, '');
      historyPushedRef.current = true;
    } else if (!hasAnyModalOpen) {
      historyPushedRef.current = false;
    }
  }, [hasAnyModalOpen]);

  useEffect(() => {
    const onPopState = () => {
      if (lightboxReceipt) {
        setLightboxReceipt(null);
      } else if (txToDelete) {
        setTxToDelete(null);
      } else if (sheetOpen) {
        setSheetOpen(false);
        setEditingTx(null);
      }
      historyPushedRef.current = false;
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [lightboxReceipt, txToDelete, sheetOpen]);

  const openNewTransaction = useCallback(() => {
    setEditingTx(null);
    setSheetOpen(true);
  }, []);

  const openEditTransaction = useCallback((tx: Transaction) => {
    setEditingTx(tx);
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setEditingTx(null);
  }, []);

  // Shortcut keyboard desktop: N = transaksi baru, / = cari, Esc = tutup
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (lightboxReceipt) setLightboxReceipt(null);
        else if (txToDelete) setTxToDelete(null);
        else if (sheetOpen) closeSheet();
        return;
      }

      if (isTyping || hasAnyModalOpen) return;

      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openNewTransaction();
      } else if (e.key === '/') {
        e.preventDefault();
        setActiveTab('history');
        window.setTimeout(() => searchInputRef.current?.focus(), 60);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    hasAnyModalOpen,
    lightboxReceipt,
    txToDelete,
    sheetOpen,
    closeSheet,
    openNewTransaction,
  ]);

  // Layar kunci PIN jika diaktifkan
  if (store.data.settings.pinCode && !store.isUnlocked) {
    return (
      <PinLockScreen
        expectedPin={store.data.settings.pinCode}
        onUnlock={() => store.setIsUnlocked(true)}
      />
    );
  }

  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];

  const handlePullRefresh = async () => {
    if (store.folders && store.user) {
      await store.syncWithDrive();
    } else {
      store.pushToast({
        type: 'info',
        title: 'Data lokal sudah terbaru',
        description: 'Masuk dengan Google di Pengaturan untuk sinkronisasi cloud.',
      });
    }
  };

  return (
    <div className="min-h-dvh flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* ==================== TABLET NAVIGATION RAIL (768px–1023px) ==================== */}
      <aside className="hidden md:flex lg:hidden flex-col items-center w-20 shrink-0 fixed inset-y-0 left-0 z-30 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 py-5 gap-4">
        <div
          className="w-11 h-11 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-sm"
          title="Keuangan Harian"
        >
          <WalletIcon className="w-5 h-5" />
        </div>

        <button
          type="button"
          onClick={openNewTransaction}
          aria-label="Catat Transaksi Baru"
          className="w-12 h-12 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center shadow-md shadow-teal-600/20 active:scale-95 transition"
        >
          <Plus className="w-6 h-6" />
        </button>

        <nav className="flex-1 flex flex-col items-center gap-2 mt-2" aria-label="Navigasi utama">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`w-14 min-h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors ${
                  active
                    ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold">{label}</span>
              </button>
            );
          })}
        </nav>

        {store.user ? (
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            title={`${store.user.name} (${store.user.email})`}
            className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700"
          >
            {store.user.photoUrl ? (
              <img
                src={store.user.photoUrl}
                alt={store.user.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="w-full h-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">
                {store.user.name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            title="Sinkronkan dengan Google Drive"
            className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </aside>

      {/* ==================== DESKTOP SIDEBAR (≥1024px) ==================== */}
      <aside className="hidden lg:flex flex-col w-68 shrink-0 fixed inset-y-0 left-0 z-30 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 p-5">
        {/* Brand */}
        <div className="flex items-center gap-3 px-1">
          <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <WalletIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate">
              Keuangan Harian
            </h1>
            <SyncStatusLine
              status={store.syncStatus}
              pendingUploads={store.pendingUploadCount}
              onRetry={() => store.syncWithDrive()}
              compact
            />
          </div>
        </div>

        {/* Tombol Utama Tambah Transaksi */}
        <button
          type="button"
          onClick={openNewTransaction}
          className="mt-5 w-full min-h-[46px] px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-sm shadow-teal-600/20 flex items-center justify-center gap-2 active:scale-[0.99] transition whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Tambah Transaksi
          <kbd className="ml-auto text-[10px] font-mono bg-white/15 px-1.5 py-0.5 rounded">N</kbd>
        </button>

        {/* Menu Navigasi */}
        <nav className="mt-5 space-y-1" aria-label="Menu utama">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`w-full min-h-[44px] px-3.5 rounded-xl text-sm font-semibold flex items-center gap-3 transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Ringkasan Dompet di Sidebar */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-1 mb-2.5">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Dompet Saya
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
            >
              Kelola
            </button>
          </div>
          <div className="space-y-1.5">
            {store.data.wallets.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                  {w.icon} {w.name}
                </span>
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                  {formatRupiah(store.walletBalances.get(w.id) ?? w.initialBalance)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Profil Google Drive di Bawah Sidebar */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          {store.user ? (
            <>
              <div className="flex items-center gap-2.5">
                {store.user.photoUrl ? (
                  <img
                    src={store.user.photoUrl}
                    alt={store.user.name}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {store.user.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {store.user.name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {store.user.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={store.logoutGoogle}
                  title="Keluar dari Google Drive"
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
              {store.folders?.rootUrl && (
                <a
                  href={store.folders.rootUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[38px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Buka folder di Drive
                </a>
              )}
            </>
          ) : (
            <GoogleSignInButton
              onClick={() => store.loginWithGoogle().catch(() => {})}
              loading={store.isAuthLoading}
              fullWidth
            />
          )}
        </div>
      </aside>

      {/* ==================== MAIN CONTENT AREA ==================== */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-20 lg:pl-68">
        {/* Sticky Compact Header (Mobile + Tablet/Desktop Top Bar) */}
        <header className="sticky top-0 z-20 bg-slate-50/88 dark:bg-slate-950/88 backdrop-blur-md border-b border-slate-200/70 dark:border-slate-800/80 pt-safe">
          <div className="max-w-[1280px] mx-auto px-4 md:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
            <div className="min-w-0 flex items-center gap-3">
              <h2
                className={`font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate transition-all duration-200 ${
                  scrolled ? 'text-base' : 'text-lg md:text-xl'
                }`}
              >
                {currentNav.title}
              </h2>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="hidden sm:block">
                <SyncStatusLine
                  status={store.syncStatus}
                  pendingUploads={store.pendingUploadCount}
                  onRetry={() => store.syncWithDrive()}
                />
              </div>

              {store.user ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="lg:hidden min-h-[40px] min-w-[40px] rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center"
                  aria-label={`Profil ${store.user.name}`}
                >
                  {store.user.photoUrl ? (
                    <img
                      src={store.user.photoUrl}
                      alt={store.user.name}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 object-cover"
                    />
                  ) : (
                    <span className="w-9 h-9 bg-teal-600 text-white text-xs font-bold flex items-center justify-center">
                      {store.user.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => store.loginWithGoogle().catch(() => {})}
                  disabled={store.isAuthLoading}
                  className="lg:hidden min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap"
                >
                  {store.isAuthLoading ? 'Masuk…' : 'Masuk Google'}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Content Container */}
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 md:px-6 lg:px-8 pt-4 md:pt-6 pb-28 md:pb-10">
          {/* iOS Large Title Sub-Header (hanya tampil di mobile saat di paling atas) */}
          {!scrolled && (
            <div className="md:hidden mb-4 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Keuangan Harian · Rupiah
              </p>
              <SyncStatusLine
                status={store.syncStatus}
                pendingUploads={store.pendingUploadCount}
                onRetry={() => store.syncWithDrive()}
                compact
              />
            </div>
          )}

          {/* Banner Pasang PWA (Android & iOS Safari) */}
          <PWABanner />

          {/* Halaman Aktif */}
          {activeTab === 'dashboard' && (
            <DashboardView
              data={store.data}
              walletBalances={store.walletBalances}
              totalBalance={store.totalBalance}
              onAddTransaction={openNewTransaction}
              onEditTransaction={openEditTransaction}
              onOpenReceipt={setLightboxReceipt}
              onNavigateHistory={() => setActiveTab('history')}
              onNavigateReports={() => setActiveTab('reports')}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView
              data={store.data}
              searchInputRef={searchInputRef}
              onAddTransaction={openNewTransaction}
              onEditTransaction={openEditTransaction}
              onDuplicateTransaction={store.duplicateTransaction}
              onRequestDeleteTransaction={setTxToDelete}
              onOpenReceipt={setLightboxReceipt}
              onPullRefresh={handlePullRefresh}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              data={store.data}
              folders={store.folders}
              isOnline={store.isOnline}
              onSaveBudget={store.saveBudget}
              onToast={store.pushToast}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              data={store.data}
              user={store.user}
              folders={store.folders}
              syncStatus={store.syncStatus}
              syncError={store.syncError}
              isAuthLoading={store.isAuthLoading}
              pendingUploadCount={store.pendingUploadCount}
              walletBalances={store.walletBalances}
              onLoginGoogle={store.loginWithGoogle}
              onLogoutGoogle={store.logoutGoogle}
              onSyncNow={() => store.syncWithDrive()}
              onUpdateSettings={store.updateSettings}
              onSaveWallet={store.saveWallet}
              onDeleteWallet={store.deleteWallet}
              onSaveCategory={store.saveCategory}
              onDeleteCategory={store.deleteCategory}
              onRestoreData={store.restoreFullData}
              isResetting={store.isResetting}
              driveResetError={store.driveResetError}
              onExecuteReset={store.executeReset}
              onRetryDriveReset={store.retryDriveReset}
              onResetComplete={() => {
                setSheetOpen(false);
                setEditingTx(null);
                setLightboxReceipt(null);
                setTxToDelete(null);
                setActiveTab('dashboard');
              }}
              onLockNow={() => store.setIsUnlocked(false)}
              onToast={store.pushToast}
            />
          )}
        </main>
      </div>

      {/* ==================== FLOATING + BUTTON (DESKTOP & TABLET) ==================== */}
      <button
        type="button"
        onClick={openNewTransaction}
        aria-label="Catat transaksi baru"
        title="Catat transaksi baru (N)"
        className="hidden md:flex fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 text-white items-center justify-center shadow-xl shadow-teal-600/30 active:scale-95 transition"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* ==================== MOBILE BOTTOM NAVIGATION BAR (<768px) ==================== */}
      <nav
        aria-label="Navigasi bawah"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 pb-safe"
      >
        <div className="grid grid-cols-5 items-center h-16 px-1">
          {NAV_ITEMS.slice(0, 2).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active
                    ? 'text-teal-700 dark:text-teal-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] font-semibold">{label}</span>
              </button>
            );
          })}

          {/* Tombol + Menonjol di Tengah (Menjorok ke Atas) */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={openNewTransaction}
              aria-label="Catat transaksi baru"
              className="-mt-6 w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-600/35 border-4 border-slate-50 dark:border-slate-950 flex items-center justify-center active:scale-95 transition"
            >
              <Plus className="w-7 h-7" />
            </button>
          </div>

          {NAV_ITEMS.slice(2, 4).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active
                    ? 'text-teal-700 dark:text-teal-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] font-semibold">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ==================== MODALS, SHEETS & OVERLAYS ==================== */}
      <TransactionSheet
        open={sheetOpen}
        editingTransaction={editingTx}
        categories={store.data.categories}
        wallets={store.data.wallets}
        walletBalances={store.walletBalances}
        folders={store.folders}
        isOnline={store.isOnline}
        onSave={store.saveTransaction}
        onClose={closeSheet}
        onError={(msg) => store.pushToast({ type: 'error', title: 'Perhatian', description: msg })}
      />

      <ReceiptLightbox
        receipt={lightboxReceipt}
        onClose={() => setLightboxReceipt(null)}
      />

      <ConfirmDialog
        open={Boolean(txToDelete)}
        title="Hapus Transaksi?"
        description={
          txToDelete
            ? `Transaksi sebesar ${formatRupiah(txToDelete.amount)} (${txToDelete.note || 'tanpa catatan'}) akan dihapus secara permanen.`
            : ''
        }
        confirmLabel="Hapus"
        danger
        onConfirm={() => {
          if (txToDelete) store.deleteTransaction(txToDelete.id);
          setTxToDelete(null);
        }}
        onCancel={() => setTxToDelete(null)}
      />

      <ConfirmDialog
        open={store.hasLegacyPrompt}
        title="Data contoh terdeteksi. Hapus dan mulai dari kosong?"
        description="Aplikasi mendeteksi data dari versi sebelumnya yang mungkin masih berisi contoh transaksi atau saldo awal contoh. Pilih Hapus data contoh untuk memulai bersih dari Rp 0, atau Simpan dulu jika ingin tetap menyimpannya."
        confirmLabel="Hapus data contoh"
        cancelLabel="Simpan dulu"
        loading={legacyActionLoading}
        loadingLabel="Membersihkan data contoh…"
        onConfirm={async () => {
          setLegacyActionLoading(true);
          try {
            await store.resolveLegacyData('delete');
            setActiveTab('dashboard');
          } finally {
            setLegacyActionLoading(false);
          }
        }}
        onCancel={async () => {
          setLegacyActionLoading(true);
          try {
            await store.resolveLegacyData('keep');
          } finally {
            setLegacyActionLoading(false);
          }
        }}
      />

      <ToastStack toasts={store.toasts} onDismiss={store.dismissToast} />
    </div>
  );
}

export default App;
