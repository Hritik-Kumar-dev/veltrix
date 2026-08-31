/**
 * detectFaces.ts
 *
 * Standalone face-detection utility using @mediapipe/tasks-vision FaceDetector.
 * - Fully client-side, no server calls.
 * - Model is lazy-loaded the first time detectFaces() is called, then cached
 *   for the lifetime of the page — never re-loaded between images.
 * - Input image is downscaled to at most DETECT_MAX_SIDE px on its longest
 *   side before detection (for speed). Results are scaled back to the
 *   original image's full-resolution pixel coordinates before returning.
 * - Returns an empty array (never throws) if no faces are found or if the
 *   model fails to load.
 */

import {
  FaceDetector,
  FilesetResolver,
} from '@mediapipe/tasks-vision';

// ── Config ────────────────────────────────────────────────────────────────────

/** Longest side of the downscaled detection canvas (px). */
const DETECT_MAX_SIDE = 800;

/**
 * Minimum confidence threshold for a detection to be included.
 * Lower = more sensitive (more false positives).
 * Higher = stricter (may miss low-quality scans).
 */
const MIN_CONFIDENCE = 0.4;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FaceBox {
  /** Left edge in original image pixels */
  x: number;
  /** Top edge in original image pixels */
  y: number;
  /** Width in original image pixels */
  width: number;
  /** Height in original image pixels */
  height: number;
  /** Detection confidence [0..1] */
  confidence: number;
}

// ── Module-level cache ────────────────────────────────────────────────────────

/** Cached detector instance — created on first use, reused forever after. */
let detectorCache: FaceDetector | null = null;
/** Promise in flight during initialization so concurrent calls don't double-load. */
let initPromise: Promise<FaceDetector> | null = null;

async function getDetector(): Promise<FaceDetector> {
  if (detectorCache) return detectorCache;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      // Use the CDN-hosted WASM bundle so we don't need to vendor it.
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
    );
    const detector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      minDetectionConfidence: MIN_CONFIDENCE,
    });
    detectorCache = detector;
    return detector;
  })();

  try {
    return await initPromise;
  } finally {
    // Clear the in-flight promise so a failed init can be retried on the
    // next call, while a successful one just reads from detectorCache.
    if (!detectorCache) initPromise = null;
  }
}

// ── Downscale helper ──────────────────────────────────────────────────────────

interface ScaledCanvas {
  canvas: HTMLCanvasElement;
  /** scale = detectionWidth / originalWidth */
  scale: number;
}

function downscaleImage(
  img: HTMLImageElement | HTMLCanvasElement,
  maxSide: number,
): ScaledCanvas {
  const origW = img instanceof HTMLImageElement ? img.naturalWidth  : img.width;
  const origH = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const scale = Math.min(1, maxSide / Math.max(origW, origH));
  const w = Math.max(1, Math.round(origW * scale));
  const h = Math.max(1, Math.round(origH * scale));

  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return { canvas, scale };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Detect faces in `source` and return bounding boxes in *original image*
 * pixel coordinates, sorted by confidence descending.
 *
 * Never throws — returns [] on any error.
 */
export async function detectFaces(
  source: HTMLImageElement | string,
): Promise<FaceBox[]> {
  try {
    // Resolve data URL to an HTMLImageElement if needed
    const img = await resolveImage(source);
    const origW = img.naturalWidth;
    const origH = img.naturalHeight;

    // Downscale for detection
    const { canvas: small, scale } = downscaleImage(img, DETECT_MAX_SIDE);

    // Load (or reuse cached) detector
    const detector = await getDetector();

    // Run detection on the downscaled canvas
    const result = detector.detect(small);

    if (!result.detections || result.detections.length === 0) return [];

    // Map bounding boxes back to original resolution and sort by confidence
    const boxes: FaceBox[] = result.detections
      .map((det) => {
        const bb   = det.boundingBox!;
        const conf = det.categories?.[0]?.score ?? 0;
        return {
          x:          bb.originX      / scale,
          y:          bb.originY      / scale,
          width:      bb.width        / scale,
          height:     bb.height       / scale,
          confidence: conf,
        };
      })
      // Clamp to image bounds (detection can sometimes report coords outside)
      .map((b) => ({
        ...b,
        x:      Math.max(0, Math.min(b.x,      origW)),
        y:      Math.max(0, Math.min(b.y,      origH)),
        width:  Math.min(b.width,  origW - b.x),
        height: Math.min(b.height, origH - b.y),
      }))
      .filter((b) => b.width > 0 && b.height > 0)
      .sort((a, b) => b.confidence - a.confidence);

    return boxes;
  } catch (err) {
    console.warn('[detectFaces] detection failed, returning empty:', err);
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveImage(source: HTMLImageElement | string): Promise<HTMLImageElement> {
  if (typeof source !== 'string') {
    // Already an img element — ensure it's loaded
    if (source.complete && source.naturalWidth > 0) return Promise.resolve(source);
    return new Promise((resolve, reject) => {
      source.onload = () => resolve(source);
      source.onerror = reject;
    });
  }
  // Data URL or URL string
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = source;
  });
}
