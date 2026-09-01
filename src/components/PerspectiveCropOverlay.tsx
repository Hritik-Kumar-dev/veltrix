/**
 * PerspectiveCropOverlay
 *
 * Architecture
 * ────────────
 * The overlay renders the source image rotated by `rotation` degrees so the
 * user can see and adjust the four perspective-crop handles on the rotated
 * preview.
 *
 * Handle positions are stored in *normalised* display-canvas coordinates
 * (0..1 × 0..1).  Because the display canvas shows the rotated image, these
 * coordinates are relative to the rotated view.
 *
 * getCroppedCanvas()
 * ──────────────────
 * Returns the perspective-warped crop of the **original (unrotated)** image.
 * It maps the normalised handles back from rotated-canvas space into original-
 * image pixel space using the inverse rotation, runs the homography warp on
 * the original pixels, and returns the result.
 *
 * The caller (ImageEditor) is responsible for applying rotation to that
 * canvas after the fact via its own rotateCanvas helper.  This clean
 * separation avoids any double-rotation and keeps the coordinate math exact.
 *
 * Rotation direction convention
 * ──────────────────────────────
 * Positive degrees = clockwise (same as CropperJS and CSS transforms).
 * Canvas 2D ctx.rotate() is also clockwise for positive radians.
 */
import {
  useRef, useEffect, useState, useCallback,
  useImperativeHandle, forwardRef,
} from 'react';

export interface PerspectiveCropHandle {
  getCroppedCanvas: () => HTMLCanvasElement | null;
  /**
   * Programmatically set the four corner handles from original-image pixel
   * coordinates (e.g. from Document Auto Crop detection).
   * Points must be supplied in order: topLeft, topRight, bottomRight, bottomLeft.
   * Each point is clamped to [0..1] in normalised display-canvas space.
   */
  setCorners: (corners: { topLeft: {x:number;y:number}; topRight: {x:number;y:number}; bottomRight: {x:number;y:number}; bottomLeft: {x:number;y:number} }) => void;
}

interface NormPoint  { nx: number; ny: number }
interface PixelPoint { x:  number; y:  number }

interface Props {
  src:       string;
  rotation?: number;
  onChange?: () => void;
}

// ── Homography ───────────────────────────────────────────────────────────────

function solveH(src: PixelPoint[], dst: PixelPoint[]): number[] | null {
  const A: number[][] = [];
  const b: number[]   = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-10) return null;
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i];
    for (let k = i - 1; k >= 0; k--) M[k][n] -= M[k][i] * x[i];
  }
  return [...x, 1];
}

function applyH(H: number[], p: PixelPoint): PixelPoint {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
           y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

function perspectiveWarp(
  srcData: ImageData, srcW: number, srcH: number,
  srcQuad: PixelPoint[], outW: number, outH: number,
): ImageData {
  const dst: PixelPoint[] = [
    { x: 0, y: 0 }, { x: outW, y: 0 },
    { x: outW, y: outH }, { x: 0, y: outH },
  ];
  const H = solveH(dst, srcQuad);
  if (!H) return new ImageData(outW, outH);

  const out  = new ImageData(outW, outH);
  const src  = srcData.data;
  const odat = out.data;

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const sp = applyH(H, { x: dx, y: dy });
      const sx = Math.round(sp.x);
      const sy = Math.round(sp.y);
      if (sx < 0 || sx >= srcW || sy < 0 || sy >= srcH) continue;
      const si = (sy * srcW + sx) * 4;
      const di = (dy * outW + dx) * 4;
      odat[di]     = src[si];
      odat[di + 1] = src[si + 1];
      odat[di + 2] = src[si + 2];
      odat[di + 3] = src[si + 3];
    }
  }
  return out;
}

// ── Rotation helpers ─────────────────────────────────────────────────────────

/**
 * Render `img` rotated by `degrees` (clockwise) into a new canvas sized to
 * exactly contain the rotated image.
 */
function makeRotatedCanvas(img: HTMLImageElement, degrees: number): HTMLCanvasElement {
  const rad = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const outW = Math.round(img.naturalWidth  * cos + img.naturalHeight * sin);
  const outH = Math.round(img.naturalWidth  * sin + img.naturalHeight * cos);
  const c   = document.createElement('canvas');
  c.width   = outW;
  c.height  = outH;
  const ctx = c.getContext('2d')!;
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate(rad);  // positive = clockwise (canvas 2D convention)
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return c;
}

/**
 * Map a point from the rotated-canvas coordinate system back to the
 * original-image coordinate system.
 *
 * The rotated canvas has dimensions (rotW × rotH).
 * The original image has dimensions (origW × origH).
 * The rotation is `degrees` clockwise.
 *
 * We apply the inverse rotation (i.e. rotate by -degrees) around the
 * shared centre to recover the original pixel coordinates.
 */
function rotatedToOriginal(
  p: PixelPoint,
  rotW: number,  rotH: number,
  origW: number, origH: number,
  degrees: number,
): PixelPoint {
  // Translate to rotated-canvas centre
  const rx = p.x - rotW  / 2;
  const ry = p.y - rotH  / 2;

  // Rotate by -degrees (inverse of the forward rotation)
  const rad = -(degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ox  = rx * cos - ry * sin;
  const oy  = rx * sin + ry * cos;

  // Translate to original-image centre
  return { x: ox + origW / 2, y: oy + origH / 2 };
}

/**
 * Rotate a normalised handle position (0..1 × 0..1) by `deltaDeg` degrees
 * clockwise around the centre (0.5, 0.5), clamped to [0..1].
 */
function rotateNormPoint(p: NormPoint, deltaDeg: number): NormPoint {
  const rad = (deltaDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx  = p.nx - 0.5;
  const dy  = p.ny - 0.5;
  return {
    nx: Math.max(0, Math.min(1, dx * cos - dy * sin + 0.5)),
    ny: Math.max(0, Math.min(1, dx * sin + dy * cos + 0.5)),
  };
}

// ── Component ────────────────────────────────────────────────────────────────

const HANDLE_R = 10;
const PAD      = 0.05;   // 5 % inset for initial handle placement

const INITIAL_HANDLES: NormPoint[] = [
  { nx: PAD,     ny: PAD     },
  { nx: 1 - PAD, ny: PAD     },
  { nx: 1 - PAD, ny: 1 - PAD },
  { nx: PAD,     ny: 1 - PAD },
];

export const PerspectiveCropOverlay = forwardRef<PerspectiveCropHandle, Props>(
  function PerspectiveCropOverlay({ src, rotation = 0, onChange }, ref) {
    const canvasRef        = useRef<HTMLCanvasElement>(null);
    const imgRef           = useRef<HTMLImageElement | null>(null);
    // Offscreen canvas of the image rotated by `rotation` degrees — used for
    // rendering the preview background.  The natural dimensions of this canvas
    // reflect the post-rotation size.
    const rotatedCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // Previous rotation for computing deltas when handles are remapped.
    const prevRotRef = useRef<number>(rotation);

    // Handles in normalised display-canvas coordinates (0..1 × 0..1).
    // State drives redraws; ref is read by getCroppedCanvas() to avoid stale
    // closures when React hasn't committed the latest state yet.
    const [normHandles, setNormHandles] = useState<NormPoint[]>([]);
    const normHandlesRef                = useRef<NormPoint[]>([]);

    /** Write handles to both state (triggers redraw) and ref (for getCroppedCanvas). */
    const commitHandles = useCallback((handles: NormPoint[]) => {
      normHandlesRef.current = handles;
      setNormHandles(handles);
    }, []);

    const dragging = useRef<number | null>(null);

    // ── getCroppedCanvas ──────────────────────────────────────────────────
    //
    // Strategy: the handles live in rotated-canvas space (normalised).
    // We convert them → rotated-canvas pixel coords → original-image pixel
    // coords (via the inverse rotation).  The homography warp runs on the
    // original pixels.  The caller (ImageEditor) applies the final rotation
    // to the result via its own rotateCanvas helper — this avoids any
    // double-rotation.
    useImperativeHandle(ref, () => ({
      getCroppedCanvas(): HTMLCanvasElement | null {
        const img     = imgRef.current;
        const rc      = rotatedCanvasRef.current;
        const handles = normHandlesRef.current;
        if (!img || !rc || handles.length < 4) return null;

        const origW = img.naturalWidth;
        const origH = img.naturalHeight;

        // handles (norm) → rotated canvas pixels
        const rotPx = handles.map(n => ({
          x: n.nx * rc.width,
          y: n.ny * rc.height,
        }));

        // rotated canvas pixels → original image pixels
        const deg = prevRotRef.current;   // always == current rotation (updated sync)
        const srcQuad = rotPx.map(p =>
          rotatedToOriginal(p, rc.width, rc.height, origW, origH, deg)
        );

        // Output dimensions: longest side of the quadrilateral
        const w1 = Math.hypot(srcQuad[1].x - srcQuad[0].x, srcQuad[1].y - srcQuad[0].y);
        const w2 = Math.hypot(srcQuad[2].x - srcQuad[3].x, srcQuad[2].y - srcQuad[3].y);
        const h1 = Math.hypot(srcQuad[3].x - srcQuad[0].x, srcQuad[3].y - srcQuad[0].y);
        const h2 = Math.hypot(srcQuad[2].x - srcQuad[1].x, srcQuad[2].y - srcQuad[1].y);
        const outW = Math.round(Math.max(w1, w2));
        const outH = Math.round(Math.max(h1, h2));
        if (outW < 2 || outH < 2) return null;

        // Read original (unrotated) pixel data
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width  = origW;
        srcCanvas.height = origH;
        srcCanvas.getContext('2d')!.drawImage(img, 0, 0);
        const srcData = srcCanvas.getContext('2d')!.getImageData(0, 0, origW, origH);

        const outData = perspectiveWarp(srcData, origW, origH, srcQuad, outW, outH);
        const out     = document.createElement('canvas');
        out.width  = outW;
        out.height = outH;
        out.getContext('2d')!.putImageData(outData, 0, 0);
        return out;
      },

      setCorners(corners: { topLeft: {x:number;y:number}; topRight: {x:number;y:number}; bottomRight: {x:number;y:number}; bottomLeft: {x:number;y:number} }): void {
        const img = imgRef.current;
        const rc  = rotatedCanvasRef.current;
        if (!img || !rc) return;

        const origW = img.naturalWidth;
        const origH = img.naturalHeight;
        const deg   = prevRotRef.current;

        // The four corners arrive in original-image pixel space.
        // We need to convert them to normalised rotated-canvas space
        // so they display correctly in the overlay:
        //   orig pixel → rotated canvas pixel (apply forward rotation) → normalise
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const orderered = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
        const norm: NormPoint[] = orderered.map(({ x, y }) => {
          // Translate to image centre
          const cx = x - origW / 2;
          const cy = y - origH / 2;
          // Rotate forward by deg degrees (clockwise)
          const rx = cx * cos - cy * sin;
          const ry = cx * sin + cy * cos;
          // Translate to rotated-canvas centre
          const px = rx + rc.width  / 2;
          const py = ry + rc.height / 2;
          return {
            nx: Math.max(0, Math.min(1, px / rc.width)),
            ny: Math.max(0, Math.min(1, py / rc.height)),
          };
        });

        commitHandles(norm);
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [commitHandles]);   // commitHandles is stable; reads rest from refs

    // ── Load image ────────────────────────────────────────────────────────
    useEffect(() => {
      const img  = new Image();
      img.onload = () => {
        imgRef.current = img;

        // Build the initial rotated display canvas using the current rotation.
        // We read it from the ref (updated synchronously) rather than the
        // prop closure to avoid stale-closure issues.
        const currentRot = prevRotRef.current;
        const rc = makeRotatedCanvas(img, currentRot);
        rotatedCanvasRef.current = rc;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const { width: cw, height: ch } = canvas.getBoundingClientRect();
        canvas.width  = cw  || rc.width;
        canvas.height = ch || rc.height;

        commitHandles([...INITIAL_HANDLES]);
      };
      img.src = src;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    // ── React to rotation prop changes ────────────────────────────────────
    useEffect(() => {
      // Keep prevRotRef in sync with the rotation prop at all times,
      // regardless of whether the image has loaded yet.
      const prev = prevRotRef.current;
      prevRotRef.current = rotation;

      const img = imgRef.current;
      if (!img) return;           // image not loaded yet; load effect will use correct rotation
      if (prev === rotation) return;

      // Rebuild the rotated offscreen canvas (used by both display and
      // getCroppedCanvas via prevRotRef).
      const newRc = makeRotatedCanvas(img, rotation);
      rotatedCanvasRef.current = newRc;

      // Resize the display canvas to fit the container at the new aspect ratio.
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cw   = rect.width  || newRc.width;
      const ch   = rect.height || newRc.height;
      const scale  = Math.min(cw / newRc.width, ch / newRc.height);
      const newCW  = Math.round(newRc.width  * scale);
      const newCH  = Math.round(newRc.height * scale);

      // Remap normalised handles: rotate them by the delta so they continue
      // to point at the same region of the image in the new rotated view.
      const delta   = rotation - prev;
      const remapped = normHandlesRef.current.map(n => rotateNormPoint(n, delta));
      commitHandles(remapped);

      canvas.width  = newCW;
      canvas.height = newCH;
    }, [rotation, commitHandles]);

    // ── Draw ──────────────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      const rc     = rotatedCanvasRef.current;
      if (!canvas || !rc || normHandles.length < 4) return;

      const pts = normHandles.map(n => ({
        x: n.nx * canvas.width,
        y: n.ny * canvas.height,
      }));

      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background: rotated image fills the canvas
      ctx.drawImage(rc, 0, 0, canvas.width, canvas.height);

      // Dim outside the quad
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill();
      ctx.restore();
      ctx.restore();

      // Quad border
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.strokeStyle = 'rgba(124,106,247,0.9)';
      ctx.lineWidth   = 2;
      ctx.stroke();

      // Corner handles
      pts.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, HANDLE_R, 0, Math.PI * 2);
        ctx.fillStyle   = '#7c6af7';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 2;
        ctx.fill();
        ctx.stroke();
      });
    }, [normHandles]);

    // ── Pointer events ────────────────────────────────────────────────────

    const canvasPt = (e: React.PointerEvent): PixelPoint => {
      const c    = canvasRef.current!;
      const rect = c.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (c.width  / rect.width),
        y: (e.clientY - rect.top)  * (c.height / rect.height),
      };
    };

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
      const c   = canvasRef.current!;
      const p   = canvasPt(e);
      const idx = normHandlesRef.current.findIndex(n => {
        const hx = n.nx * c.width;
        const hy = n.ny * c.height;
        return Math.hypot(hx - p.x, hy - p.y) <= HANDLE_R + 4;
      });
      if (idx === -1) return;
      dragging.current = idx;
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
      if (dragging.current === null) return;
      const c  = canvasRef.current!;
      const p  = canvasPt(e);
      const nx = Math.max(0, Math.min(1, p.x / c.width));
      const ny = Math.max(0, Math.min(1, p.y / c.height));
      const next = [...normHandlesRef.current];
      next[dragging.current] = { nx, ny };
      commitHandles(next);
      onChange?.();
    }, [commitHandles, onChange]);

    const handlePointerUp = useCallback(() => { dragging.current = null; }, []);

    return (
      <canvas
        ref={canvasRef}
        className="persp-canvas"
        style={{ width: '100%', height: '100%', cursor: 'crosshair', display: 'block' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    );
  }
);
