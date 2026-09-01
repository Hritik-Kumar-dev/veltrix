/**
 * detectDocumentRegion.ts
 *
 * Detects the outer boundary of a document (e.g. a sheet of paper photographed
 * on a table) using classical computer-vision techniques via OpenCV.js.
 *
 * Pipeline (mirrors what general-purpose scanner apps do):
 *   1. Convert to grayscale
 *   2. Gaussian blur  — suppress noise before edge detection
 *   3. Canny edge detection
 *   4. findContours
 *   5. Pick the largest-area contour that approximates to a 4-point polygon
 *   6. Return its 4 corners in original-image pixel coordinates
 *
 * OpenCV.js is lazy-loaded the first time this function is called (same
 * pattern as detectFaces.ts with the MediaPipe model).  It is NOT bundled
 * into the main chunk — the dynamic import happens only when Document Auto
 * Crop mode is first used.
 *
 * Returns null (never throws) when:
 *   - no suitable 4-point contour is found
 *   - OpenCV fails to load
 *   - any other internal error occurs
 * The caller is responsible for handling the null case gracefully.
 */

// ── Config ────────────────────────────────────────────────────────────────────

/** Longest side of the downscaled detection canvas (px). */
const DETECT_MAX_SIDE = 800;

/**
 * Canny thresholds.  Low / high follow the classic 1:3 ratio.
 * Increase HIGH_THRESHOLD if too many spurious edges appear on textured
 * backgrounds; decrease if real document edges are missed.
 */
const CANNY_LOW  = 30;
const CANNY_HIGH = 90;

/** Gaussian blur kernel size (must be odd). */
const BLUR_KSIZE = 5;

/**
 * approxPolyDP epsilon as a fraction of the contour's arc length.
 * Higher = more aggressive simplification (easier to hit exactly 4 pts).
 * Lower  = tighter approximation (may over-segment slightly curved edges).
 */
const APPROX_EPSILON_FACTOR = 0.02;

/**
 * Minimum fraction of the detection-canvas area the best contour must cover.
 * Rejects tiny blobs that happen to be quadrilaterals (dust, stamps, etc.).
 */
const MIN_AREA_FRACTION = 0.05;

// ── Types ─────────────────────────────────────────────────────────────────────

/** A 2D point in original-image pixel coordinates. */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * The four corners of the detected document boundary, in original-image pixel
 * coordinates.  Order is top-left, top-right, bottom-right, bottom-left
 * (clockwise from top-left), but callers should treat the ordering as a hint —
 * the perspective overlay allows the user to nudge any corner.
 */
export interface DocumentCorners {
  topLeft:     Point2D;
  topRight:    Point2D;
  bottomRight: Point2D;
  bottomLeft:  Point2D;
}

// ── OpenCV lazy-load ──────────────────────────────────────────────────────────

/**
 * OpenCV.js exposes itself as a global `cv` object after its script runs.
 * We load it dynamically so it never bloats the initial bundle.
 *
 * The module-level promise ensures we only inject the script once even if
 * multiple calls arrive before the first load completes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenCVInstance = any;

let cvCache: OpenCVInstance | null = null;
let cvLoadPromise: Promise<OpenCVInstance> | null = null;

function loadOpenCV(): Promise<OpenCVInstance> {
  // Already loaded
  if (cvCache) return Promise.resolve(cvCache);
  // In-flight
  if (cvLoadPromise) return cvLoadPromise;

  cvLoadPromise = new Promise<OpenCVInstance>((resolve, reject) => {
    // If OpenCV was somehow already on the page (e.g. server-side rendering
    // mock or a previous call that completed before our cache was set), reuse it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.cv && w.cv.Mat) {
      cvCache = w.cv;
      resolve(cvCache);
      return;
    }

    const script = document.createElement('script');
    // Use a pinned CDN version so behaviour is reproducible.
    script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
    script.async = true;

    script.onload = () => {
      // OpenCV.js signals readiness via cv['onRuntimeInitialized'] if the
      // WASM runtime hasn't finished yet when the script loads.
      const check = () => {
        if (w.cv && w.cv.Mat) {
          cvCache = w.cv;
          resolve(cvCache);
        } else {
          // WASM still initialising — poll until ready.
          setTimeout(check, 50);
        }
      };
      // If the runtime is already ready (asm.js build or cached WASM), resolve
      // immediately; otherwise wait for the async WASM init.
      if (w.cv) {
        if (w.cv.onRuntimeInitialized !== undefined) {
          // Hook into OpenCV's own ready callback
          const prev = w.cv.onRuntimeInitialized;
          w.cv.onRuntimeInitialized = () => {
            if (typeof prev === 'function') prev();
            cvCache = w.cv;
            resolve(cvCache);
          };
          // Fallback poll in case the callback was already fired
          check();
        } else {
          check();
        }
      } else {
        check();
      }
    };

    script.onerror = () => {
      cvLoadPromise = null; // allow retry on next call
      reject(new Error('[detectDocumentRegion] Failed to load OpenCV.js'));
    };

    document.head.appendChild(script);
  });

  return cvLoadPromise;
}

// ── Downscale helper ──────────────────────────────────────────────────────────

interface Scaled {
  canvas: HTMLCanvasElement;
  /** scale = detectionWidth / originalWidth  (≤ 1) */
  scale: number;
  origW: number;
  origH: number;
}

async function downscaleToCanvas(source: string): Promise<Scaled> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload  = () => resolve(i);
    i.onerror = reject;
    i.src     = source;
  });

  const origW = img.naturalWidth;
  const origH = img.naturalHeight;
  const scale = Math.min(1, DETECT_MAX_SIDE / Math.max(origW, origH));
  const w     = Math.max(1, Math.round(origW * scale));
  const h     = Math.max(1, Math.round(origH * scale));

  const canvas  = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);

  return { canvas, scale, origW, origH };
}

// ── Corner ordering helper ────────────────────────────────────────────────────

/**
 * Given 4 arbitrary 2D points, return them ordered as
 * [topLeft, topRight, bottomRight, bottomLeft].
 *
 * Strategy: sort by (x + y) — smallest sum = top-left,
 * largest sum = bottom-right.  Then from the remaining two, the one with
 * smaller x is bottom-left, the other is top-right.
 */
function orderCorners(pts: Point2D[]): [Point2D, Point2D, Point2D, Point2D] {
  const sorted = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const tl = sorted[0];
  const br = sorted[3];
  const remaining = [sorted[1], sorted[2]];
  // smaller x → bottom-left; larger x → top-right
  const [bl, tr] = remaining[0].x < remaining[1].x
    ? [remaining[0], remaining[1]]
    : [remaining[1], remaining[0]];
  return [tl, tr, br, bl];
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Detect the outer boundary of a document in `dataUrl`.
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
    // ── Load OpenCV (lazy, cached) ─────────────────────────────────
    const cv = await loadOpenCV();

    // ── Downscale source image ─────────────────────────────────────
    const { canvas: small, scale, origW, origH } = await downscaleToCanvas(dataUrl);
    const detW = small.width;
    const detH = small.height;

    // ── Read pixels into OpenCV Mat ────────────────────────────────
    const src = cv.imread(small);

    // ── Grayscale ──────────────────────────────────────────────────
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    src.delete();

    // ── Gaussian blur ──────────────────────────────────────────────
    const blurred = new cv.Mat();
    const ksize   = new cv.Size(BLUR_KSIZE, BLUR_KSIZE);
    cv.GaussianBlur(gray, blurred, ksize, 0);
    gray.delete();

    // ── Canny edge detection ───────────────────────────────────────
    const edges = new cv.Mat();
    cv.Canny(blurred, edges, CANNY_LOW, CANNY_HIGH);
    blurred.delete();

    // ── Dilate slightly to close small edge gaps ───────────────────
    const dilated  = new cv.Mat();
    const kernel   = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, dilated, kernel);
    edges.delete();
    kernel.delete();

    // ── Find contours ──────────────────────────────────────────────
    const contours  = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    dilated.delete();
    hierarchy.delete();

    // ── Find the best 4-point contour ──────────────────────────────
    const minArea = detW * detH * MIN_AREA_FRACTION;
    let bestPts: Point2D[] | null = null;
    let bestArea = -1;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area    = cv.contourArea(contour);

      if (area < minArea) {
        contour.delete();
        continue;
      }

      // approxPolyDP: simplify the contour
      const peri      = cv.arcLength(contour, true);
      const approx    = new cv.Mat();
      cv.approxPolyDP(contour, approx, APPROX_EPSILON_FACTOR * peri, true);

      if (approx.rows === 4 && area > bestArea) {
        // Extract the 4 points (each row has x, y as Int32)
        const pts: Point2D[] = [];
        for (let r = 0; r < 4; r++) {
          pts.push({
            x: approx.data32S[r * 2],
            y: approx.data32S[r * 2 + 1],
          });
        }
        bestPts  = pts;
        bestArea = area;
      }

      approx.delete();
      contour.delete();
    }

    contours.delete();

    if (!bestPts) return null;

    // ── Scale corners back to original-image coordinates ──────────
    const scaled = bestPts.map((p) => ({
      x: Math.round(Math.min(origW, Math.max(0, p.x / scale))),
      y: Math.round(Math.min(origH, Math.max(0, p.y / scale))),
    }));

    // ── Order corners: TL, TR, BR, BL ─────────────────────────────
    const [tl, tr, br, bl] = orderCorners(scaled);

    return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };

  } catch (err) {
    console.warn('[detectDocumentRegion] detection failed:', err);
    return null;
  }
}
