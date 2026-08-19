import type { ResizeCompressConfig } from './types';

/**
 * Takes a cropped canvas (from CropperJS), applies resize and/or compression,
 * and returns a data URL.
 *
 * Pipeline:
 *  1. Compute output dimensions respecting maxWidth / maxHeight / aspectRatio.
 *  2. Draw the cropped canvas onto a new canvas at the output dimensions.
 *  3. If maxSizeBytes is set, binary-search for the highest JPEG quality
 *     that produces a file ≤ maxSizeBytes.
 *  4. Return the final data URL.
 */
export function resizeAndCompress(
  sourceCanvas: HTMLCanvasElement,
  config: ResizeCompressConfig
): string {
  const { maxWidth, maxHeight, maintainAspectRatio, maxSizeBytes } = config;

  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;

  // ── 1. Compute output dimensions ──────────────────────────────────
  let outW = srcW;
  let outH = srcH;

  if (maxWidth !== null || maxHeight !== null) {
    if (maintainAspectRatio) {
      const scaleW = maxWidth  !== null ? maxWidth  / srcW : Infinity;
      const scaleH = maxHeight !== null ? maxHeight / srcH : Infinity;
      const scale  = Math.min(1, scaleW, scaleH); // never upscale
      outW = Math.round(srcW * scale);
      outH = Math.round(srcH * scale);
    } else {
      outW = maxWidth  !== null ? Math.min(srcW, maxWidth)  : srcW;
      outH = maxHeight !== null ? Math.min(srcH, maxHeight) : srcH;
    }
  }

  // ── 2. Draw onto output canvas ────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width  = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(sourceCanvas, 0, 0, outW, outH);

  // ── 3. Quality / compression ──────────────────────────────────────
  if (maxSizeBytes === null) {
    // No size constraint — output at high quality
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  // Binary-search for the highest quality that fits within maxSizeBytes.
  // base64 overhead: every 3 bytes become 4 chars → multiply by 3/4.
  const fits = (dataUrl: string): boolean => {
    const base64 = dataUrl.split(',')[1] ?? '';
    // Rough byte count: base64 length * 3/4, minus padding
    const bytes = Math.floor(base64.length * 0.75);
    return bytes <= maxSizeBytes;
  };

  let lo = 0.01;
  let hi = 0.95;
  let best = canvas.toDataURL('image/jpeg', lo); // guaranteed lowest quality

  // At most 16 iterations — sufficient for < 0.001 quality precision
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const candidate = canvas.toDataURL('image/jpeg', mid);
    if (fits(candidate)) {
      best = candidate;
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < 0.005) break;
  }

  return best;
}

/**
 * Converts a data URL byte-estimate to a human-readable size string.
 */
export function estimateSizeLabel(dataUrl: string): string {
  const base64 = dataUrl.split(',')[1] ?? '';
  const bytes = Math.floor(base64.length * 0.75);
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
