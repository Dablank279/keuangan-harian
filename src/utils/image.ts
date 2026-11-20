const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export interface ProcessedReceiptFile {
  blob: Blob;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
}

/** Validasi ukuran maks 10 MB & tipe file jpg/png/webp/pdf */
export function validateReceiptFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return 'Format file tidak didukung. Gunakan JPG, PNG, WebP, atau PDF.';
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'Ukuran file terlalu besar. Maksimal 10 MB.';
  }
  return null;
}

/**
 * Kompres gambar otomatis menggunakan Canvas (maks 1280px, kualitas JPEG 0.8).
 * File PDF diteruskan apa adanya tanpa kompresi gambar.
 */
export async function compressReceiptFile(
  file: File,
  maxDimension = 1280,
  quality = 0.8
): Promise<ProcessedReceiptFile> {
  const validationError = validateReceiptFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  if (file.type === 'application/pdf') {
    return {
      blob: file,
      mimeType: 'application/pdf',
      originalSize: file.size,
      compressedSize: file.size,
      wasCompressed: false,
    };
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(imageUrl);
    let { width, height } = img;

    if (width > maxDimension || height > maxDimension) {
      if (width >= height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Gagal memproses gambar di browser.');
    }

    // Latar belakang putih agar PNG transparan rapi saat dikonversi ke JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const compressedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Gagal mengompres gambar bukti pembayaran.'));
        },
        'image/jpeg',
        quality
      );
    });

    return {
      blob: compressedBlob,
      mimeType: 'image/jpeg',
      originalSize: file.size,
      compressedSize: compressedBlob.size,
      wasCompressed: true,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
    img.src = src;
  });
}
