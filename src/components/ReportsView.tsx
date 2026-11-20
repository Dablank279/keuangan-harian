import React, { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Archive,
  Loader2,
  Check,
  Target,
  BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { format, isSameMonth, parseISO, subMonths } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import type { AppData, Budget, DriveFolders, ToastItem } from '../types';
import {
  formatMonthYear,
  formatRupiah,
  formatRupiahShort,
  formatThousandsInput,
  parseThousandsInput,
} from '../utils/format';
import {
  buildCsvBlob,
  buildPdfBlob,
  buildReceiptsZipBlob,
  triggerBrowserDownload,
} from '../utils/export';
import { getStoredToken, uploadReportToDrive } from '../services/drive';

interface ReportsViewProps {
  data: AppData;
  folders: DriveFolders | null;
  isOnline: boolean;
  onSaveBudget: (budget: Budget) => void;
  onToast: (toast: Omit<ToastItem, 'id'>) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  data,
  folders,
  isOnline,
  onSaveBudget,
  onToast,
}) => {
  const [subTab, setSubTab] = useState<'summary' | 'budget'>('summary');
  const [periodMode, setPeriodMode] = useState<'month' | 'range'>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [fromDate, setFromDate] = useState(() => `${format(new Date(), 'yyyy-MM')}-01`);
  const [toDate, setToDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState('');

  // Draft input batas anggaran bulanan per kategori
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    data.budgets.forEach((b) => {
      init[b.categoryId] = formatThousandsInput(String(b.limit));
    });
    return init;
  });

  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);

  const periodLabel = useMemo(() => {
    if (periodMode === 'month') {
      try {
        return formatMonthYear(parseISO(`${selectedMonth}-01`));
      } catch {
        return selectedMonth;
      }
    }
    return `${fromDate} s.d. ${toDate}`;
  }, [periodMode, selectedMonth, fromDate, toDate]);

  const periodTransactions = useMemo(() => {
    return data.transactions
      .filter((tx) => {
        const dayKey = tx.date.slice(0, 10);
        if (periodMode === 'month') {
          return dayKey.startsWith(selectedMonth);
        }
        return (!fromDate || dayKey >= fromDate) && (!toDate || dayKey <= toDate);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.transactions, periodMode, selectedMonth, fromDate, toDate]);

  const metrics = useMemo(() => {
    let income = 0;
    let expense = 0;
    const byCat = new Map<string, number>();

    periodTransactions.forEach((tx) => {
      if (tx.type === 'income') income += tx.amount;
      if (tx.type === 'expense') {
        expense += tx.amount;
        byCat.set(tx.categoryId, (byCat.get(tx.categoryId) || 0) + tx.amount);
      }
    });

    const net = income - expense;
    const savingsRate = income > 0 ? Math.round(((income - expense) / income) * 100) : 0;
    const receiptCount = periodTransactions.filter((t) => Boolean(t.receipt)).length;

    const categoryRows = Array.from(byCat.entries())
      .map(([catId, total]) => {
        const cat = catMap.get(catId);
        return {
          id: catId,
          name: cat?.name || 'Lainnya',
          emoji: cat?.emoji || '📦',
          color: cat?.color || '#64748b',
          total,
          pct: expense > 0 ? Math.round((total / expense) * 100) : 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    return { income, expense, net, savingsRate, receiptCount, categoryRows };
  }, [periodTransactions, catMap]);

  // Grafik perbandingan 6 bulan terakhir
  const sixMonthData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const m = subMonths(now, 5 - i);
      let pemasukan = 0;
      let pengeluaran = 0;
      data.transactions.forEach((tx) => {
        const d = parseISO(tx.date);
        if (isSameMonth(d, m)) {
          if (tx.type === 'income') pemasukan += tx.amount;
          if (tx.type === 'expense') pengeluaran += tx.amount;
        }
      });
      return {
        bulan: format(m, 'MMM yy', { locale: localeId }),
        pemasukan,
        pengeluaran,
      };
    });
  }, [data.transactions]);

  const canUploadDrive = Boolean(folders && getStoredToken() && isOnline);

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const blob = buildCsvBlob({
        transactions: periodTransactions,
        categories: data.categories,
        wallets: data.wallets,
        dateFormat: data.settings.dateFormat,
      });
      const slug = periodMode === 'month' ? selectedMonth : `${fromDate}_${toDate}`;
      const fileName = `Laporan_Keuangan_${slug}.csv`;
      triggerBrowserDownload(blob, fileName);

      if (canUploadDrive && folders) {
        await uploadReportToDrive({
          folders,
          fileName,
          mimeType: 'text/csv',
          blob,
        });
        onToast({
          type: 'success',
          title: 'CSV diunduh & disimpan ke Drive',
          description: `Salinan tersimpan di folder Keuangan Harian/laporan/${fileName}`,
        });
      } else {
        onToast({ type: 'success', title: 'Laporan CSV berhasil diunduh' });
      }
    } catch (err) {
      onToast({
        type: 'error',
        title: 'Gagal mengekspor CSV',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const blob = buildPdfBlob({
        periodLabel,
        transactions: periodTransactions,
        categories: data.categories,
        wallets: data.wallets,
        dateFormat: data.settings.dateFormat,
      });
      const slug = periodMode === 'month' ? selectedMonth : `${fromDate}_${toDate}`;
      const fileName = `Laporan_Keuangan_${slug}.pdf`;
      triggerBrowserDownload(blob, fileName);

      if (canUploadDrive && folders) {
        await uploadReportToDrive({
          folders,
          fileName,
          mimeType: 'application/pdf',
          blob,
        });
        onToast({
          type: 'success',
          title: 'PDF diunduh & disimpan ke Drive',
          description: `Salinan tersimpan di folder Keuangan Harian/laporan/${fileName}`,
        });
      } else {
        onToast({ type: 'success', title: 'Laporan PDF berhasil diunduh' });
      }
    } catch (err) {
      onToast({
        type: 'error',
        title: 'Gagal mengekspor PDF',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDownloadReceiptsZip = async () => {
    setExportingZip(true);
    setZipProgress('Menyiapkan…');
    try {
      const { blob, count } = await buildReceiptsZipBlob(periodTransactions, (curr, total) => {
        setZipProgress(`Mengemas ${curr}/${total} bukti…`);
      });
      if (count === 0) {
        onToast({
          type: 'info',
          title: 'Tidak ada file bukti pada periode ini',
          description: 'Lampirkan foto struk atau PDF pada transaksi Anda terlebih dahulu.',
        });
        return;
      }
      const slug = periodMode === 'month' ? selectedMonth : `${fromDate}_${toDate}`;
      triggerBrowserDownload(blob, `Bukti_Pembayaran_${slug}.zip`);
      onToast({
        type: 'success',
        title: `${count} bukti pembayaran berhasil diunduh (ZIP)`,
      });
    } catch (err) {
      onToast({
        type: 'error',
        title: 'Gagal membuat arsip ZIP bukti',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExportingZip(false);
      setZipProgress('');
    }
  };

  // Data pengeluaran bulan ini untuk halaman Anggaran Bulanan
  const expenseCategories = useMemo(
    () => data.categories.filter((c) => c.type === 'expense'),
    [data.categories]
  );

  const currentMonthSpentByCat = useMemo(() => {
    const now = new Date();
    const map = new Map<string, number>();
    data.transactions.forEach((tx) => {
      if (tx.type === 'expense' && isSameMonth(parseISO(tx.date), now)) {
        map.set(tx.categoryId, (map.get(tx.categoryId) || 0) + tx.amount);
      }
    });
    return map;
  }, [data.transactions]);

  return (
    <div className="space-y-5">
      {/* Sub-tab Navigasi: Laporan & Ekspor | Anggaran Bulanan */}
      <div className="inline-flex items-center p-1 rounded-2xl bg-slate-200/70 dark:bg-slate-800/80">
        <button
          type="button"
          onClick={() => setSubTab('summary')}
          className={`min-h-[42px] px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap ${
            subTab === 'summary'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Laporan & Ekspor
        </button>
        <button
          type="button"
          onClick={() => setSubTab('budget')}
          className={`min-h-[42px] px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap ${
            subTab === 'budget'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Target className="w-4 h-4" />
          Anggaran Bulanan
        </button>
      </div>

      {subTab === 'summary' ? (
        <>
          {/* Filter Periode & Tombol Ekspor */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setPeriodMode('month')}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold ${
                      periodMode === 'month'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Per Bulan
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodMode('range')}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold ${
                      periodMode === 'range'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Rentang Tanggal
                  </button>
                </div>

                {periodMode === 'month' ? (
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-slate-100"
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100"
                    />
                    <span className="text-xs text-slate-400">s.d.</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}
              </div>

              {/* Tombol Ekspor CSV, PDF, ZIP */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={exportingCsv}
                  onClick={handleExportCsv}
                  className="min-h-[44px] px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-60"
                >
                  {exportingCsv ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  )}
                  Ekspor CSV
                </button>
                <button
                  type="button"
                  disabled={exportingPdf}
                  onClick={handleExportPdf}
                  className="min-h-[44px] px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-xs font-semibold text-white inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-60"
                >
                  {exportingPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  Ekspor PDF
                </button>
                <button
                  type="button"
                  disabled={exportingZip}
                  onClick={handleDownloadReceiptsZip}
                  className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-60"
                >
                  {exportingZip ? (
                    <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                  ) : (
                    <Archive className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  )}
                  {exportingZip ? zipProgress : `Unduh Bukti (${metrics.receiptCount}) ZIP`}
                </button>
              </div>
            </div>

            {canUploadDrive && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Salinan laporan CSV & PDF otomatis disimpan ke folder{' '}
                <strong className="text-slate-700 dark:text-slate-300">Keuangan Harian/laporan/</strong> di Google Drive.
              </p>
            )}
          </div>

          {/* 4 Kartu Ringkasan Periode */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Pemasukan</p>
              <p className="mt-1.5 text-lg sm:text-xl font-bold text-teal-700 dark:text-teal-400 tabular-nums truncate">
                {formatRupiah(metrics.income)}
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Pengeluaran</p>
              <p className="mt-1.5 text-lg sm:text-xl font-bold text-rose-600 dark:text-rose-400 tabular-nums truncate">
                {formatRupiah(metrics.expense)}
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Selisih Bersih</p>
              <p
                className={`mt-1.5 text-lg sm:text-xl font-bold tabular-nums truncate ${
                  metrics.net >= 0
                    ? 'text-teal-700 dark:text-teal-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {formatRupiah(metrics.net, true)}
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Rasio Tabungan</p>
              <p className="mt-1.5 text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {metrics.savingsRate}%
              </p>
            </div>
          </div>

          {/* Grafik 6 Bulan + Rincian Kategori */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Perbandingan 6 Bulan Terakhir
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Total pemasukan vs pengeluaran per bulan
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sixMonthData} margin={{ top: 8, right: 6, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="bulan" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tickFormatter={(v) => formatRupiahShort(Number(v))}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      width={68}
                    />
                    <Tooltip
                      formatter={(value) => formatRupiah(Number(value ?? 0))}
                      contentStyle={{
                        borderRadius: '12px',
                        border: 'none',
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="pemasukan" name="Pemasukan" fill="#0d9488" radius={[6, 6, 0, 0]} maxBarSize={26} />
                    <Bar dataKey="pengeluaran" name="Pengeluaran" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Rincian Pengeluaran · {periodLabel}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                {periodTransactions.length} transaksi tercatat
              </p>

              {metrics.categoryRows.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                  Tidak ada pengeluaran pada periode ini.
                </p>
              ) : (
                <div className="space-y-3.5">
                  {metrics.categoryRows.map((row) => (
                    <div key={row.id}>
                      <div className="flex items-center justify-between text-xs mb-1 gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                          {row.emoji} {row.name}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                          {formatRupiah(row.total)}{' '}
                          <span className="text-slate-400 font-normal">({row.pct}%)</span>
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${row.pct}%`, backgroundColor: row.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Tab Anggaran Bulanan */
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Atur Anggaran Bulanan per Kategori
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Anda akan menerima peringatan di layar saat pengeluaran mencapai &gt;80% (kuning) dan &gt;100% (merah).
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {expenseCategories.map((cat) => {
              const savedBudget = data.budgets.find((b) => b.categoryId === cat.id);
              const limit = savedBudget?.limit || 0;
              const spent = currentMonthSpentByCat.get(cat.id) || 0;
              const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
              const barColor =
                pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-teal-500';
              const statusLabel =
                limit === 0
                  ? 'Belum diatur'
                  : pct >= 100
                  ? `Melebihi batas (${pct}%)`
                  : pct >= 80
                  ? `Hampir penuh (${pct}%)`
                  : `Aman (${pct}%)`;

              const draftVal =
                budgetDrafts[cat.id] !== undefined
                  ? budgetDrafts[cat.id]
                  : limit > 0
                  ? formatThousandsInput(String(limit))
                  : '';

              return (
                <div key={cat.id} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {cat.emoji} {cat.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        Terpakai bulan ini: <strong>{formatRupiah(spent)}</strong> ·{' '}
                        <span
                          className={
                            pct >= 100
                              ? 'text-rose-600 dark:text-rose-400 font-semibold'
                              : pct >= 80
                              ? 'text-amber-600 dark:text-amber-400 font-semibold'
                              : ''
                          }
                        >
                          {statusLabel}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative flex items-center">
                        <span className="absolute left-3 text-xs font-medium text-slate-400">Rp</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={draftVal}
                          onChange={(e) =>
                            setBudgetDrafts((prev) => ({
                              ...prev,
                              [cat.id]: formatThousandsInput(e.target.value),
                            }))
                          }
                          placeholder="0 (tanpa batas)"
                          className="w-40 h-11 pl-9 pr-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onSaveBudget({
                            categoryId: cat.id,
                            limit: parseThousandsInput(draftVal),
                          })
                        }
                        aria-label={`Simpan anggaran ${cat.name}`}
                        className="min-h-[44px] px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        Simpan
                      </button>
                    </div>
                  </div>

                  {limit > 0 && (
                    <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
