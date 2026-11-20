/**
 * Layanan Google Identity Services (OAuth 2.0) & Google Drive API v3.
 *
 * Keamanan:
 * - Scope minimal: hanya https://www.googleapis.com/auth/drive.file
 *   (aplikasi HANYA dapat melihat & mengelola file/folder yang dibuatnya sendiri).
 * - Client ID dibaca dari env VITE_GOOGLE_CLIENT_ID (tidak pernah di-hardcode).
 * - Access token disimpan di memori + sessionStorage (bukan localStorage).
 */

import type { AppData, DriveBackupItem, DriveFolders, GoogleUser } from '../types';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const SESSION_TOKEN_KEY = 'kh_gis_token';
const SESSION_EXPIRY_KEY = 'kh_gis_expiry';
const SESSION_USER_KEY = 'kh_gis_user';
const SESSION_FOLDERS_KEY = 'kh_gis_folders';

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (options?: { prompt?: '' | 'consent' | 'select_account' }) => void;
}

export class DriveServiceError extends Error {
  code: 'NO_CLIENT_ID' | 'OFFLINE' | 'UNAUTHORIZED' | 'QUOTA_EXCEEDED' | 'PERMISSION_DENIED' | 'GIS_NOT_LOADED' | 'UNKNOWN';

  constructor(
    message: string,
    code: DriveServiceError['code'] = 'UNKNOWN'
  ) {
    super(message);
    this.name = 'DriveServiceError';
    this.code = code;
  }
}

// Token di memori untuk akses cepat
let memoryToken: string | null = null;
let memoryExpiry = 0;

/** Baca Google OAuth Client ID dari environment Vite */
export function getGoogleClientId(): string {
  const raw = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  if (!raw || raw === 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com') {
    return '';
  }
  return raw;
}

export function isGoogleClientConfigured(): boolean {
  return Boolean(getGoogleClientId());
}

function saveTokenSession(token: string, expiresInSec: number): void {
  const expiry = Date.now() + Math.max(expiresInSec - 60, 60) * 1000;
  memoryToken = token;
  memoryExpiry = expiry;
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    sessionStorage.setItem(SESSION_EXPIRY_KEY, String(expiry));
  } catch {
    // Abaikan jika sessionStorage tidak tersedia (misal mode privat ketat)
  }
}

export function getStoredToken(): string | null {
  if (memoryToken && Date.now() < memoryExpiry) {
    return memoryToken;
  }
  try {
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    const expiry = Number(sessionStorage.getItem(SESSION_EXPIRY_KEY) || '0');
    if (token && Date.now() < expiry) {
      memoryToken = token;
      memoryExpiry = expiry;
      return token;
    }
  } catch {
    // Abaikan
  }
  return null;
}

export function getStoredUser(): GoogleUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    return raw ? (JSON.parse(raw) as GoogleUser) : null;
  } catch {
    return null;
  }
}

export function getStoredFolders(): DriveFolders | null {
  try {
    const raw = sessionStorage.getItem(SESSION_FOLDERS_KEY);
    return raw ? (JSON.parse(raw) as DriveFolders) : null;
  } catch {
    return null;
  }
}

function clearSession(): void {
  memoryToken = null;
  memoryExpiry = 0;
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_EXPIRY_KEY);
    sessionStorage.removeItem(SESSION_USER_KEY);
    sessionStorage.removeItem(SESSION_FOLDERS_KEY);
  } catch {
    // Abaikan
  }
}

/** Minta akses token baru melalui popup Google Identity Services */
export function requestGoogleAccessToken(prompt: '' | 'consent' | 'select_account' = 'select_account'): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!navigator.onLine) {
      reject(new DriveServiceError('Tidak ada koneksi internet. Periksa jaringan Anda lalu coba lagi.', 'OFFLINE'));
      return;
    }

    const clientId = getGoogleClientId();
    if (!clientId) {
      reject(
        new DriveServiceError(
          'VITE_GOOGLE_CLIENT_ID belum diatur di file .env. Lihat panduan setup Google Cloud di Pengaturan.',
          'NO_CLIENT_ID'
        )
      );
      return;
    }

    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      reject(
        new DriveServiceError(
          'Layanan Google Identity belum selesai dimuat. Pastikan koneksi stabil lalu coba lagi.',
          'GIS_NOT_LOADED'
        )
      );
      return;
    }

    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) {
          if (response.error === 'access_denied') {
            reject(
              new DriveServiceError(
                'Izin akses Google Drive ditolak. Aplikasi memerlukan izin drive.file untuk menyimpan data Anda.',
                'PERMISSION_DENIED'
              )
            );
          } else {
            reject(
              new DriveServiceError(
                `Gagal masuk dengan Google: ${response.error_description || response.error}`,
                'UNKNOWN'
              )
            );
          }
          return;
        }

        if (!response.access_token) {
          reject(new DriveServiceError('Token akses tidak diterima dari Google.', 'UNAUTHORIZED'));
          return;
        }

        saveTokenSession(response.access_token, response.expires_in || 3600);
        resolve(response.access_token);
      },
      error_callback: (err) => {
        const msg =
          err.type === 'popup_closed'
            ? 'Jendela login Google ditutup sebelum selesai.'
            : err.type === 'popup_failed_to_open'
            ? 'Popup login diblokir oleh browser. Izinkan popup untuk situs ini.'
            : 'Terjadi kendala saat membuka login Google.';
        reject(new DriveServiceError(msg, 'PERMISSION_DENIED'));
      },
    });

    tokenClient.requestAccessToken({ prompt });
  });
}

/** Keluar dari Google Drive & cabut token sesi */
export function signOutGoogle(): void {
  const token = getStoredToken();
  if (token && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(token);
    } catch {
      // Abaikan jika gagal revoke
    }
  }
  clearSession();
}

/** Helper fetch Drive API dengan penanganan error Bahasa Indonesia & deteksi token kedaluwarsa */
async function driveFetch(url: string, init: RequestInit = {}, retryRefresh = true): Promise<Response> {
  if (!navigator.onLine) {
    throw new DriveServiceError('Koneksi internet terputus. Perubahan disimpan di perangkat Anda.', 'OFFLINE');
  }

  const token = getStoredToken();
  if (!token) {
    throw new DriveServiceError('Sesi Google Anda telah berakhir. Silakan masuk kembali.', 'UNAUTHORIZED');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch {
    throw new DriveServiceError('Gagal menghubungi Google Drive. Periksa koneksi internet Anda.', 'OFFLINE');
  }

  if (res.status === 401 && retryRefresh) {
    try {
      await requestGoogleAccessToken('');
      return driveFetch(url, init, false);
    } catch {
      clearSession();
      throw new DriveServiceError('Sesi Google kedaluwarsa. Data lokal aman, silakan masuk ulang.', 'UNAUTHORIZED');
    }
  }

  if (!res.ok) {
    let reason = '';
    let message = '';
    try {
      const errJson = await res.json();
      reason = errJson?.error?.errors?.[0]?.reason || '';
      message = errJson?.error?.message || '';
    } catch {
      // Abaikan body bukan JSON
    }

    if (res.status === 403 && reason === 'storageQuotaExceeded') {
      throw new DriveServiceError('Kuota penyimpanan Google Drive Anda penuh. Kosongkan ruang lalu coba lagi.', 'QUOTA_EXCEEDED');
    }
    if (res.status === 403) {
      throw new DriveServiceError('Izin akses Google Drive tidak mencukupi. Coba masuk ulang.', 'PERMISSION_DENIED');
    }
    if (res.status === 401) {
      throw new DriveServiceError('Sesi login Google kedaluwarsa. Silakan masuk ulang.', 'UNAUTHORIZED');
    }
    throw new DriveServiceError(
      message ? `Gagal mengakses Drive: ${message}` : `Terjadi kesalahan Google Drive (${res.status}).`,
      'UNKNOWN'
    );
  }

  return res;
}

/** Ambil profil pengguna Google (nama, email, foto) memakai endpoint Drive About tanpa scope tambahan */
export async function fetchGoogleUserProfile(): Promise<GoogleUser> {
  const res = await driveFetch(`${DRIVE_API}/about?fields=user(displayName,emailAddress,photoLink)`);
  const data = await res.json();
  const user: GoogleUser = {
    name: data.user?.displayName || 'Pengguna Google',
    email: data.user?.emailAddress || '',
    photoUrl: data.user?.photoLink,
  };
  try {
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  } catch {
    // Abaikan
  }
  return user;
}

/** Cari folder di Drive berdasarkan nama & parent (tidak pernah membuat duplikat) */
async function findOrCreateFolder(
  name: string,
  parentId?: string
): Promise<{ id: string; webViewLink: string }> {
  const escaped = name.replace(/'/g, "\\'");
  const parentFilter = parentId ? ` and '${parentId}' in parents` : ` and 'root' in parents`;
  const q = `mimeType='application/vnd.google-apps.folder' and name='${escaped}' and trashed=false${parentFilter}`;

  const searchRes = await driveFetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&spaces=drive&pageSize=1`
  );
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    const found = searchData.files[0];
    return {
      id: found.id,
      webViewLink: found.webViewLink || `https://drive.google.com/drive/folders/${found.id}`,
    };
  }

  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const createRes = await driveFetch(`${DRIVE_API}/files?fields=id,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });
  const created = await createRes.json();
  return {
    id: created.id,
    webViewLink: created.webViewLink || `https://drive.google.com/drive/folders/${created.id}`,
  };
}

/**
 * Pastikan struktur folder standar sudah tersedia di Google Drive:
 * Keuangan Harian/
 * ├── data/
 * ├── bukti/
 * ├── backup/
 * └── laporan/
 */
export async function ensureDriveStructure(): Promise<DriveFolders> {
  const root = await findOrCreateFolder('Keuangan Harian');
  const [dataFolder, buktiFolder, backupFolder, laporanFolder] = await Promise.all([
    findOrCreateFolder('data', root.id),
    findOrCreateFolder('bukti', root.id),
    findOrCreateFolder('backup', root.id),
    findOrCreateFolder('laporan', root.id),
  ]);

  // Cek apakah data/transaksi.json sudah ada
  const q = `name='transaksi.json' and '${dataFolder.id}' in parents and trashed=false`;
  const searchRes = await driveFetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`
  );
  const searchJson = await searchRes.json();
  const transaksiFileId = searchJson.files?.[0]?.id as string | undefined;

  const folders: DriveFolders = {
    rootId: root.id,
    rootUrl: root.webViewLink,
    dataFolderId: dataFolder.id,
    buktiFolderId: buktiFolder.id,
    backupFolderId: backupFolder.id,
    laporanFolderId: laporanFolder.id,
    transaksiFileId,
  };

  try {
    sessionStorage.setItem(SESSION_FOLDERS_KEY, JSON.stringify(folders));
  } catch {
    // Abaikan
  }

  return folders;
}

/** Baca isi data/transaksi.json dari Drive (null jika belum pernah dibuat) */
export async function readRemoteAppData(folders: DriveFolders): Promise<AppData | null> {
  if (!folders.transaksiFileId) return null;
  const res = await driveFetch(`${DRIVE_API}/files/${folders.transaksiFileId}?alt=media`);
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text) as AppData;
}

/** Simpan/perbarui data/transaksi.json di Drive */
export async function writeRemoteAppData(
  folders: DriveFolders,
  data: AppData
): Promise<DriveFolders> {
  const jsonBlob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });

  if (folders.transaksiFileId) {
    await driveFetch(`${DRIVE_UPLOAD_API}/files/${folders.transaksiFileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: jsonBlob,
    });
    return folders;
  }

  const uploaded = await uploadMultipartToDrive({
    fileName: 'transaksi.json',
    mimeType: 'application/json',
    parentId: folders.dataFolderId,
    blob: jsonBlob,
  });

  const updatedFolders: DriveFolders = {
    ...folders,
    transaksiFileId: uploaded.id,
  };
  try {
    sessionStorage.setItem(SESSION_FOLDERS_KEY, JSON.stringify(updatedFolders));
  } catch {
    // Abaikan
  }
  return updatedFolders;
}

/** Unggah bukti pembayaran ke folder bukti/YYYY-MM/ dengan progress bar nyata (XHR) */
export async function uploadReceiptToDrive(params: {
  folders: DriveFolders;
  monthFolderName: string; // YYYY-MM
  fileName: string;
  mimeType: string;
  blob: Blob;
  onProgress?: (percent: number) => void;
}): Promise<{ fileId: string; webViewLink: string }> {
  const monthFolder = await findOrCreateFolder(params.monthFolderName, params.folders.buktiFolderId);
  const uploaded = await uploadMultipartToDrive({
    fileName: params.fileName,
    mimeType: params.mimeType,
    parentId: monthFolder.id,
    blob: params.blob,
    onProgress: params.onProgress,
  });
  return {
    fileId: uploaded.id,
    webViewLink: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
  };
}

/** Unggah salinan laporan CSV/PDF ke folder laporan/ */
export async function uploadReportToDrive(params: {
  folders: DriveFolders;
  fileName: string;
  mimeType: string;
  blob: Blob;
}): Promise<{ fileId: string; webViewLink: string }> {
  const uploaded = await uploadMultipartToDrive({
    fileName: params.fileName,
    mimeType: params.mimeType,
    parentId: params.folders.laporanFolderId,
    blob: params.blob,
  });
  return {
    fileId: uploaded.id,
    webViewLink: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
  };
}

/** Buat file backup JSON di folder backup/ */
export async function createDriveBackup(
  folders: DriveFolders,
  data: AppData,
  prefix = 'backup',
  customFileName?: string
): Promise<DriveBackupItem> {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const fileName = customFileName || `${prefix}_${stamp}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const uploaded = await uploadMultipartToDrive({
    fileName,
    mimeType: 'application/json',
    parentId: folders.backupFolderId,
    blob,
  });
  return {
    id: uploaded.id,
    name: fileName,
    createdTime: new Date().toISOString(),
    size: String(blob.size),
    webViewLink: uploaded.webViewLink,
  };
}

/** Hapus satu file/folder buatan aplikasi di Google Drive (aman untuk scope drive.file) */
async function deleteDriveItem(fileId: string): Promise<void> {
  if (!navigator.onLine) {
    throw new DriveServiceError('Koneksi internet terputus saat menghapus file di Drive.', 'OFFLINE');
  }
  const token = getStoredToken();
  if (!token) {
    throw new DriveServiceError('Sesi Google berakhir. Silakan masuk ulang.', 'UNAUTHORIZED');
  }

  let res: Response;
  try {
    res = await fetch(`${DRIVE_API}/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new DriveServiceError('Gagal menghubungi Google Drive saat menghapus file.', 'OFFLINE');
  }

  if (res.status === 404) return; // Sudah terhapus
  if (res.status === 401) {
    await requestGoogleAccessToken('');
    return deleteDriveItem(fileId);
  }
  if (!res.ok) {
    throw new DriveServiceError(`Gagal menghapus file di Google Drive (kode ${res.status}).`, 'UNKNOWN');
  }
}

/** Daftar semua child dalam sebuah folder Drive (mendukung pagination) */
async function listFolderChildren(folderId: string): Promise<Array<{ id: string; mimeType: string }>> {
  const items: Array<{ id: string; mimeType: string }> = [];
  let pageToken = '';

  do {
    const q = `'${folderId}' in parents and trashed=false`;
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const res = await driveFetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,mimeType)&pageSize=1000${tokenParam}`
    );
    const json = await res.json();
    if (Array.isArray(json.files)) {
      items.push(...json.files);
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);

  return items;
}

/** Hapus file data/transaksi.json dari Google Drive sambil menjaga sesi login & folder induk tetap ada */
export async function deleteRemoteTransaksiFile(folders: DriveFolders): Promise<DriveFolders> {
  if (folders.transaksiFileId) {
    await deleteDriveItem(folders.transaksiFileId);
  } else {
    const q = `name='transaksi.json' and '${folders.dataFolderId}' in parents and trashed=false`;
    const searchRes = await driveFetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=10`
    );
    const searchJson = await searchRes.json();
    for (const file of searchJson.files || []) {
      await deleteDriveItem(file.id);
    }
  }

  const updated: DriveFolders = {
    ...folders,
    transaksiFileId: undefined,
  };
  try {
    sessionStorage.setItem(SESSION_FOLDERS_KEY, JSON.stringify(updated));
  } catch {
    // Abaikan
  }
  return updated;
}

/** Hapus seluruh foto/PDF bukti pembayaran di dalam folder bukti/ (membiarkan folder induk tetap ada) */
export async function deleteAllDriveReceipts(folders: DriveFolders): Promise<number> {
  const topEntries = await listFolderChildren(folders.buktiFolderId);
  let deletedCount = 0;

  for (const entry of topEntries) {
    if (entry.mimeType === 'application/vnd.google-apps.folder') {
      const subFiles = await listFolderChildren(entry.id);
      for (const file of subFiles) {
        await deleteDriveItem(file.id);
        deletedCount++;
      }
      await deleteDriveItem(entry.id);
    } else {
      await deleteDriveItem(entry.id);
      deletedCount++;
    }
  }

  return deletedCount;
}

/** Ambil daftar file backup di folder backup/ */
export async function listDriveBackups(folders: DriveFolders): Promise<DriveBackupItem[]> {
  const q = `'${folders.backupFolderId}' in parents and trashed=false and mimeType='application/json'`;
  const res = await driveFetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&orderBy=createdTime desc&fields=files(id,name,createdTime,size,webViewLink)&pageSize=20`
  );
  const data = await res.json();
  return (data.files || []) as DriveBackupItem[];
}

/** Muat isi file backup untuk proses restore */
export async function readDriveBackup(fileId: string): Promise<AppData> {
  const res = await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`);
  return (await res.json()) as AppData;
}

/** Unduh file bukti dari Drive sebagai Blob (untuk Lightbox & ZIP export) */
export async function downloadDriveFileBlob(fileId: string): Promise<Blob> {
  const res = await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`);
  return await res.blob();
}

/** Multipart upload memakai XMLHttpRequest agar mendukung progress bar presisi */
function uploadMultipartToDrive(params: {
  fileName: string;
  mimeType: string;
  parentId: string;
  blob: Blob;
  onProgress?: (percent: number) => void;
}): Promise<{ id: string; webViewLink?: string }> {
  return new Promise((resolve, reject) => {
    if (!navigator.onLine) {
      reject(new DriveServiceError('Koneksi terputus saat mengunggah file.', 'OFFLINE'));
      return;
    }

    const token = getStoredToken();
    if (!token) {
      reject(new DriveServiceError('Sesi Google tidak ditemukan. Silakan masuk ulang.', 'UNAUTHORIZED'));
      return;
    }

    const boundary = 'keuangan_harian_boundary_' + Date.now();
    const metadata = JSON.stringify({
      name: params.fileName,
      mimeType: params.mimeType,
      parents: [params.parentId],
    });

    const preamble = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`;
    const epilogue = `\r\n--${boundary}--`;
    const multipartBody = new Blob([preamble, params.blob, epilogue], {
      type: `multipart/related; boundary=${boundary}`,
    });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && params.onProgress) {
        params.onProgress(Math.min(99, Math.round((evt.loaded / evt.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        params.onProgress?.(100);
        try {
          const parsed = JSON.parse(xhr.responseText);
          resolve({ id: parsed.id, webViewLink: parsed.webViewLink });
        } catch {
          reject(new DriveServiceError('Respons Google Drive tidak valid.', 'UNKNOWN'));
        }
      } else if (xhr.status === 401) {
        reject(new DriveServiceError('Sesi login kedaluwarsa saat mengunggah bukti.', 'UNAUTHORIZED'));
      } else if (xhr.status === 403 && xhr.responseText.includes('storageQuotaExceeded')) {
        reject(new DriveServiceError('Kuota Google Drive Anda penuh.', 'QUOTA_EXCEEDED'));
      } else {
        reject(new DriveServiceError(`Gagal mengunggah file (kode ${xhr.status}).`, 'UNKNOWN'));
      }
    };

    xhr.onerror = () => {
      reject(new DriveServiceError('Koneksi jaringan terputus saat mengunggah file.', 'OFFLINE'));
    };

    xhr.send(multipartBody);
  });
}
