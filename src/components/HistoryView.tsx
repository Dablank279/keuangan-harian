import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  SlidersHorizontal,
  Paperclip,
  Pencil,
  Copy,
  Trash2,
  ArrowLeftRight,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  FileText,
  X,
  Plus,
} from 'lucide-react';
import { isSameMonth, isToday, parseISO, subDays, isAfter } from 'date-fns';
import type { AppData, ReceiptMeta, Transaction } from '../types';
import {
  formatDateBySetting,
  formatDayGroupLabel,
  formatRupiah,
  formatTime,
} from '../utils/format';
import { getLocalReceipt } from '../utils/receiptStore';
import { downloadDriveFileBlob } from '../services/drive';

interface HistoryViewProps {
  data: AppData;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onAddTransaction: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onDuplicateTransaction: (tx: Transaction) => void;
  onRequestDeleteTransaction: (tx: Transaction) => void;
  onOpenReceipt: (receipt: ReceiptMeta) => void;
  onPullRefresh: () => Promise<void>;
}

type DatePreset = 'all' | 'today' | '7d' | 'month' | 'custom';
type SortField = 'date' | 'amount' | 'category';

/** Baris transaksi mobile dengan aksi swipe kiri (hapus) dan swipe kanan (edit/duplikat) */
const SwipeableTransactionRow: React.FC<{
  tx: Transaction;
  catEmoji: string;
  catName: string;
  walletLabel: string;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenReceipt: () => void;
}> = ({
  tx,
  catEmoji,
  catName,
  walletLabel,
  selected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onOpenReceipt,
}) => {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const swiping = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    swiping.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!swiping.current && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      swiping.current = true;
    }
    if (swiping.current) {
      const clamped = Math.max(-108, Math.min(132, dx));
      setOffsetX(clamped);
    }
  };

  const onTouchEnd = () => {
    if (offsetX < -64) {
      if (navigator.vibrate) navigator.vibrate(15);
      setOffsetX(-96);
    } else if (offsetX > 64) {
      if (navigator.vibrate) navigator.vibrate(15);
      setOffsetX(124);
    } else {
      setOffsetX(0);
    }
    startX.current = null;
    startY.current = null;
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Background Actions */}
      <div className="absolute inset-0 flex items-center justify-between">
        <div className="flex items-center h-full">
          <button
            type="button"
            onClick={() => {
              setOffsetX(0);
              onEdit();
            }}
            className="h-full w-16 bg-teal-600 text-white flex flex-col items-center justify-center text-[11px] font-semibold"
          >
            <Pencil className="w-4 h-4 mb-0.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              setOffsetX(0);
              onDuplicate();
            }}
            className="h-full w-16 bg-sky-600 text-white flex flex-col items-center justify-center text-[11px] font-semibold"
          >
            <Copy className="w-4 h-4 mb-0.5" />
            Salin
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setOffsetX(0);
            onDelete();
          }}
          className="h-full w-24 bg-rose-600 text-white flex flex-col items-center justify-center text-[11px] font-semibold"
        >
          <Trash2 className="w-4 h-4 mb-0.5" />
          Hapus
        </button>
      </div>

      {/* Foreground Card Row */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => {
          if (offsetX !== 0) {
            setOffsetX(0);
            return;
          }
          onSelect();
        }}
        style={{ transform: `translate3d(${offsetX}px, 0, 0)` }}
        className={`relative z-10 flex items-center justify-between gap-3 px-3.5 py-3 transition-transform duration-150 cursor-pointer ${
          selected
            ? 'bg-teal-50/90 dark:bg-teal-950/50'
            : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg shrink-0">
            {tx.type === 'transfer' ? (
              <ArrowLeftRight className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            ) : (
              catEmoji
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {tx.note || (tx.type === 'transfer' ? 'Transfer Antar Dompet' : catName)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {tx.type === 'transfer' ? walletLabel : `${catName} · ${walletLabel}`} · {formatTime(tx.date)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {tx.receipt && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenReceipt();
              }}
              aria-label="Lihat bukti pembayaran"
              className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/60"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          )}
          <span
            className={`text-sm font-bold tabular-nums whitespace-nowrap ${
              tx.type === 'income'
                ? 'text-teal-700 dark:text-teal-400'
                : tx.type === 'expense'
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-sky-600 dark:text-sky-400'
            }`}
          >
            {tx.type === 'income'
              ? formatRupiah(tx.amount, true)
              : tx.type === 'expense'
              ? formatRupiah(-tx.amount, true)
              : formatRupiah(tx.amount)}
          </span>
        </div>
      </div>
    </div>
  );
};

/** Panel pratinjau detail & bukti pembayaran untuk Tablet & Desktop */
const TransactionDetailPanel: React.FC<{
  tx: Transaction;
  data: AppData;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenReceipt: (receipt: ReceiptMeta) => void;
  onClose?: () => void;
}> = ({ tx, data, onEdit, onDuplicate, onDelete, onOpenReceipt, onClose }) => {
  const cat = data.categories.find((c) => c.id === tx.categoryId);
  const wallet = data.wallets.find((w) => w.id === tx.walletId);
  const toWallet = tx.toWalletId ? data.wallets.find((w) => w.id === tx.toWalletId) : null;
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    setThumbUrl(null);

    if (tx.receipt && tx.receipt.mimeType !== 'application/pdf') {
      const loadPreview = async () => {
        try {
          let blob: Blob | null = null;
          if (tx.receipt?.localId) {
            const local = await getLocalReceipt(tx.receipt.localId);
            if (local?.blob) blob = local.blob;
          }
          if (!blob && tx.receipt?.fileId) {
            blob = await downloadDriveFileBlob(tx.receipt.fileId);
          }
          if (blob && active) {
            url = URL.createObjectURL(blob);
            setThumbUrl(url);
          }
        } catch {
          // Pratinjau tidak tersedia offline
        }
      };
      loadPreview();
    }

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [tx]);

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-4 sticky top-20">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl shrink-0">
            {tx.type === 'transfer' ? (
              <ArrowLeftRight className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            ) : (
              cat?.emoji || '💸'
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {tx.type === 'income' ? 'Pemasukan' : tx.type === 'expense' ? 'Pengeluaran' : 'Transfer'}
            </p>
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              {tx.type === 'transfer' ? 'Transfer Antar Dompet' : cat?.name || 'Transaksi'}
            </h4>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel detail"
            className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <p
        className={`text-2xl font-bold tabular-nums ${
          tx.type === 'income'
            ? 'text-teal-700 dark:text-teal-400'
            : tx.type === 'expense'
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-sky-600 dark:text-sky-400'
        }`}
      >
        {tx.type === 'income'
          ? formatRupiah(tx.amount, true)
          : tx.type === 'expense'
          ? formatRupiah(-tx.amount, true)
          : formatRupiah(tx.amount)}
      </p>

      <dl className="space-y-2.5 text-xs border-t border-slate-100 dark:border-slate-800 pt-3">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500 dark:text-slate-400">Tanggal & Jam</dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100 tabular-nums text-right">
            {formatDateBySetting(tx.date, data.settings.dateFormat)} · {formatTime(tx.date)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500 dark:text-slate-400">Dompet</dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100 text-right">
            {tx.type === 'transfer'
              ? `${wallet?.name || '-'} → ${toWallet?.name || '-'}`
              : `${wallet?.icon || ''} ${wallet?.name || '-'}`}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500 dark:text-slate-400">Catatan</dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100 text-right max-w-[65%]">
            {tx.note || '—'}
          </dd>
        </div>
        {tx.tags.length > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500 dark:text-slate-400">Tag</dt>
            <dd className="font-medium text-slate-700 dark:text-slate-300 text-right">
              {tx.tags.map((t) => `#${t}`).join(' · ')}
            </dd>
          </div>
        )}
      </dl>

      {/* Pratinjau Bukti Pembayaran */}
      <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
          Bukti Pembayaran
        </p>
        {tx.receipt ? (
          <div className="space-y-2.5">
            {thumbUrl ? (
              <button
                type="button"
                onClick={() => tx.receipt && onOpenReceipt(tx.receipt)}
                className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 block group"
              >
                <img
                  src={thumbUrl}
                  alt={tx.receipt.fileName}
                  className="w-full h-44 object-cover group-hover:scale-[1.02] transition-transform"
                />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => tx.receipt && onOpenReceipt(tx.receipt)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4 flex items-center gap-3 text-left hover:border-teal-500 transition-colors"
              >
                <FileText className="w-6 h-6 text-teal-600 dark:text-teal-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {tx.receipt.fileName}
                  </p>
                  <p className="text-[11px] text-slate-500">Ketuk untuk perbesar pratinjau</p>
                </div>
              </button>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => tx.receipt && onOpenReceipt(tx.receipt)}
                className="flex-1 min-h-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Perbesar
              </button>
              {tx.receipt.webViewLink && (
                <a
                  href={tx.receipt.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[38px] rounded-xl bg-teal-600 hover:bg-teal-700 text-xs font-semibold text-white inline-flex items-center justify-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Buka di Drive
                </a>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500">Tidak ada bukti terlampir.</p>
        )}
      </div>

      {/* Tombol Aksi */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={onEdit}
          className="min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center justify-center gap-1.5"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center justify-center gap-1.5"
        >
          <Copy className="w-3.5 h-3.5" />
          Salin
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="min-h-[40px] rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center justify-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Hapus
        </button>
      </div>
    </div>
  );
};

export const HistoryView: React.FC<HistoryViewProps> = ({
  data,
  searchInputRef,
  onAddTransaction,
  onEditTransaction,
  onDuplicateTransaction,
  onRequestDeleteTransaction,
  onOpenReceipt,
  onPullRefresh,
}) => {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [walletFilter, setWalletFilter] = useState('all');
  const [receiptFilter, setReceiptFilter] = useState<'all' | 'with' | 'without'>('all');

  // Sorting & Pagination untuk tabel desktop
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Transaksi terpilih untuk panel detail tablet/desktop
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Pull-to-refresh mobile
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStartY = useRef<number | null>(null);

  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const walletMap = useMemo(() => new Map(data.wallets.map((w) => [w.id, w])), [data.wallets]);

  const filteredTransactions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();
    const sevenDaysAgo = subDays(now, 7);

    const list = data.transactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && tx.categoryId !== categoryFilter) return false;
      if (walletFilter !== 'all' && tx.walletId !== walletFilter && tx.toWalletId !== walletFilter) {
        return false;
      }
      if (receiptFilter === 'with' && !tx.receipt) return false;
      if (receiptFilter === 'without' && tx.receipt) return false;

      const d = parseISO(tx.date);
      if (datePreset === 'today' && !isToday(d)) return false;
      if (datePreset === '7d' && !isAfter(d, sevenDaysAgo)) return false;
      if (datePreset === 'month' && !isSameMonth(d, now)) return false;
      if (datePreset === 'custom') {
        const dayKey = tx.date.slice(0, 10);
        if (customFrom && dayKey < customFrom) return false;
        if (customTo && dayKey > customTo) return false;
      }

      if (q) {
        const catName = catMap.get(tx.categoryId)?.name.toLowerCase() || '';
        const walletName = walletMap.get(tx.walletId)?.name.toLowerCase() || '';
        const haystack = `${tx.note.toLowerCase()} ${catName} ${walletName} ${tx.tags.join(' ').toLowerCase()} ${tx.amount}`;
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortField === 'amount') cmp = a.amount - b.amount;
      else if (sortField === 'category') {
        const nameA = catMap.get(a.categoryId)?.name || 'Transfer';
        const nameB = catMap.get(b.categoryId)?.name || 'Transfer';
        cmp = nameA.localeCompare(nameB);
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [
    data.transactions,
    query,
    typeFilter,
    categoryFilter,
    walletFilter,
    receiptFilter,
    datePreset,
    customFrom,
    customTo,
    sortField,
    sortAsc,
    catMap,
    walletMap,
  ]);

  // Reset halaman saat filter berubah
  useEffect(() => {
    setPage(1);
  }, [query, typeFilter, categoryFilter, walletFilter, receiptFilter, datePreset, customFrom, customTo]);

  // Kelompokkan per hari untuk Mobile & Tablet
  const groupedByDay = useMemo(() => {
    const groups = new Map<string, { items: Transaction[]; income: number; expense: number }>();
    filteredTransactions.forEach((tx) => {
      const key = tx.date.slice(0, 10);
      const current = groups.get(key) || { items: [], income: 0, expense: 0 };
      current.items.push(tx);
      if (tx.type === 'income') current.income += tx.amount;
      if (tx.type === 'expense') current.expense += tx.amount;
      groups.set(key, current);
    });
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredTransactions]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const paginatedRows = filteredTransactions.slice((page - 1) * pageSize, page * pageSize);

  const selectedTx = useMemo(
    () => filteredTransactions.find((t) => t.id === selectedId) || filteredTransactions[0] || null,
    [filteredTransactions, selectedId]
  );

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc((a) => !a);
    else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const activeFilterCount = [
    datePreset !== 'all',
    typeFilter !== 'all',
    categoryFilter !== 'all',
    walletFilter !== 'all',
    receiptFilter !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setQuery('');
    setDatePreset('all');
    setCustomFrom('');
    setCustomTo('');
    setTypeFilter('all');
    setCategoryFilter('all');
    setWalletFilter('all');
    setReceiptFilter('all');
  };

  // Pull-to-refresh handlers (Mobile)
  const handlePullStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 4) {
      pullStartY.current = e.touches[0].clientY;
    }
  };
  const handlePullMove = (e: React.TouchEvent) => {
    if (pullStartY.current === null || refreshing) return;
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 0 && window.scrollY <= 4) {
      setPullDist(Math.min(72, dy * 0.45));
    }
  };
  const handlePullEnd = async () => {
    if (pullDist > 48 && !refreshing) {
      setRefreshing(true);
      await onPullRefresh();
      setRefreshing(false);
    }
    setPullDist(0);
    pullStartY.current = null;
  };

  return (
    <div
      className="space-y-4"
      onTouchStart={handlePullStart}
      onTouchMove={handlePullMove}
      onTouchEnd={handlePullEnd}
    >
      {/* Indikator Pull-to-refresh */}
      {(pullDist > 8 || refreshing) && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs font-medium text-teal-700 dark:text-teal-400">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Menyinkronkan dengan Google Drive…' : 'Lepas untuk menyinkronkan'}</span>
        </div>
      )}

      {/* Bilah Pencarian & Filter */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari catatan, kategori, dompet, tag… (tekan /)"
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
              showFilters || activeFilterCount > 0
                ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
          </button>
        </div>

        {/* Panel Filter Lanjutan */}
        {showFilters && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              aria-label="Filter tanggal"
              className="h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-slate-100"
            >
              <option value="all">Semua Tanggal</option>
              <option value="today">Hari Ini</option>
              <option value="7d">7 Hari Terakhir</option>
              <option value="month">Bulan Ini</option>
              <option value="custom">Rentang Kustom</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              aria-label="Filter jenis transaksi"
              className="h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-slate-100"
            >
              <option value="all">Semua Jenis</option>
              <option value="expense">Pengeluaran</option>
              <option value="income">Pemasukan</option>
              <option value="transfer">Transfer</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter kategori"
              className="h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-slate-100"
            >
              <option value="all">Semua Kategori</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>

            <select
              value={walletFilter}
              onChange={(e) => setWalletFilter(e.target.value)}
              aria-label="Filter dompet"
              className="h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-slate-100"
            >
              <option value="all">Semua Dompet</option>
              {data.wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.icon} {w.name}
                </option>
              ))}
            </select>

            <select
              value={receiptFilter}
              onChange={(e) => setReceiptFilter(e.target.value as typeof receiptFilter)}
              aria-label="Filter bukti pembayaran"
              className="h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-slate-100"
            >
              <option value="all">Semua Bukti</option>
              <option value="with">Ada Bukti (📎)</option>
              <option value="without">Tanpa Bukti</option>
            </select>

            {datePreset === 'custom' && (
              <div className="sm:col-span-2 lg:col-span-5 flex flex-wrap items-center gap-2.5">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                />
                <span className="text-xs text-slate-400">sampai</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            )}

            {activeFilterCount > 0 && (
              <div className="sm:col-span-2 lg:col-span-5 flex justify-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline min-h-[36px] px-2"
                >
                  Reset semua filter
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Empty State */}
      {filteredTransactions.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 py-14 px-6 text-center shadow-xs">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Tidak ada transaksi ditemukan
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {query || activeFilterCount > 0
              ? 'Coba ubah kata kunci pencarian atau reset filter untuk melihat transaksi lainnya.'
              : 'Catat transaksi pertama Anda untuk mulai memantau pengeluaran harian.'}
          </p>
          <div className="mt-5 flex items-center justify-center gap-2.5">
            {(query || activeFilterCount > 0) && (
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                Reset Filter
              </button>
            )}
            <button
              type="button"
              onClick={onAddTransaction}
              className="min-h-[44px] px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Catat Transaksi
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Tampilan MOBILE (<768px) & TABLET (768–1023px: 2 kolom) */}
          <div className="lg:hidden grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            <div className="md:col-span-7 space-y-4">
              <p className="md:hidden text-[11px] text-slate-400 dark:text-slate-500 px-1">
                Geser kiri untuk hapus · Geser kanan untuk edit atau salin
              </p>
              {groupedByDay.map(([dayKey, group]) => {
                const net = group.income - group.expense;
                return (
                  <div
                    key={dayKey}
                    className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs"
                  >
                    <div className="px-4 py-2.5 bg-slate-50/90 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {formatDayGroupLabel(dayKey)}
                      </span>
                      <span
                        className={`font-semibold tabular-nums shrink-0 ${
                          net >= 0
                            ? 'text-teal-700 dark:text-teal-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatRupiah(net, true)}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80 p-1">
                      {group.items.map((tx) => {
                        const cat = catMap.get(tx.categoryId);
                        const w = walletMap.get(tx.walletId);
                        const toW = tx.toWalletId ? walletMap.get(tx.toWalletId) : null;
                        const walletLabel =
                          tx.type === 'transfer'
                            ? `${w?.name || '-'} → ${toW?.name || '-'}`
                            : w?.name || '-';

                        return (
                          <SwipeableTransactionRow
                            key={tx.id}
                            tx={tx}
                            catEmoji={cat?.emoji || '💸'}
                            catName={cat?.name || 'Lainnya'}
                            walletLabel={walletLabel}
                            selected={selectedTx?.id === tx.id}
                            onSelect={() => {
                              setSelectedId(tx.id);
                              // Di mobile (<768px) ketuk langsung membuka edit/detail
                              if (window.innerWidth < 768) {
                                onEditTransaction(tx);
                              }
                            }}
                            onEdit={() => onEditTransaction(tx)}
                            onDuplicate={() => onDuplicateTransaction(tx)}
                            onDelete={() => onRequestDeleteTransaction(tx)}
                            onOpenReceipt={() => tx.receipt && onOpenReceipt(tx.receipt)}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Kolom kanan khusus Tablet (768–1023px) */}
            <div className="hidden md:block md:col-span-5">
              {selectedTx && (
                <TransactionDetailPanel
                  tx={selectedTx}
                  data={data}
                  onEdit={() => onEditTransaction(selectedTx)}
                  onDuplicate={() => onDuplicateTransaction(selectedTx)}
                  onDelete={() => onRequestDeleteTransaction(selectedTx)}
                  onOpenReceipt={onOpenReceipt}
                />
              )}
            </div>
          </div>

          {/* Tampilan DESKTOP (≥1024px): Tabel Rapi + Panel Pratinjau Bukti di Samping */}
          <div className="hidden lg:grid lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => toggleSort('date')}
                          className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                        >
                          Tanggal
                          <ArrowUpDown className="w-3.5 h-3.5" />
                        </button>
                      </th>
                      <th className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => toggleSort('category')}
                          className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                        >
                          Kategori
                          <ArrowUpDown className="w-3.5 h-3.5" />
                        </button>
                      </th>
                      <th className="py-3 px-3">Catatan</th>
                      <th className="py-3 px-3">Dompet</th>
                      <th className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => toggleSort('amount')}
                          className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 ml-auto"
                        >
                          Nominal
                          <ArrowUpDown className="w-3.5 h-3.5" />
                        </button>
                      </th>
                      <th className="py-3 px-3 text-center">Bukti</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                    {paginatedRows.map((tx) => {
                      const cat = catMap.get(tx.categoryId);
                      const w = walletMap.get(tx.walletId);
                      const toW = tx.toWalletId ? walletMap.get(tx.toWalletId) : null;
                      const isSelected = selectedTx?.id === tx.id;

                      return (
                        <tr
                          key={tx.id}
                          onClick={() => setSelectedId(tx.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-teal-50/70 dark:bg-teal-950/40'
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3 px-4 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                            <div className="font-medium text-slate-800 dark:text-slate-200">
                              {formatDateBySetting(tx.date, data.settings.dateFormat)}
                            </div>
                            <div>{formatTime(tx.date)}</div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-xs font-medium text-slate-800 dark:text-slate-200">
                            {tx.type === 'transfer'
                              ? '⇄ Transfer'
                              : `${cat?.emoji || '📦'} ${cat?.name || 'Lainnya'}`}
                          </td>
                          <td className="py-3 px-3 max-w-[200px]">
                            <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                              {tx.note || '—'}
                            </p>
                            {tx.tags.length > 0 && (
                              <p className="text-[11px] text-slate-400 truncate">
                                {tx.tags.map((t) => `#${t}`).join(' · ')}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                            {tx.type === 'transfer'
                              ? `${w?.name || '-'} → ${toW?.name || '-'}`
                              : w?.name || '-'}
                          </td>
                          <td
                            className={`py-3 px-3 whitespace-nowrap text-right text-xs font-bold tabular-nums ${
                              tx.type === 'income'
                                ? 'text-teal-700 dark:text-teal-400'
                                : tx.type === 'expense'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-sky-600 dark:text-sky-400'
                            }`}
                          >
                            {tx.type === 'income'
                              ? formatRupiah(tx.amount, true)
                              : tx.type === 'expense'
                              ? formatRupiah(-tx.amount, true)
                              : formatRupiah(tx.amount)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {tx.receipt ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (tx.receipt) onOpenReceipt(tx.receipt);
                                }}
                                aria-label="Buka bukti pembayaran"
                                className="min-h-[34px] min-w-[34px] rounded-lg inline-flex items-center justify-center text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/60"
                              >
                                <Paperclip className="w-4 h-4" />
                              </button>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-700">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditTransaction(tx);
                                }}
                                aria-label="Edit transaksi"
                                className="p-2 rounded-lg text-slate-500 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDuplicateTransaction(tx);
                                }}
                                aria-label="Duplikat transaksi"
                                className="p-2 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRequestDeleteTransaction(tx);
                                }}
                                aria-label="Hapus transaksi"
                                className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="tabular-nums">
                  Menampilkan {(page - 1) * pageSize + 1}–
                  {Math.min(page * pageSize, filteredTransactions.length)} dari{' '}
                  {filteredTransactions.length} transaksi
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="min-h-[34px] min-w-[34px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40"
                    aria-label="Halaman sebelumnya"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2 font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="min-h-[34px] min-w-[34px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40"
                    aria-label="Halaman berikutnya"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Panel Samping Pratinjau Detail & Bukti (Desktop) */}
            <div className="lg:col-span-4">
              {selectedTx && (
                <TransactionDetailPanel
                  tx={selectedTx}
                  data={data}
                  onEdit={() => onEditTransaction(selectedTx)}
                  onDuplicate={() => onDuplicateTransaction(selectedTx)}
                  onDelete={() => onRequestDeleteTransaction(selectedTx)}
                  onOpenReceipt={onOpenReceipt}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
