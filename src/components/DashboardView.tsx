import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Paperclip,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Wallet as WalletIcon,
  Target,
  Plus,
} from 'lucide-react';
import {
  format,
  isSameMonth,
  isToday,
  parseISO,
  subDays,
  subMonths,
  startOfWeek,
  endOfWeek,
  subWeeks,
  isWithinInterval,
} from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import type { AppData, ReceiptMeta, Transaction } from '../types';
import { formatDateBySetting, formatRupiah, formatRupiahShort, formatTime } from '../utils/format';

interface DashboardViewProps {
  data: AppData;
  walletBalances: Map<string, number>;
  totalBalance: number;
  onAddTransaction: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onOpenReceipt: (receipt: ReceiptMeta) => void;
  onNavigateHistory: () => void;
  onNavigateReports: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  walletBalances,
  totalBalance,
  onAddTransaction,
  onEditTransaction,
  onOpenReceipt,
  onNavigateHistory,
  onNavigateReports,
}) => {
  const [trendMode, setTrendMode] = useState<'daily' | 'weekly'>('daily');
  const now = useMemo(() => new Date(), []);
  const prevMonth = useMemo(() => subMonths(now, 1), [now]);

  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const walletMap = useMemo(() => new Map(data.wallets.map((w) => [w.id, w])), [data.wallets]);

  // Ringkasan Bulan Ini & Perbandingan Bulan Lalu
  const summary = useMemo(() => {
    let thisIncome = 0;
    let thisExpense = 0;
    let prevIncome = 0;
    let prevExpense = 0;
    let todayExpense = 0;

    data.transactions.forEach((tx) => {
      const d = parseISO(tx.date);
      if (isSameMonth(d, now)) {
        if (tx.type === 'income') thisIncome += tx.amount;
        if (tx.type === 'expense') {
          thisExpense += tx.amount;
          if (isToday(d)) todayExpense += tx.amount;
        }
      } else if (isSameMonth(d, prevMonth)) {
        if (tx.type === 'income') prevIncome += tx.amount;
        if (tx.type === 'expense') prevExpense += tx.amount;
      }
    });

    const totalBudget = data.budgets.reduce((s, b) => s + b.limit, 0);
    const budgetedSpent = data.budgets.reduce((sum, b) => {
      const spent = data.transactions
        .filter(
          (t) =>
            t.type === 'expense' &&
            t.categoryId === b.categoryId &&
            isSameMonth(parseISO(t.date), now)
        )
        .reduce((a, t) => a + t.amount, 0);
      return sum + spent;
    }, 0);

    const remainingBudget = totalBudget - budgetedSpent;
    const expenseDiffPct =
      prevExpense > 0 ? Math.round(((thisExpense - prevExpense) / prevExpense) * 100) : null;
    const incomeDiffPct =
      prevIncome > 0 ? Math.round(((thisIncome - prevIncome) / prevIncome) * 100) : null;

    return {
      thisIncome,
      thisExpense,
      prevIncome,
      prevExpense,
      todayExpense,
      totalBudget,
      budgetedSpent,
      remainingBudget,
      expenseDiffPct,
      incomeDiffPct,
    };
  }, [data.transactions, data.budgets, now, prevMonth]);

  // Data Grafik Tren (Harian 14 hari / Mingguan 6 minggu)
  const trendData = useMemo(() => {
    if (trendMode === 'daily') {
      const days = Array.from({ length: 14 }, (_, idx) => subDays(now, 13 - idx));
      return days.map((day) => {
        const key = format(day, 'yyyy-MM-dd');
        let pemasukan = 0;
        let pengeluaran = 0;
        data.transactions.forEach((tx) => {
          if (tx.date.slice(0, 10) === key) {
            if (tx.type === 'income') pemasukan += tx.amount;
            if (tx.type === 'expense') pengeluaran += tx.amount;
          }
        });
        return {
          label: format(day, 'd MMM', { locale: localeId }),
          pemasukan,
          pengeluaran,
        };
      });
    }

    const weekStartsOn = data.settings.firstDayOfWeek;
    return Array.from({ length: 6 }, (_, idx) => {
      const ref = subWeeks(now, 5 - idx);
      const start = startOfWeek(ref, { weekStartsOn });
      const end = endOfWeek(ref, { weekStartsOn });
      let pemasukan = 0;
      let pengeluaran = 0;
      data.transactions.forEach((tx) => {
        const d = parseISO(tx.date);
        if (isWithinInterval(d, { start, end })) {
          if (tx.type === 'income') pemasukan += tx.amount;
          if (tx.type === 'expense') pengeluaran += tx.amount;
        }
      });
      return {
        label: `${format(start, 'd/M')}–${format(end, 'd/M')}`,
        pemasukan,
        pengeluaran,
      };
    });
  }, [trendMode, data.transactions, data.settings.firstDayOfWeek, now]);

  // Data Grafik Donut Kategori Bulan Ini
  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    data.transactions.forEach((tx) => {
      if (tx.type === 'expense' && isSameMonth(parseISO(tx.date), now)) {
        totals.set(tx.categoryId, (totals.get(tx.categoryId) || 0) + tx.amount);
      }
    });

    const total = Array.from(totals.values()).reduce((a, b) => a + b, 0);
    return Array.from(totals.entries())
      .map(([catId, value]) => {
        const cat = catMap.get(catId);
        return {
          id: catId,
          name: cat?.name || 'Lainnya',
          emoji: cat?.emoji || '📦',
          color: cat?.color || '#64748b',
          value,
          pct: total > 0 ? Math.round((value / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [data.transactions, catMap, now]);

  // Progress Anggaran Bulanan
  const budgetItems = useMemo(() => {
    return data.budgets
      .filter((b) => b.limit > 0)
      .map((b) => {
        const cat = catMap.get(b.categoryId);
        const spent = data.transactions
          .filter(
            (t) =>
              t.type === 'expense' &&
              t.categoryId === b.categoryId &&
              isSameMonth(parseISO(t.date), now)
          )
          .reduce((sum, t) => sum + t.amount, 0);
        const pct = Math.round((spent / b.limit) * 100);
        return {
          categoryId: b.categoryId,
          name: cat?.name || 'Kategori',
          emoji: cat?.emoji || '📦',
          limit: b.limit,
          spent,
          pct,
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [data.budgets, data.transactions, catMap, now]);

  // 5 Transaksi Terakhir
  const recentTransactions = useMemo(() => {
    return [...data.transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [data.transactions]);

  return (
    <div className="space-y-6">
      {/* Baris 1: 4 Kartu Ringkasan (Mobile 1-2 col, Tablet 2x2, Desktop 4 col) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Saldo Total */}
        <div className="rounded-2xl bg-slate-900 dark:bg-teal-950/60 border border-slate-800 dark:border-teal-800/60 p-5 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300 dark:text-teal-200/80">
              Saldo Total
            </span>
            <WalletIcon className="w-4 h-4 text-teal-400" />
          </div>
          <p className="mt-2.5 text-2xl font-bold tracking-tight tabular-nums truncate">
            {formatRupiah(totalBalance)}
          </p>
          <p className="mt-1.5 text-xs text-slate-400 dark:text-teal-200/70">
            {data.wallets.length} dompet aktif · Hari ini keluar {formatRupiah(summary.todayExpense)}
          </p>
        </div>

        {/* Pemasukan Bulan Ini */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Pemasukan Bulan Ini
            </span>
            <ArrowDownLeft className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </div>
          <p className="mt-2.5 text-2xl font-bold text-teal-700 dark:text-teal-400 tabular-nums truncate">
            {formatRupiah(summary.thisIncome)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            {summary.incomeDiffPct !== null ? (
              <>
                {summary.incomeDiffPct >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                <span className="tabular-nums">
                  {summary.incomeDiffPct >= 0 ? '+' : ''}
                  {summary.incomeDiffPct}% vs bulan lalu
                </span>
              </>
            ) : (
              <span>Bulan lalu: {formatRupiah(summary.prevIncome)}</span>
            )}
          </p>
        </div>

        {/* Pengeluaran Bulan Ini */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Pengeluaran Bulan Ini
            </span>
            <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="mt-2.5 text-2xl font-bold text-rose-600 dark:text-rose-400 tabular-nums truncate">
            {formatRupiah(summary.thisExpense)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            {summary.expenseDiffPct !== null ? (
              <>
                {summary.expenseDiffPct <= 0 ? (
                  <TrendingDown className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                ) : (
                  <TrendingUp className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                <span className="tabular-nums">
                  {summary.expenseDiffPct >= 0 ? '+' : ''}
                  {summary.expenseDiffPct}% vs bulan lalu
                </span>
              </>
            ) : (
              <span>Bulan lalu: {formatRupiah(summary.prevExpense)}</span>
            )}
          </p>
        </div>

        {/* Sisa Anggaran */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Sisa Anggaran
            </span>
            <Target className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p
            className={`mt-2.5 text-2xl font-bold tabular-nums truncate ${
              summary.remainingBudget < 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {formatRupiah(summary.remainingBudget)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {summary.totalBudget > 0
              ? `Terpakai ${Math.round((summary.budgetedSpent / summary.totalBudget) * 100)}% dari ${formatRupiahShort(summary.totalBudget)}`
              : 'Belum ada anggaran diatur'}
          </p>
        </div>
      </section>

      {/* Strip Dompet Ringkas (Khusus Mobile & Tablet karena Desktop ada di Sidebar) */}
      <section className="lg:hidden">
        <div className="flex items-center gap-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          {data.wallets.map((w) => {
            const bal = walletBalances.get(w.id) ?? w.initialBalance;
            return (
              <div
                key={w.id}
                className="min-w-[164px] shrink-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 px-4 py-3"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span>{w.icon}</span>
                  <span className="truncate">{w.name}</span>
                </div>
                <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {formatRupiah(bal)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Baris 2: Grafik Tren (8 kol) + Donut Kategori (4 kol) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Tren Harian / Mingguan */}
        <div className="lg:col-span-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Tren Arus Kas
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pemasukan vs Pengeluaran · Bulan lalu keluar {formatRupiah(summary.prevExpense)}
              </p>
            </div>
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setTrendMode('daily')}
                className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                  trendMode === 'daily'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                14 Hari
              </button>
              <button
                type="button"
                onClick={() => setTrendMode('weekly')}
                className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                  trendMode === 'weekly'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Mingguan
              </button>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 8, right: 6, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
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
                    border: '1px solid rgba(148,163,184,0.25)',
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="pemasukan" name="Pemasukan" fill="#0d9488" radius={[6, 6, 0, 0]} maxBarSize={24} />
                <Bar dataKey="pengeluaran" name="Pengeluaran" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Pengeluaran per Kategori */}
        <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Pengeluaran per Kategori
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Distribusi bulan ini
          </p>

          {categoryBreakdown.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Belum ada pengeluaran bulan ini.
              </p>
            </div>
          ) : (
            <>
              <div className="h-44 w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {categoryBreakdown.map((entry) => (
                        <Cell key={entry.id} fill={entry.color} />
                      ))}
                    </Pie>
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
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ul className="mt-2 space-y-2 text-xs">
                {categoryBreakdown.slice(0, 5).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate text-slate-700 dark:text-slate-300">
                        {item.emoji} {item.name}
                      </span>
                    </div>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                      {formatRupiah(item.value)} <span className="text-slate-400 font-normal">({item.pct}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* Baris 3: 5 Transaksi Terakhir (7 kol) + Progress Anggaran Bulanan (5 kol) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 5 Transaksi Terakhir */}
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Transaksi Terakhir
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pengeluaran hari ini: <strong className="tabular-nums text-slate-700 dark:text-slate-200">{formatRupiah(summary.todayExpense)}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateHistory}
              className="min-h-[38px] px-3 rounded-xl text-xs font-semibold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 inline-flex items-center gap-1 whitespace-nowrap"
            >
              Semua Riwayat
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Belum ada transaksi tercatat
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Mulai catat pengeluaran atau pemasukan pertamamu hari ini.
              </p>
              <button
                type="button"
                onClick={onAddTransaction}
                className="mt-4 min-h-[44px] px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Catat Transaksi Pertama
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {recentTransactions.map((tx) => {
                const cat = catMap.get(tx.categoryId);
                const wallet = walletMap.get(tx.walletId);
                const toWallet = tx.toWalletId ? walletMap.get(tx.toWalletId) : null;
                return (
                  <div
                    key={tx.id}
                    onClick={() => onEditTransaction(tx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onEditTransaction(tx);
                    }}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 -mx-2 px-2 rounded-xl transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg shrink-0">
                        {tx.type === 'transfer' ? (
                          <ArrowLeftRight className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        ) : (
                          cat?.emoji || '💸'
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {tx.note || (tx.type === 'transfer' ? 'Transfer Antar Dompet' : cat?.name || 'Transaksi')}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {tx.type === 'transfer'
                            ? `${wallet?.name || '-'} → ${toWallet?.name || '-'}`
                            : `${cat?.name || '-'} · ${wallet?.name || '-'}`}{' '}
                          · {formatDateBySetting(tx.date, data.settings.dateFormat)} {formatTime(tx.date)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {tx.receipt && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (tx.receipt) onOpenReceipt(tx.receipt);
                          }}
                          aria-label="Lihat bukti pembayaran"
                          className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/50"
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
                );
              })}
            </div>
          )}
        </div>

        {/* Progress Anggaran Bulanan */}
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Anggaran Bulanan
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Batas pengeluaran kategori bulan ini
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateReports}
              className="min-h-[38px] px-3 rounded-xl text-xs font-semibold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 whitespace-nowrap"
            >
              Atur
            </button>
          </div>

          {budgetItems.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              Belum ada batas anggaran bulanan.
            </p>
          ) : (
            <div className="space-y-4">
              {budgetItems.slice(0, 5).map((item) => {
                const isOver = item.pct >= 100;
                const isWarn = item.pct >= 80 && item.pct < 100;
                const barColor = isOver
                  ? 'bg-rose-500'
                  : isWarn
                  ? 'bg-amber-500'
                  : 'bg-teal-500';
                const statusText = isOver
                  ? 'Melebihi batas'
                  : isWarn
                  ? 'Hampir penuh'
                  : 'Aman';
                const statusColor = isOver
                  ? 'text-rose-600 dark:text-rose-400'
                  : isWarn
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-teal-700 dark:text-teal-400';

                return (
                  <div key={item.categoryId}>
                    <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {item.emoji} {item.name}
                      </span>
                      <span className={`font-semibold tabular-nums shrink-0 ${statusColor}`}>
                        {item.pct}% · {statusText}
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${Math.min(100, item.pct)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                      <span>Terpakai {formatRupiah(item.spent)}</span>
                      <span>Batas {formatRupiah(item.limit)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
