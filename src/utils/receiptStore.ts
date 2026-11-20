/**
 * Penyimpanan lokal bukti pembayaran menggunakan IndexedDB.
 * Memungkinkan pratinjau offline yang cepat serta antrian upload otomatis
 * ketika koneksi kembali online.
 */

const DB_NAME = 'keuangan_harian_receipts_db';
const DB_VERSION = 1;
const STORE_BLOBS = 'receipt_blobs';

export interface StoredReceiptRecord {
  id: string;
  txId: string;
  fileName: string;
  mimeType: string;
  monthFolder: string; // YYYY-MM
  blob: Blob;
  pendingUpload: boolean;
  createdAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalReceipt(record: StoredReceiptRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readwrite');
    tx.objectStore(STORE_BLOBS).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocalReceipt(id: string): Promise<StoredReceiptRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readonly');
    const req = tx.objectStore(STORE_BLOBS).get(id);
    req.onsuccess = () => resolve(req.result as StoredReceiptRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteLocalReceipt(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readwrite');
    tx.objectStore(STORE_BLOBS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingReceipts(): Promise<StoredReceiptRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readonly');
    const req = tx.objectStore(STORE_BLOBS).getAll();
    req.onsuccess = () => {
      const all = (req.result as StoredReceiptRecord[]) || [];
      resolve(all.filter((item) => item.pendingUpload));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function markReceiptUploaded(id: string): Promise<void> {
  const existing = await getLocalReceipt(id);
  if (!existing) return;
  await saveLocalReceipt({ ...existing, pendingUpload: false });
}

export async function clearAllLocalReceipts(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readwrite');
    tx.objectStore(STORE_BLOBS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
