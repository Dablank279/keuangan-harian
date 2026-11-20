import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import type { DateFormatOption } from '../types';

/** Format angka ke Rupiah: Rp 1.250.000 */
export function formatRupiah(amount: number, showSign = false): string {
  const abs = Math.abs(Math.round(amount));
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (showSign) {
    if (amount > 0) return `+Rp ${formatted}`;
    if (amount < 0) return `-Rp ${formatted}`;
  } else if (amount < 0) {
    return `-Rp ${formatted}`;
  }
  return `Rp ${formatted}`;
}

/** Format Rupiah ringkas untuk sumbu grafik: Rp 1,5 jt / Rp 250 rb */
export function formatRupiahShort(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace('.', ',')} jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp ${Math.round(abs / 1_000)} rb`;
  }
  return `${sign}Rp ${Math.round(abs)}`;
}

/** Format input angka ribuan saat pengguna mengetik: "1250000" -> "1.250.000" */
export function formatThousandsInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const cleaned = digits.replace(/^0+(?=\d)/, '');
  return cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Ambil nilai numerik dari string ber-format ribuan */
export function parseThousandsInput(formatted: string): number {
  const digits = formatted.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

/** Format tanggal sesuai pengaturan pengguna */
export function formatDateBySetting(
  isoDate: string,
  dateFormat: DateFormatOption = 'dd MMM yyyy'
): string {
  try {
    const parsed = parseISO(isoDate);
    return format(parsed, dateFormat, { locale: localeId });
  } catch {
    return isoDate;
  }
}

/** Format jam: HH:mm */
export function formatTime(isoDate: string): string {
  try {
    return format(parseISO(isoDate), 'HH:mm', { locale: localeId });
  } catch {
    return '';
  }
}

/** Label grup tanggal harian di Riwayat: "Hari Ini · 19 Nov 2026" */
export function formatDayGroupLabel(dateKey: string): string {
  try {
    const date = parseISO(dateKey);
    const full = format(date, 'EEEE, d MMM yyyy', { locale: localeId });
    if (isToday(date)) return `Hari Ini · ${format(date, 'd MMM yyyy', { locale: localeId })}`;
    if (isYesterday(date)) return `Kemarin · ${format(date, 'd MMM yyyy', { locale: localeId })}`;
    return full;
  } catch {
    return dateKey;
  }
}

/** Format nama bulan Indonesia: "November 2026" */
export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy', { locale: localeId });
}

/** Konversi Date ke nilai input datetime-local (YYYY-MM-DDTHH:mm) */
export function toDateTimeLocalValue(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** Buat nama file bukti otomatis: YYYY-MM-DD_kategori_nominal_ID.jpg */
export function buildReceiptFileName(params: {
  dateIso: string;
  categoryName: string;
  amount: number;
  txId: string;
  mimeType: string;
}): string {
  const datePart = params.dateIso.slice(0, 10);
  const slugCategory = params.categoryName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24) || 'transaksi';
  const shortId = params.txId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
  const ext = params.mimeType === 'application/pdf' ? 'pdf' : 'jpg';
  return `${datePart}_${slugCategory}_${Math.round(params.amount)}_${shortId}.${ext}`;
}

/** Format ukuran file yang ramah pengguna */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Buat ID unik ringkas */
export function createId(prefix = 'tx'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}
