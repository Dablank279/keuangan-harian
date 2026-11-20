import React, { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, ExternalLink, Download, FileText, Loader2 } from 'lucide-react';
import type { ReceiptMeta } from '../types';
import { getLocalReceipt } from '../utils/receiptStore';
import { downloadDriveFileBlob } from '../services/drive';
import { formatFileSize } from '../utils/format';

interface ReceiptLightboxProps {
  receipt: ReceiptMeta | null;
  onClose: () => void;
}

export const ReceiptLightbox: React.FC<ReceiptLightboxProps> = ({ receipt, onClose }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!receipt) return;
    let active = true;
    let createdUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      setZoom(1);
      try {
        let blob: Blob | null = null;
        if (receipt.localId) {
          const local = await getLocalReceipt(receipt.localId);
          if (local?.blob) blob = local.blob;
        }
        if (!blob && receipt.fileId) {
          blob = await downloadDriveFileBlob(receipt.fileId);
        }
        if (!blob) {
          throw new Error('File bukti belum tersedia secara lokal. Masuk ke Google Drive untuk melihatnya.');
        }
        createdUrl = URL.createObjectURL(blob);
        if (active) setObjectUrl(createdUrl);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Gagal memuat bukti pembayaran.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
      setObjectUrl(null);
    };
  }, [receipt]);

  useEffect(() => {
    if (!receipt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(3, z + 0.35));
      if (e.key === '-') setZoom((z) => Math.max(0.5, z - 0.35));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [receipt, onClose]);

  if (!receipt) return null;

  const isPdf = receipt.mimeType === 'application/pdf';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/92 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Pratinjau Bukti Pembayaran"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 text-white pt-safe">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{receipt.fileName}</p>
          <p className="text-xs text-slate-400">
            {formatFileSize(receipt.size)} ·{' '}
            {receipt.uploadStatus === 'uploaded'
              ? 'Tersimpan di Google Drive'
              : 'Menunggu sinkron ke Drive'}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isPdf && objectUrl && (
            <>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.35).toFixed(2))))}
                aria-label="Perkecil"
                className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                aria-label="Reset zoom"
                className="min-h-[44px] px-2.5 rounded-xl text-xs font-medium tabular-nums hover:bg-white/10 transition-colors hidden sm:inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, Number((z + 0.35).toFixed(2))))}
                aria-label="Perbesar"
                className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
            </>
          )}

          {objectUrl && (
            <a
              href={objectUrl}
              download={receipt.fileName}
              aria-label="Unduh bukti"
              className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <Download className="w-5 h-5" />
            </a>
          )}

          {receipt.webViewLink && (
            <a
              href={receipt.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Buka di Drive</span>
              <span className="sm:hidden">Drive</span>
            </a>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pratinjau"
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Viewer Canvas */}
      <div
        className="flex-1 overflow-auto flex items-center justify-center p-4 pb-safe"
        onClick={onClose}
      >
        <div
          className="max-w-full max-h-full flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {loading && (
            <div className="flex flex-col items-center gap-3 text-slate-300">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
              <p className="text-sm">Memuat bukti pembayaran…</p>
            </div>
          )}

          {!loading && error && (
            <div className="max-w-sm text-center rounded-2xl bg-slate-900 border border-slate-800 p-6 text-slate-200">
              <FileText className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="text-sm leading-relaxed">{error}</p>
              {receipt.webViewLink && (
                <a
                  href={receipt.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-sm font-semibold text-white"
                >
                  <ExternalLink className="w-4 h-4" />
                  Buka langsung di Google Drive
                </a>
              )}
            </div>
          )}

          {!loading && !error && objectUrl && (
            isPdf ? (
              <iframe
                src={objectUrl}
                title={receipt.fileName}
                className="w-[90vw] max-w-4xl h-[78dvh] rounded-xl bg-white shadow-2xl"
              />
            ) : (
              <img
                src={objectUrl}
                alt={receipt.fileName}
                referrerPolicy="no-referrer"
                style={{ transform: `scale(${zoom})` }}
                className="max-w-[92vw] max-h-[80dvh] object-contain rounded-xl shadow-2xl transition-transform duration-150 select-none"
              />
            )
          )}
        </div>
      </div>
    </div>
  );
};
