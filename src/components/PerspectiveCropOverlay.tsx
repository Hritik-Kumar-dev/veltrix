/**
 * PerspectiveCropOverlay
 *
 * Renders a canvas showing the source image rotated by `rotation` degrees.
 * The user drags four corner handles to define a quadrilateral on the
 * *rotated* image.  Calling getCroppedCanvas() applies a 4-point homography
 * on the rotated pixel data and returns a straight-rectangular output —
 * already in the correct orientation; the caller does NOT need to apply any
 * additional rotation.
 *
 * Handle positions are stored in *normalised* coordinates (0..1 × 0..1)
 * relative to the display canvas.  This means that when the canvas resizes
 * (e.g. on a 90° rotation where W and H swap) handles are immediately
 * placed at `norm.x * newW, norm.y * newH` — they can never escape the
 * canvas and there is no accumulated floating-point drift.
 *
 * When `rotation` changes the normalised handles are rotated by the delta
 * around the image centre (0.5, 0.5) so they continue to point at the same
 * region of the image after rotation.
 */
import {
  useRef, useEffect, useState, useCallback,
  useImperativeHandle, forwardRef,
} from 'react';

export interface PerspectiveCropHandle {
  getCroppedCanvas: () => HTMLCanvasElement | null;
}

/** Normalised point — each component in [0..1] relative to the canvas. */
interface NormPoint { nx: number; ny: number }
interface CanvasPoint { x: number; y: number }

interface Props {
  src: string;
  rotation?: number;
  onChange?: () => void;
}

// ── Homography math ──────────────────────────────────────────────────────────

function solveH(src: CanvasPoint[], dst: CanvasPoint[]): number[] | null {
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
    for (let row = col + 1; row < n; row++)
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-10) return null;
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i];
    for (let k = i - 1; k >= 0; k--) M[k][n] -= M[k][i] * x[i];
  }
  return [...x, 1];
}

function applyH(H: number[], p: CanvasPoint): CanvasPoint {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
           y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

function perspectiveWarp(
  srcImageData: ImageData, srcW: number, srcH: number,
  srcQuad: CanvasPoint[], outW: number, outH: number,
): ImageData {
  const dst: CanvasPoint[] = [
    { x: 0, y: 0 }, { x: outW, y: 0 },
    { x: outW, y: outH }, { x: 0, y: outH },
  ];
  const H = solveH(dst, srcQuad);
  if (!H) return new ImageData(outW, outH);

  const out     = new ImageData(outW, outH);
  const srcData = srcImageData.data;
  const outData = out.data;

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const sp = applyH(H, { x: dx, y: dy });
      const sx = Math.round(sp.x);
      const sy = Math.round(sp.y);
      if (sx < 0 || sx >= srcW || sy < 0 || sy >= srcH) continue;
      const si = (sy * srcW + sx) * 4;
      const di = (dy * outW + dx) * 4;
      outData[di]     = srcData[si];
      outData[di + 1] = srcData[si + 1];
      outData[di + 2] = srcData[si + 2];
      outData[di + 3] = srcData[si + 3];
    }
  }
  return out;
}

// ── Rotation helpers ─────────────────────────────────────────────────────────

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
  ctx.rotate(rad);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return c;
}

/**
 * Rotate a *normalised* point (0..1 × 0..1) around the centre (0.5, 0.5)
 * by `deltaDeg` degrees.  The result is clamped to [0..1] so it always
 * stays inside the canvas regardless of floating-point imprecision.
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

function normToCanvas(p: NormPoint, w: number, h: number): CanvasPoint {
  return { x: p.nx * w, y: p.ny * h };
}

function canvasToNorm(p: CanvasPoint, w: number, h: number): NormPoint {
  return { nx: w > 0 ? p.x / w : 0, ny: h > 0 ? p.y / h : 0 };
}

// ── Component ────────────────────────────────────────────────────────────────

const HANDLE_R   = 10;
const PAD_NORM   = 0.05; // 5% inset for the default corner positions

const DEFAULT_NORM_HANDLES: NormPoint[] = [
  { nx: PAD_NORM,       ny: PAD_NORM },
  { nx: 1 - PAD_NORM,   ny: PAD_NORM },
  { nx: 1 - PAD_NORM,   ny: 1 - PAD_NORM },
  { nx: PAD_NORM,       ny: 1 - PAD_NORM },
];

export const PerspectiveCropOverlay = forwardRef<PerspectiveCropHandle, Props>(
  function PerspectiveCropOverlay({ src, rotation = 0, onChange }, ref) {
    const canvasRef        = useRef<HTMLCanvasElement>(null);
    const imgRef           = useRef<HTMLImageElement | null>(null);
    const rotatedCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // Handles stored as normalised (0..1 × 0..1) coords relative to the
    // display canvas.  Converting to/from pixel coords is always cheap and
    // free from accumulated-delta drift.
    const [normHandles, setNormHandles] = useState<NormPoint[]>([]);

    // We need the previous rotation to compute the delta when the user
    // changes rotation — the delta is applied to the normalised handles.
    const prevRotationRef = useRef<number>(rotation);

    const dragging = useRef<number | null>(null);

    // ── Expose getCroppedCanvas ────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      getCroppedCanvas() {
        const rc = rotatedCanvasRef.current;
        const canvas = canvasRef.current;
        if (!rc || !canvas || normHandles.length < 4) return null;

        // Convert normalised handles → rotated-natural-image pixel coords
        const scaleX = rc.width;
        const scaleY = rc.height;
        const srcQuad = normHandles.map((n) => ({
          x: n.nx * scaleX,
          y: n.ny * scaleY,
        }));

        const w1 = Math.hypot(srcQuad[1].x - srcQuad[0].x, srcQuad[1].y - srcQuad[0].y);
        const w2 = Math.hypot(srcQuad[2].x - srcQuad[3].x, srcQuad[2].y - srcQuad[3].y);
        const h1 = Math.hypot(srcQuad[3].x - srcQuad[0].x, srcQuad[3].y - srcQuad[0].y);
        const h2 = Math.hypot(srcQuad[2].x - srcQuad[1].x, srcQuad[2].y - srcQuad[1].y);
        const outW = Math.round(Math.max(w1, w2));
        const outH = Math.round(Math.max(h1, h2));
        if (outW < 2 || outH < 2) return null;

        const sctx = rc.getContext('2d')!;
        const srcImageData = sctx.getImageData(0, 0, rc.width, rc.height);

        const outData   = perspectiveWarp(srcImageData, rc.width, rc.height, srcQuad, outW, outH);
        const outCanvas = document.createElement('canvas');
        outCanvas.width  = outW;
        outCanvas.height = outH;
        outCanvas.getContext('2d')!.putImageData(outData, 0, 0);
        return outCanvas;
      },
    }), [normHandles]);

    // ── Load image ─────────────────────────────────────────────────────────
    useEffect(() => {
      const img  = new Image();
      img.onload = () => {
        imgRef.current = img;

        const rc = makeRotatedCanvas(img, rotation);
        rotatedCanvasRef.current = rc;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Size the display canvas to fit its CSS container
        const { width: cw, height: ch } = canvas.getBoundingClientRect();
        canvas.width  = cw  || rc.width;
        canvas.height = ch || rc.height;

        setNormHandles([...DEFAULT_NORM_HANDLES]);
        prevRotationRef.current = rotation;
      };
      img.src = src;
      // Only re-runs when src changes (new image).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    // ── React to rotation changes ──────────────────────────────────────────
    useEffect(() => {
      const img = imgRef.current;
      if (!img) return;

      const prevRot = prevRotationRef.current;
      if (prevRot === rotation) return;

      // Rebuild the rotated offscreen canvas
      const newRc = makeRotatedCanvas(img, rotation);
      rotatedCanvasRef.current = newRc;

      const canvas = canvasRef.current;
      if (!canvas) return;

      // Fit the new rotated canvas inside the same CSS container
      const rect = canvas.getBoundingClientRect();
      const cw = rect.width  || newRc.width;
      const ch = rect.height || newRc.height;
      const scale   = Math.min(cw / newRc.width, ch / newRc.height);
      const newCanvasW = Math.round(newRc.width  * scale);
      const newCanvasH = Math.round(newRc.height * scale);

      // Rotate the normalised handle positions by the rotation delta.
      // Because we work in normalised space the result is automatically
      // inside [0..1]×[0..1] — the handles can never escape the canvas.
      const delta = rotation - prevRot;
      setNormHandles((prev) => prev.map((n) => rotateNormPoint(n, delta)));

      // Update canvas dimensions — this triggers the draw effect.
      canvas.width  = newCanvasW;
      canvas.height = newCanvasH;

      prevRotationRef.current = rotation;
    }, [rotation]);

    // ── Draw overlay ───────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      const rc     = rotatedCanvasRef.current;
      if (!canvas || !rc || normHandles.length < 4) return;

      // Convert normalised → pixel coords for drawing
      const pts = normHandles.map((n) => normToCanvas(n, canvas.width, canvas.height));

      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background: rotated image
      ctx.drawImage(rc, 0, 0, canvas.width, canvas.height);

      // Dim outside the quad
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill();
      ctx.restore();
      ctx.restore();

      // Quad outline
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.strokeStyle = 'rgba(124,106,247,0.9)';
      ctx.lineWidth   = 2;
      ctx.stroke();

      // Handles
      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, HANDLE_R, 0, Math.PI * 2);
        ctx.fillStyle   = '#7c6af7';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 2;
        ctx.fill();
        ctx.stroke();
      });
    }, [normHandles]);

    // ── Pointer helpers ────────────────────────────────────────────────────
    /** Convert a pointer event into *canvas* pixel coordinates. */
    const getCanvasPoint = (e: React.PointerEvent): CanvasPoint => {
      const canvas = canvasRef.current!;
      const rect   = canvas.getBoundingClientRect();
      // The canvas element may be displayed at a different CSS size than its
      // logical pixel size — scale accordingly.
      return {
        x: (e.clientX - rect.left)  * (canvas.width  / rect.width),
        y: (e.clientY - rect.top)   * (canvas.height / rect.height),
      };
    };

    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const p      = getCanvasPoint(e);
        // Convert normalised handles → pixel for hit-testing
        const idx = normHandles.findIndex((n) => {
          const cp = normToCanvas(n, canvas.width, canvas.height);
          return Math.hypot(cp.x - p.x, cp.y - p.y) <= HANDLE_R + 4;
        });
        if (idx === -1) return;
        dragging.current = idx;
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
      },
      [normHandles],
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (dragging.current === null || !canvasRef.current) return;
        const canvas  = canvasRef.current;
        const p       = getCanvasPoint(e);
        // Clamp to canvas bounds, then convert to normalised
        const clamped: CanvasPoint = {
          x: Math.max(0, Math.min(canvas.width,  p.x)),
          y: Math.max(0, Math.min(canvas.height, p.y)),
        };
        const norm = canvasToNorm(clamped, canvas.width, canvas.height);
        setNormHandles((prev) => {
          const next = [...prev];
          next[dragging.current!] = norm;
          return next;
        });
        onChange?.();
      },
      [onChange],
    );

    const handlePointerUp = useCallback(() => {
      dragging.current = null;
    }, []);

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
  },
);
