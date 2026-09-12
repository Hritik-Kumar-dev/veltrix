/**
 * detectDocumentRegion.ts
 *
 * Detects the outer boundary of a document (e.g. a sheet of paper photographed
 * on a table) using a pure-JS computer-vision pipeline running in a Web Worker.
 *
 * WHY NO OPENCV.JS
 * ─────────────────
 * The previous implementation used opencv.js (4.8.0) from CDN. That build
 * embeds the entire ~7.5 MB WASM binary as a base64 data URI inside a ~10 MB
 * JS file. Executing and parsing that file blocks the browser's main thread
 * for several seconds on typical hardware — causing the "entire UI freezes"
 * bug. There is no way to load opencv.js without this block; it is a
 * structural property of that build artifact.
 *
 * THE FIX
 * ────────
 * All image processing now runs in a dedicated Web Worker (documentDetect.worker.ts).
 * The main thread:
 *   1. Draws the (downscaled) image onto an OffscreenCanvas / regular canvas
 *   2. Transfers the raw pixel bytes to the worker via postMessage (zero-copy
 *      when using transferable ArrayBuffer)
 *   3. Awaits the result — the main thread is free to handle UI events while
 *      waiting
 *   4. Maps the detection-resolution coordinates back to original-image space
 *
 * The worker runs a pure-JS pipeline:
 *   Grayscale → Gaussian blur → Sobel → NMS → Hysteresis threshold →
 *   Convex hull → RDP simplification → best-4-corner quad
 *
 * Returns null (never throws) when no suitable document boundary is found or
 * any error occurs. The caller is responsible for the null case.
 */

// ── Config ────────────────────────────────────────────────────────────────────

/** Longest side of the downscaled detection canvas (px). */
const DETECT_MAX_SIDE = 800;

/**
 * Maximum time (ms) to wait for the worker to respond.
 * Acts as a last-resort safeguard — the pipeline should complete well under 1s
 * for an 800px image on any modern device.
 */
const WORKER_TIMEOUT_MS = 8_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Point2D {
  x: number;
  y: number;
}

export interface DocumentCorners {
  topLeft:     Point2D;
  topRight:    Point2D;
  bottomRight: Point2D;
  bottomLeft:  Point2D;
}

// ── Worker pool (single reusable worker) ─────────────────────────────────────

let workerInstance: Worker | null = null;

/**
 * Returns the shared worker, creating it on first call.
 * If the worker has terminated (error/crash), it is recreated.
 */
function getWorker(): Worker {
  if (!workerInstance) {
    // Vite handles the `?worker` suffix: bundles the worker into a separate
    // chunk and returns a Worker constructor.
    workerInstance = new Worker(
      new URL('./documentDetect.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerInstance.onerror = (e) => {
      console.error('[detectDocumentRegion] worker error:', e);
      // Force recreation on next call
      workerInstance?.terminate();
      workerInstance = null;
    };
  }
  return workerInstance;
}

// ── Downscale helper ──────────────────────────────────────────────────────────

interface Scaled {
  imageData: ImageData;
  scale:     number;
  origW:     number;
  origH:     number;
}

async function downscaleToImageData(dataUrl: string): Promise<Scaled> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i  = new Image();
    i.onload  = () => resolve(i);
    i.onerror = () => reject(new Error('Failed to decode image'));
    i.src     = dataUrl;
  });

  const origW = img.naturalWidth;
  const origH = img.naturalHeight;
  const scale = Math.min(1, DETECT_MAX_SIDE / Math.max(origW, origH));
  const w     = Math.max(1, Math.round(origW * scale));
  const h     = Math.max(1, Math.round(origH * scale));

  const canvas  = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);

  return { imageData: ctx.getImageData(0, 0, w, h), scale, origW, origH };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Detect the outer boundary of a document in `dataUrl`.
 *
 * Runs in a Web Worker — the main thread is never blocked.
 *
 * @param dataUrl  Base64 data URL of the original image.
 * @returns        Four corners in original-image pixel coordinates, or null
 *                 if no clear document boundary was found.
 *
 * Never throws — returns null on any error.
 */
export async function detectDocumentRegion(
  dataUrl: string,
): Promise<DocumentCorners | null> {
  try {
    // ── Downscale on main thread (fast canvas op) ──────────────────
    const { imageData, scale, origW, origH } = await downscaleToImageData(dataUrl);
    const { width: w, height: h, data } = imageData;

    // ── Dispatch to worker ─────────────────────────────────────────
    const worker = getWorker();

    // Clone the pixel buffer so we can transfer ownership (zero-copy).
    const dataCopy = new Uint8ClampedArray(data.buffer.slice(0));

    const workerResult = await new Promise<DocumentCorners | null>((resolve) => {
      // Per-call timeout: if the worker doesn't respond within WORKER_TIMEOUT_MS
      // we resolve with null rather than hanging indefinitely.
      const timer = setTimeout(() => {
        console.warn('[detectDocumentRegion] worker timed out — falling back to null');
        resolve(null);
      }, WORKER_TIMEOUT_MS);

      const handler = (e: MessageEvent) => {
        clearTimeout(timer);
        worker.removeEventListener('message', handler);
        resolve(e.data as DocumentCorners | null);
      };
      worker.addEventListener('message', handler);

      // Transfer the buffer (avoids copying ~2.5 MB for an 800-px image).
      worker.postMessage(
        { width: w, height: h, data: dataCopy },
        [dataCopy.buffer],
      );
    });

    if (!workerResult) return null;

    // ── Map detection coordinates → original-image coordinates ─────
    const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = workerResult;

    const mapPt = (p: Point2D): Point2D => ({
      x: Math.round(Math.min(origW, Math.max(0, p.x / scale))),
      y: Math.round(Math.min(origH, Math.max(0, p.y / scale))),
    });

    return {
      topLeft:     mapPt(tl),
      topRight:    mapPt(tr),
      bottomRight: mapPt(br),
      bottomLeft:  mapPt(bl),
    };

  } catch (err) {
    console.warn('[detectDocumentRegion] failed:', err);
    return null;
  }
}
