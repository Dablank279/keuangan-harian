import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Camera,
  Image as ImageIcon,
  FileText,
  Trash2,
  Zap,
  ArrowRight,
  Loader2,
  CheckCircle2,
  UploadCloud,
} from 'lucide-react';
import type {
  Category,
  DriveFolders,
  ReceiptMeta,
  Transaction,
  TransactionType,
  Wallet,
} from '../types';
import {
  buildReceiptFileName,
  createId,
  formatFileSize,
  formatRupiah,
  formatThousandsInput,
  parseThousandsInput,
  toDateTimeLocalValue,
} from '../utils/format';
import { compressReceiptFile, type ProcessedReceiptFile } from '../utils/image';
import { getLocalReceipt, saveLocalReceipt } from '../utils/receiptStore';
import { getStoredToken, uploadReceiptToDrive } from '../services/drive';

interface TransactionSheetProps {
  open: boolean;
  editingTransaction: Transaction | null;
  categories: Category[];
  wallets: Wallet[];
  walletBalances: Map<string, number>;
  folders: DriveFolders | null;
  isOnline: boolean;
  onSave: (tx: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onClose: () => void;
  onError: (msg: string) => void;
}

export const TransactionSheet: React.FC<TransactionSheetProps> = ({
  open,
  editingTransaction,
  categories,
  wallets,
  walletBalances,
  folders,
  isOnline,
  onSave,
  onClose,
  onError,
}) => {
  const [quickMode, setQuickMode] = useState(false);
  const [type, setType] = useState<TransactionType>('expense');
  const [amountText, setAmountText] = useState('');
  const [dateTime, setDateTime] = useState(() => toDateTimeLocalValue());
  const [categoryId, setCategoryId] = useState('');
  const [walletId, setWalletId] = useState('');
  const [toWalletId, setToWalletId] = useState('');
  const [note, setNote] = useState('');
  const [tagsText, setTagsText] = useState('');

  // State bukti pembayaran
  const [existingReceipt, setExistingReceipt] = useState<ReceiptMeta | undefined>(undefined);
  const [newReceiptFile, setNewReceiptFile] = useState<ProcessedReceiptFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Swipe-down-to-close untuk mobile bottom sheet
  const [dragY, setDragY] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === (type === 'income' ? 'income' : 'expense')),
    [categories, type]
  );

  // Inisialisasi nilai form saat dibuka
  useEffect(() => {
    if (!open) return;
    setValidationError(null);
    setNewReceiptFile(null);
    setUploadProgress(0);
    setUploading(false);
    setDragY(0);

    if (editingTransaction) {
      setQuickMode(false);
      setType(editingTransaction.type);
      setAmountText(formatThousandsInput(String(editingTransaction.amount)));
      setDateTime(editingTransaction.date.slice(0, 16));
      setCategoryId(editingTransaction.categoryId);
      setWalletId(editingTransaction.walletId);
      setToWalletId(editingTransaction.toWalletId || wallets[1]?.id || wallets[0]?.id || '');
      setNote(editingTransaction.note);
      setTagsText(editingTransaction.tags.join(', '));
      setExistingReceipt(editingTransaction.receipt);

      // Muat pratinjau bukti lokal jika ada
      if (editingTransaction.receipt?.localId) {
        getLocalReceipt(editingTransaction.receipt.localId).then((rec) => {
          if (rec?.blob && rec.mimeType !== 'application/pdf') {
            setPreviewUrl(URL.createObjectURL(rec.blob));
          } else {
            setPreviewUrl(null);
          }
        });
      } else {
        setPreviewUrl(null);
      }
    } else {
      setType('expense');
      setAmountText('');
      setDateTime(toDateTimeLocalValue());
      const firstExpense = categories.find((c) => c.type === 'expense');
      setCategoryId(firstExpense?.id || '');
      setWalletId(wallets[0]?.id || '');
      setToWalletId(wallets[1]?.id || wallets[0]?.id || '');
      setNote('');
      setTagsText('');
      setExistingReceipt(undefined);
      setPreviewUrl(null);
      window.setTimeout(() => amountInputRef.current?.focus(), 140);
    }
  }, [open, editingTransaction, categories, wallets]);

  // Pastikan kategori cocok saat berpindah jenis Pemasukan <-> Pengeluaran
  useEffect(() => {
    if (type === 'transfer') return;
    if (!filteredCategories.some((c) => c.id === categoryId)) {
      setCategoryId(filteredCategories[0]?.id || '');
    }
  }, [type, filteredCategories, categoryId]);

  // Bersihkan ObjectURL saat unmount / ganti gambar
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setCompressing(true);
    setValidationError(null);
    try {
      const processed = await compressReceiptFile(file, 1280, 0.8);
      setNewReceiptFile(processed);
      setExistingReceipt(undefined);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (processed.mimeType !== 'application/pdf') {
        setPreviewUrl(URL.createObjectURL(processed.blob));
      } else {
        setPreviewUrl(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'File bukti tidak valid.';
      setValidationError(msg);
      onError(msg);
    } finally {
      setCompressing(false);
    }
  };

  const removeReceipt = () => {
    setNewReceiptFile(null);
    setExistingReceipt(undefined);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const addQuickAmount = (delta: number) => {
    const current = parseThousandsInput(amountText);
    setAmountText(formatThousandsInput(String(current + delta)));
    setValidationError(null);
  };

  const handleSubmit = async (e?: React.FormEvent, quickCategoryOverride?: string) => {
    e?.preventDefault();
    const numericAmount = parseThousandsInput(amountText);
    if (numericAmount <= 0) {
      setValidationError('Nominal harus lebih besar dari Rp 0.');
      amountInputRef.current?.focus();
      return;
    }

    const parsedDate = new Date(dateTime);
    if (Number.isNaN(parsedDate.getTime())) {
      setValidationError('Tanggal dan jam transaksi tidak valid.');
      return;
    }

    const finalCategoryId = quickCategoryOverride || categoryId || filteredCategories[0]?.id || '';
    if (type !== 'transfer' && !finalCategoryId) {
      setValidationError('Pilih kategori terlebih dahulu.');
      return;
    }

    if (type === 'transfer' && walletId === toWalletId) {
      setValidationError('Dompet asal dan tujuan transfer harus berbeda.');
      return;
    }

    const txId = editingTransaction?.id || createId('tx');
    const isoDate = `${dateTime.length === 16 ? `${dateTime}:00` : dateTime}`;
    let finalReceipt: ReceiptMeta | undefined = existingReceipt;

    // Proses simpan lokal + upload bukti pembayaran ke Google Drive (jika ada file baru)
    if (newReceiptFile) {
      const catName =
        type === 'transfer'
          ? 'transfer'
          : categories.find((c) => c.id === finalCategoryId)?.name || 'transaksi';
      const fileName = buildReceiptFileName({
        dateIso: isoDate,
        categoryName: catName,
        amount: numericAmount,
        txId,
        mimeType: newReceiptFile.mimeType,
      });
      const monthFolder = isoDate.slice(0, 7); // YYYY-MM
      const localId = createId('rcpt');

      const canUploadNow = Boolean(folders && getStoredToken() && isOnline);
      let fileId: string | undefined;
      let webViewLink: string | undefined;
      let uploadStatus: ReceiptMeta['uploadStatus'] = 'pending';

      if (canUploadNow && folders) {
        setUploading(true);
        setUploadProgress(5);
        try {
          const uploaded = await uploadReceiptToDrive({
            folders,
            monthFolderName: monthFolder,
            fileName,
            mimeType: newReceiptFile.mimeType,
            blob: newReceiptFile.blob,
            onProgress: (pct) => setUploadProgress(pct),
          });
          fileId = uploaded.fileId;
          webViewLink = uploaded.webViewLink;
          uploadStatus = 'uploaded';
        } catch (err) {
          uploadStatus = 'pending';
          onError(
            err instanceof Error
              ? `${err.message} Bukti disimpan ke antrian offline.`
              : 'Upload bukti tertunda dan masuk antrian offline.'
          );
        } finally {
          setUploading(false);
        }
      }

      await saveLocalReceipt({
        id: localId,
        txId,
        fileName,
        mimeType: newReceiptFile.mimeType,
        monthFolder,
        blob: newReceiptFile.blob,
        pendingUpload: uploadStatus !== 'uploaded',
        createdAt: new Date().toISOString(),
      });

      finalReceipt = {
        fileId,
        webViewLink,
        localId,
        fileName,
        mimeType: newReceiptFile.mimeType,
        size: newReceiptFile.compressedSize,
        uploadStatus,
      };
    }

    const parsedTags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    onSave({
      id: editingTransaction?.id,
      type,
      amount: numericAmount,
      date: isoDate,
      categoryId: type === 'transfer' ? 'transfer' : finalCategoryId,
      walletId: walletId || wallets[0]?.id || '',
      toWalletId: type === 'transfer' ? toWalletId : undefined,
      note: note.trim(),
      tags: parsedTags,
      receipt: finalReceipt,
    });
    onClose();
  };

  // Shortcut Ctrl+S / Cmd+S untuk simpan, Esc untuk tutup
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!open) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) setDragY(delta);
  };
  const handleTouchEnd = () => {
    if (dragY > 110) {
      onClose();
    }
    setDragY(0);
    touchStartY.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end bg-slate-950/55 backdrop-blur-xs animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-sheet-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={dragY > 0 ? { transform: `translate3d(0, ${dragY}px, 0)` } : undefined}
        className="w-full md:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-none md:rounded-l-2xl shadow-2xl border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 flex flex-col max-h-[92dvh] md:max-h-dvh md:h-dvh animate-sheet-up md:animate-drawer-in"
      >
        {/* Drag Handle (Mobile) */}
        <div
          className="md:hidden pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <h2 id="tx-sheet-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
            {editingTransaction ? 'Edit Transaksi' : 'Catat Transaksi'}
          </h2>
          <div className="flex items-center gap-2">
            {!editingTransaction && (
              <button
                type="button"
                onClick={() => {
                  setQuickMode((q) => !q);
                  if (type === 'transfer') setType('expense');
                }}
                className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  quickMode
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                {quickMode ? 'Mode Cepat Aktif' : 'Input Cepat'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup form"
              className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={(e) => handleSubmit(e)} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Jenis Transaksi */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80">
            {(
              [
                { id: 'expense', label: 'Pengeluaran' },
                { id: 'income', label: 'Pemasukan' },
                { id: 'transfer', label: 'Transfer' },
              ] as const
            ).map((opt) => {
              const active = type === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setType(opt.id);
                    if (opt.id === 'transfer') setQuickMode(false);
                  }}
                  className={`min-h-[40px] rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                    active
                      ? opt.id === 'income'
                        ? 'bg-teal-600 text-white shadow-xs'
                        : opt.id === 'expense'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Nominal (Auto format ribuan + inputMode numeric) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Nominal
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-4 text-lg font-semibold text-slate-400 select-none">
                Rp
              </span>
              <input
                ref={amountInputRef}
                type="text"
                inputMode="numeric"
                value={amountText}
                onChange={(e) => {
                  setAmountText(formatThousandsInput(e.target.value));
                  setValidationError(null);
                }}
                onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                placeholder="0"
                className="w-full h-14 pl-12 pr-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1">
              {[10000, 25000, 50000, 100000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => addQuickAmount(preset)}
                  className="min-h-[36px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 tabular-nums whitespace-nowrap shrink-0"
                >
                  +{preset / 1000}rb
                </button>
              ))}
            </div>
          </div>

          {/* Kategori (2 ketukan selesai di Mode Cepat!) */}
          {type !== 'transfer' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {quickMode
                    ? 'Ketuk kategori untuk langsung simpan'
                    : 'Kategori'}
                </label>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {filteredCategories.map((cat) => {
                  const selected = categoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setCategoryId(cat.id);
                        if (quickMode && parseThousandsInput(amountText) > 0) {
                          handleSubmit(undefined, cat.id);
                        }
                      }}
                      className={`min-h-[68px] p-2 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all text-center ${
                        selected
                          ? 'border-teal-600 dark:border-teal-400 bg-teal-50/80 dark:bg-teal-950/50 text-teal-900 dark:text-teal-200 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="text-xl leading-none" aria-hidden="true">
                        {cat.emoji}
                      </span>
                      <span className="text-[11px] font-medium leading-tight line-clamp-1">
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Field lengkap (tersembunyi di Mode Cepat) */}
          {!quickMode && (
            <>
              {/* Dompet / Transfer */}
              <div className={type === 'transfer' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    {type === 'transfer' ? 'Dari Dompet' : 'Dompet / Akun'}
                  </label>
                  <select
                    value={walletId}
                    onChange={(e) => setWalletId(e.target.value)}
                    className="w-full h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.icon} {w.name} ({formatRupiah(walletBalances.get(w.id) ?? w.initialBalance)})
                      </option>
                    ))}
                  </select>
                </div>

                {type === 'transfer' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Ke Dompet
                    </label>
                    <select
                      value={toWalletId}
                      onChange={(e) => setToWalletId(e.target.value)}
                      className="w-full h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      {wallets.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.icon} {w.name} ({formatRupiah(walletBalances.get(w.id) ?? w.initialBalance)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Tanggal & Jam */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Tanggal & Jam
                </label>
                <input
                  type="datetime-local"
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="w-full h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Catatan */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Catatan
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                  placeholder="Contoh: Makan siang bersama tim"
                  className="w-full h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Tag Opsional */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Tag (opsional, pisahkan dengan koma)
                </label>
                <input
                  type="text"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                  placeholder="kantor, rutin, keluarga"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Lampirkan Bukti Pembayaran */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  Bukti Pembayaran (JPG, PNG, WebP, PDF · maks 10 MB)
                </label>

                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {!newReceiptFile && !existingReceipt ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={compressing}
                      onClick={() => cameraInputRef.current?.click()}
                      className="min-h-[48px] px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-teal-500 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Camera className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      Ambil Foto
                    </button>
                    <button
                      type="button"
                      disabled={compressing}
                      onClick={() => galleryInputRef.current?.click()}
                      className="min-h-[48px] px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-teal-500 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-2 transition-colors"
                    >
                      <ImageIcon className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      Galeri / PDF
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3 flex items-center gap-3">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Pratinjau bukti"
                        className="w-16 h-16 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
                        <FileText className="w-7 h-7" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {existingReceipt?.fileName ||
                          (newReceiptFile?.mimeType === 'application/pdf'
                            ? 'Dokumen PDF siap diunggah'
                            : 'Foto struk siap diunggah')}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {newReceiptFile
                          ? newReceiptFile.wasCompressed
                            ? `Dikompres otomatis: ${formatFileSize(newReceiptFile.originalSize)} → ${formatFileSize(newReceiptFile.compressedSize)}`
                            : formatFileSize(newReceiptFile.compressedSize)
                          : existingReceipt
                          ? formatFileSize(existingReceipt.size)
                          : ''}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                        >
                          Ganti
                        </button>
                        <button
                          type="button"
                          onClick={removeReceipt}
                          className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {compressing && (
                  <p className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                    Mengompres gambar agar hemat kuota Drive…
                  </p>
                )}

                {uploading && (
                  <div className="mt-2.5 space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1.5">
                        <UploadCloud className="w-3.5 h-3.5 text-teal-600" />
                        Mengunggah bukti ke Google Drive…
                      </span>
                      <span className="tabular-nums font-semibold">{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full bg-teal-600 transition-all duration-150"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {validationError && (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl px-3.5 py-2.5">
              {validationError}
            </p>
          )}
        </form>

        {/* Sticky Bottom CTA */}
        <div className="px-5 py-3.5 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 pb-safe shrink-0">
          <button
            type="button"
            disabled={uploading || compressing}
            onClick={() => handleSubmit()}
            className="w-full min-h-[48px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-sm flex items-center justify-center gap-2 active:scale-[0.99] transition disabled:opacity-60"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Menyimpan & Mengunggah ({uploadProgress}%)…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{editingTransaction ? 'Simpan Perubahan' : 'Simpan Transaksi'}</span>
                {type === 'transfer' && <ArrowRight className="w-4 h-4" />}
              </>
            )}
          </button>
          <p className="hidden md:block text-[11px] text-slate-400 text-center mt-1.5">
            Pintasan: Ctrl+S simpan · Esc tutup
          </p>
        </div>
      </div>
    </div>
  );
};
