import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import type { Category, Transaction, Wallet, DateFormatOption } from '../types';
import { formatDateBySetting, formatRupiah, formatTime } from './format';
import { getLocalReceipt } from './receiptStore';
import { downloadDriveFileBlob } from '../services/drive';

function escapeCsvCell(value: string): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Buat konten CSV (UTF-8 BOM) untuk periode terpilih */
export function buildCsvBlob(params: {
  transactions: Transaction[];
  categories: Category[];
  wallets: Wallet[];
  dateFormat: DateFormatOption;
}): Blob {
  const { transactions, categories, wallets, dateFormat } = params;
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const walletMap = new Map(wallets.map((w) => [w.id, w]));

  const headers = [
    'Tanggal',
    'Jam',
    'Jenis',
    'Kategori',
    'Dompet',
    'Dompet Tujuan',
    'Nominal (Rp)',
    'Catatan',
    'Tag',
    'Link Bukti Drive',
  ];

  const rows = transactions.map((tx) => {
    const typeLabel =
      tx.type === 'income' ? 'Pemasukan' : tx.type === 'expense' ? 'Pengeluaran' : 'Transfer';
    const catName = tx.type === 'transfer' ? 'Transfer' : catMap.get(tx.categoryId)?.name || '-';
    const walletName = walletMap.get(tx.walletId)?.name || '-';
    const toWalletName = tx.toWalletId ? walletMap.get(tx.toWalletId)?.name || '-' : '-';

    return [
      formatDateBySetting(tx.date, dateFormat),
      formatTime(tx.date),
      typeLabel,
      catName,
      walletName,
      toWalletName,
      String(tx.amount),
      tx.note,
      tx.tags.join('; '),
      tx.receipt?.webViewLink || '',
    ].map(escapeCsvCell);
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}

/** Buat PDF laporan keuangan rapi dengan ringkasan & tabel transaksi */
export function buildPdfBlob(params: {
  periodLabel: string;
  transactions: Transaction[];
  categories: Category[];
  wallets: Wallet[];
  dateFormat: DateFormatOption;
}): Blob {
  const { periodLabel, transactions, categories, wallets, dateFormat } = params;
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const walletMap = new Map(wallets.map((w) => [w.id, w]));

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const net = totalIncome - totalExpense;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Header
  doc.setFillColor(13, 148, 136);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('Laporan Keuangan Harian', 14, 15);
  doc.setFontSize(10);
  doc.text(`Periode: ${periodLabel}  |  Total Transaksi: ${transactions.length}`, 14, 23);

  // Ringkasan Total
  doc.setTextColor(15, 23, 42);
  autoTable(doc, {
    startY: 36,
    head: [['Total Pemasukan', 'Total Pengeluaran', 'Selisih Bersih']],
    body: [[formatRupiah(totalIncome), formatRupiah(totalExpense), formatRupiah(net, true)]],
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' },
    bodyStyles: { fontSize: 11, fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  // Ringkasan Kategori Pengeluaran
  const byCategory = new Map<string, number>();
  transactions
    .filter((t) => t.type === 'expense')
    .forEach((t) => {
      const name = catMap.get(t.categoryId)?.name || 'Lainnya';
      byCategory.set(name, (byCategory.get(name) || 0) + t.amount);
    });

  const categoryRows = Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, total]) => [
      name,
      formatRupiah(total),
      totalExpense > 0 ? `${((total / totalExpense) * 100).toFixed(1)}%` : '0%',
    ]);

  let nextY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 56;

  if (categoryRows.length > 0) {
    doc.setFontSize(12);
    doc.text('Ringkasan Pengeluaran per Kategori', 14, nextY + 10);
    autoTable(doc, {
      startY: nextY + 14,
      head: [['Kategori', 'Total Pengeluaran', 'Porsi']],
      body: categoryRows,
      theme: 'striped',
      headStyles: { fillColor: [13, 148, 136], textColor: [255, 255, 255] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
    nextY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 30;
  }

  // Daftar Transaksi
  doc.setFontSize(12);
  doc.text('Rincian Transaksi', 14, nextY + 10);

  const txRows = transactions.map((tx) => {
    const typeLabel =
      tx.type === 'income' ? 'Masuk' : tx.type === 'expense' ? 'Keluar' : 'Transfer';
    const catName = tx.type === 'transfer' ? 'Transfer' : catMap.get(tx.categoryId)?.name || '-';
    const walletName =
      tx.type === 'transfer' && tx.toWalletId
        ? `${walletMap.get(tx.walletId)?.name || '-'} -> ${walletMap.get(tx.toWalletId)?.name || '-'}`
        : walletMap.get(tx.walletId)?.name || '-';
    const signed = tx.type === 'income' ? tx.amount : tx.type === 'expense' ? -tx.amount : tx.amount;

    return [
      formatDateBySetting(tx.date, dateFormat),
      typeLabel,
      catName,
      walletName,
      tx.note || '-',
      formatRupiah(signed, tx.type !== 'transfer'),
    ];
  });

  autoTable(doc, {
    startY: nextY + 14,
    head: [['Tanggal', 'Jenis', 'Kategori', 'Dompet', 'Catatan', 'Nominal']],
    body: txRows.length > 0 ? txRows : [['-', '-', 'Tidak ada transaksi', '-', '-', 'Rp 0']],
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
    styles: { fontSize: 8.5 },
    columnStyles: { 5: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  return doc.output('blob');
}

/** Kumpulkan semua bukti pembayaran dalam periode ke satu file ZIP */
export async function buildReceiptsZipBlob(
  transactions: Transaction[],
  onProgress?: (current: number, total: number) => void
): Promise<{ blob: Blob; count: number }> {
  const withReceipts = transactions.filter((t) => Boolean(t.receipt));
  const zip = new JSZip();
  let added = 0;

  for (let i = 0; i < withReceipts.length; i++) {
    const tx = withReceipts[i];
    const receipt = tx.receipt;
    if (!receipt) continue;
    onProgress?.(i + 1, withReceipts.length);

    let fileBlob: Blob | null = null;
    if (receipt.localId) {
      const localRec = await getLocalReceipt(receipt.localId);
      if (localRec?.blob) fileBlob = localRec.blob;
    }
    if (!fileBlob && receipt.fileId) {
      try {
        fileBlob = await downloadDriveFileBlob(receipt.fileId);
      } catch {
        // Lewati jika gagal mengunduh file tertentu
      }
    }

    if (fileBlob) {
      zip.file(receipt.fileName, fileBlob);
      added++;
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, count: added };
}

/** Pemicu unduhan file di browser */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
