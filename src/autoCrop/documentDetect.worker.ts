/// <reference lib="webworker" />
/**
 * documentDetect.worker.ts
 *
 * Web Worker for document edge detection.
 * Runs entirely off the main thread so the UI never freezes.
 *
 * Algorithm (pure JS, no external libraries):
 *   1. Receive ImageData from main thread
 *   2. Grayscale
 *   3. 5×5 Gaussian blur
 *   4. Sobel edge magnitude
 *   5. Hysteresis threshold → binary edge map
 *   6. Collect edge pixel coordinates
 *   7. Compute convex hull of edge pixels (Andrew's monotone chain)
 *   8. Ramer-Douglas-Peucker simplification → find best 4-point polygon
 *   9. Order corners TL/TR/BR/BL and return to main thread
 *
 * Message protocol:
 *   IN:  { width, height, data: Uint8ClampedArray }  (raw RGBA pixels)
 *   OUT: { topLeft, topRight, bottomRight, bottomLeft } | null
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface Pt { x: number; y: number; }

interface WorkerInput {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface WorkerOutput {
  topLeft:     Pt;
  topRight:    Pt;
  bottomRight: Pt;
  bottomLeft:  Pt;
}

// ── Config ────────────────────────────────────────────────────────────────────

/** Strong edge threshold (0–255). Pixels above this are definitely edges. */
const THRESH_HIGH = 60;
/** Weak edge threshold. Pixels between LOW and HIGH are edges only if
 *  connected to a strong edge. */
const THRESH_LOW  = 20;
/** Minimum fraction of image area the best quad must cover. */
const MIN_AREA_FRACTION = 0.04;

// ── Step 1: Grayscale ─────────────────────────────────────────────────────────

function toGray(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const b = i * 4;
    // Rec. 709 luma coefficients
    out[i] = 0.2126 * data[b] + 0.7152 * data[b + 1] + 0.0722 * data[b + 2];
  }
  return out;
}

// ── Step 2: Gaussian blur (5×5 kernel, σ≈1.0) ────────────────────────────────

const GAUSS_5 = [
  2, 4, 5, 4, 2,
  4, 9,12, 9, 4,
  5,12,15,12, 5,
  4, 9,12, 9, 4,
  2, 4, 5, 4, 2,
]; // sum = 159

function gaussianBlur(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const r = 2; // radius
  const norm = 159;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let ky = -r; ky <= r; ky++) {
        const sy = Math.min(h - 1, Math.max(0, y + ky));
        for (let kx = -r; kx <= r; kx++) {
          const sx = Math.min(w - 1, Math.max(0, x + kx));
          sum += GAUSS_5[(ky + r) * 5 + (kx + r)] * src[sy * w + sx];
        }
      }
      out[y * w + x] = sum / norm;
    }
  }
  return out;
}

// ── Step 3: Sobel edge magnitude + angle ─────────────────────────────────────

interface SobelResult {
  mag: Float32Array;
  angle: Float32Array; // degrees
}

function sobel(src: Float32Array, w: number, h: number): SobelResult {
  const mag   = new Float32Array(w * h);
  const angle = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = src[(y-1)*w + (x-1)], tc = src[(y-1)*w + x], tr = src[(y-1)*w + (x+1)];
      const ml = src[ y   *w + (x-1)],                         mr = src[ y   *w + (x+1)];
      const bl = src[(y+1)*w + (x-1)], bc = src[(y+1)*w + x], br2 = src[(y+1)*w + (x+1)];
      const gx = -tl - 2*ml - bl + tr + 2*mr + br2;
      const gy = -tl - 2*tc - tr + bl + 2*bc + br2;
      mag[y * w + x]   = Math.sqrt(gx*gx + gy*gy);
      angle[y * w + x] = Math.atan2(gy, gx) * (180 / Math.PI);
    }
  }
  return { mag, angle };
}

// ── Step 4: Non-maximum suppression ──────────────────────────────────────────

function nonMaxSuppression(mag: Float32Array, angle: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const m   = mag[idx];
      if (m === 0) continue;

      // Snap gradient direction to 0°, 45°, 90°, 135°
      let a = angle[idx];
      if (a < 0) a += 180;

      let n1: number, n2: number;
      if (a < 22.5 || a >= 157.5) {
        n1 = mag[idx - 1]; n2 = mag[idx + 1];
      } else if (a < 67.5) {
        n1 = mag[(y-1)*w + (x+1)]; n2 = mag[(y+1)*w + (x-1)];
      } else if (a < 112.5) {
        n1 = mag[(y-1)*w + x]; n2 = mag[(y+1)*w + x];
      } else {
        n1 = mag[(y-1)*w + (x-1)]; n2 = mag[(y+1)*w + (x+1)];
      }

      out[idx] = (m >= n1 && m >= n2) ? m : 0;
    }
  }
  return out;
}

// ── Step 5: Hysteresis thresholding ──────────────────────────────────────────

function hysteresisThreshold(nms: Float32Array, w: number, h: number): Uint8Array {
  const STRONG = 255;
  const WEAK   = 128;
  const edges  = new Uint8Array(w * h);

  // Mark strong/weak
  for (let i = 0; i < nms.length; i++) {
    if (nms[i] >= THRESH_HIGH)       edges[i] = STRONG;
    else if (nms[i] >= THRESH_LOW)   edges[i] = WEAK;
  }

  // 8-connected flood: promote weak pixels connected to strong ones
  // Use iterative stack-based flood fill (no recursion → no stack overflow)
  const stack: number[] = [];
  for (let i = 0; i < edges.length; i++) {
    if (edges[i] === STRONG) stack.push(i);
  }

  const neighbors = [-w-1, -w, -w+1, -1, 1, w-1, w, w+1];

  while (stack.length > 0) {
    const idx = stack.pop()!;
    for (const d of neighbors) {
      const ni = idx + d;
      if (ni >= 0 && ni < edges.length && edges[ni] === WEAK) {
        edges[ni] = STRONG;
        stack.push(ni);
      }
    }
  }

  // Suppress remaining weak pixels
  for (let i = 0; i < edges.length; i++) {
    if (edges[i] === WEAK) edges[i] = 0;
  }

  return edges;
}

// ── Step 6: Collect edge pixels ───────────────────────────────────────────────

/**
 * Sample edge pixels for hull computation. We don't need every pixel —
 * a representative sample of up to MAX_POINTS is enough for a good hull.
 */
function collectEdgePoints(edges: Uint8Array, w: number, _h: number): Pt[] {
  const MAX_POINTS = 4000;
  const pts: Pt[] = [];

  for (let i = 0; i < edges.length; i++) {
    if (edges[i] === 255) {
      pts.push({ x: i % w, y: Math.floor(i / w) });
    }
  }

  if (pts.length <= MAX_POINTS) return pts;

  // Uniform random sample to keep things fast for dense edge maps
  const step = pts.length / MAX_POINTS;
  const sampled: Pt[] = [];
  for (let i = 0; i < MAX_POINTS; i++) {
    sampled.push(pts[Math.floor(i * step)]);
  }
  return sampled;
}

// ── Step 7: Convex hull (Andrew's monotone chain) ────────────────────────────

function cross(O: Pt, A: Pt, B: Pt): number {
  return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
}

function convexHull(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts;
  const sorted = [...pts].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
  const n = sorted.length;
  const hull: Pt[] = [];

  // Lower hull
  for (let i = 0; i < n; i++) {
    while (hull.length >= 2 && cross(hull[hull.length-2], hull[hull.length-1], sorted[i]) <= 0) {
      hull.pop();
    }
    hull.push(sorted[i]);
  }

  // Upper hull
  const lower = hull.length + 1;
  for (let i = n - 2; i >= 0; i--) {
    while (hull.length >= lower && cross(hull[hull.length-2], hull[hull.length-1], sorted[i]) <= 0) {
      hull.pop();
    }
    hull.push(sorted[i]);
  }

  hull.pop(); // remove the last point (same as first)
  return hull;
}

// ── Step 8: Ramer-Douglas-Peucker simplification ─────────────────────────────

function perpDist(pt: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx*dx + dy*dy);
  if (len === 0) return Math.sqrt((pt.x-a.x)**2 + (pt.y-a.y)**2);
  return Math.abs(dy*pt.x - dx*pt.y + b.x*a.y - b.y*a.x) / len;
}

function rdp(pts: Pt[], epsilon: number): Pt[] {
  if (pts.length < 3) return pts;

  let maxDist = 0;
  let maxIdx  = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left  = rdp(pts.slice(0, maxIdx + 1), epsilon);
    const right = rdp(pts.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [pts[0], pts[pts.length - 1]];
}

/**
 * Simplify a closed polygon (hull) using RDP with a given epsilon.
 * Returns the simplified polygon as an array of points.
 */
function simplifyHull(hull: Pt[], epsilon: number): Pt[] {
  if (hull.length <= 4) return hull;
  // RDP on closed polygon: run it on each half or use the standard trick
  // of duplicating the sequence to handle wrap-around, then deduplicate.
  const doubled = [...hull, ...hull];
  const simplified = rdp(doubled, epsilon);
  // Deduplicate consecutive equal points and take at most hull.length points
  const seen = new Set<string>();
  const result: Pt[] = [];
  for (const p of simplified) {
    const key = `${p.x},${p.y}`;
    if (!seen.has(key)) { seen.add(key); result.push(p); }
    if (result.length >= hull.length) break;
  }
  return result;
}

// ── Step 9: Find best quadrilateral ──────────────────────────────────────────

function polygonArea(pts: Pt[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Try progressively larger epsilon values until we find a 4-point polygon,
 * or return the 4 extremal points of the hull as a fallback.
 */
function findBestQuad(hull: Pt[], minArea: number): Pt[] | null {
  if (hull.length < 4) return null;

  const perim = hull.reduce((s, p, i) => {
    const q = hull[(i + 1) % hull.length];
    return s + Math.sqrt((p.x-q.x)**2 + (p.y-q.y)**2);
  }, 0);

  // Try epsilon values from tight to loose — stop at first 4-point result
  for (const factor of [0.01, 0.02, 0.04, 0.06, 0.08, 0.12, 0.16, 0.20]) {
    const simplified = simplifyHull(hull, factor * perim);
    if (simplified.length === 4) {
      const area = polygonArea(simplified);
      if (area >= minArea) return simplified;
    }
  }

  // Fallback: pick 4 extreme points from the hull
  //   topmost, rightmost, bottommost, leftmost
  const top   = hull.reduce((a, b) => b.y < a.y ? b : a);
  const right = hull.reduce((a, b) => b.x > a.x ? b : a);
  const bot   = hull.reduce((a, b) => b.y > a.y ? b : a);
  const left  = hull.reduce((a, b) => b.x < a.x ? b : a);

  const quad = [top, right, bot, left];
  const area = polygonArea(quad);
  return area >= minArea ? quad : null;
}

// ── Step 10: Order corners TL/TR/BR/BL ───────────────────────────────────────

function orderCorners(pts: Pt[]): WorkerOutput {
  const sorted = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const tl = sorted[0];
  const br = sorted[3];
  const remaining = [sorted[1], sorted[2]];
  const [bl, tr] = remaining[0].x < remaining[1].x
    ? [remaining[0], remaining[1]]
    : [remaining[1], remaining[0]];
  return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
}

// ── Worker entry point ────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  try {
    const { width: w, height: h, data } = e.data;

    // Pipeline
    const gray    = toGray(data, w, h);
    const blurred = gaussianBlur(gray, w, h);
    const { mag, angle } = sobel(blurred, w, h);
    const nms     = nonMaxSuppression(mag, angle, w, h);
    const edges   = hysteresisThreshold(nms, w, h);
    const pts     = collectEdgePoints(edges, w, h);

    if (pts.length < 4) {
      self.postMessage(null);
      return;
    }

    const hull = convexHull(pts);
    if (hull.length < 4) {
      self.postMessage(null);
      return;
    }

    const minArea = w * h * MIN_AREA_FRACTION;
    const quad    = findBestQuad(hull, minArea);

    if (!quad) {
      self.postMessage(null);
      return;
    }

    const result: WorkerOutput = orderCorners(quad);
    self.postMessage(result);
  } catch (err) {
    console.error('[documentDetect.worker] error:', err);
    self.postMessage(null);
  }
};
