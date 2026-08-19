/**
 * PerspectiveCropOverlay
 *
 * Renders a canvas overlay over the source image. The user drags four corner
 * handles to define a quadrilateral. Calling getCroppedCanvas() applies a
 * proper 4-point homography (perspective transform) to produce a
 * straight-rectangular output.
 */
import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

export interface PerspectiveCropHandle {
  /** Returns a canvas with the perspective-corrected image, or null on error. */
  getCroppedCanvas: () => HTMLCanvasElement | null;
}

interface Point { x: number; y: number }

interface Props {
  /** The original image src (data URL) */
  src: string;
  /** Called when handles move — useful for live preview feedback */
  onChange?: () => void;
}

// ── Homography math ─────────────────────────────────────────────────────────
// Computes a 3×3 perspective matrix mapping src quad → dst rectangle.
// Using the standard 8-equation system solved via Gaussian elimination.

function solveH(src: Point[], dst: Point[]): number[] | null {
  // Build the 8×8 system Ax = b
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }
  // Gaussian elimination
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-10) return null;
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i];
    for (let k = i - 1; k >= 0; k--) M[k][n] -= M[k][i] * x[i];
  }
  return [...x, 1]; // h0..h7, h8=1
}

/** Apply homography H to a point */
function applyH(H: number[], p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
}

/**
 * Map each destination pixel back to a source pixel (inverse warp).
 * Uses nearest-neighbour — fast enough for typical photo sizes.
 */
function perspectiveWarp(
  srcImageData: ImageData,
  srcW: number, srcH: number,
  srcQuad: Point[],
  outW: number, outH: number
): ImageData {
  const dst: Point[] = [
    { x: 0, y: 0 }, { x: outW, y: 0 },
    { x: outW, y: outH }, { x: 0, y: outH },
  ];
  // Forward: srcQuad → dst rectangle (to get the inverse H, swap src/dst)
  const H = solveH(dst, srcQuad); // inverse map: dst pixel → src pixel
  if (!H) return new ImageData(outW, outH);

  const out = new ImageData(outW, outH);
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

// ── Component ────────────────────────────────────────────────────────────────

const HANDLE_R = 10; // hit-test radius in canvas pixels

export const PerspectiveCropOverlay = forwardRef<PerspectiveCropHandle, Props>(
  function PerspectiveCropOverlay({ src, onChange }, ref) {
    const canvasRef     = useRef<HTMLCanvasElement>(null);
    const imgRef        = useRef<HTMLImageElement | null>(null);
    // Handles in *canvas* coordinates (0..canvasW, 0..canvasH)
    const [handles, setHandles] = useState<Point[]>([]);
    const dragging = useRef<number | null>(null);

    // ── Expose getCroppedCanvas ──────────────────────────────────────
    useImperativeHandle(ref, () => ({
      getCroppedCanvas() {
        const img = imgRef.current;
        if (!img || handles.length < 4) return null;
        const canvas = canvasRef.current!;
        const scaleX = img.naturalWidth  / canvas.width;
        const scaleY = img.naturalHeight / canvas.height;
        // Map handles from canvas coords → natural image coords
        const srcQuad = handles.map((h) => ({ x: h.x * scaleX, y: h.y * scaleY }));

        // Compute output dimensions from the quadrilateral (average of opposite sides)
        const w1 = Math.hypot(srcQuad[1].x - srcQuad[0].x, srcQuad[1].y - srcQuad[0].y);
        const w2 = Math.hypot(srcQuad[2].x - srcQuad[3].x, srcQuad[2].y - srcQuad[3].y);
        const h1 = Math.hypot(srcQuad[3].x - srcQuad[0].x, srcQuad[3].y - srcQuad[0].y);
        const h2 = Math.hypot(srcQuad[2].x - srcQuad[1].x, srcQuad[2].y - srcQuad[1].y);
        const outW = Math.round(Math.max(w1, w2));
        const outH = Math.round(Math.max(h1, h2));
        if (outW < 2 || outH < 2) return null;

        // Draw full source image to an offscreen canvas to read pixels
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width  = img.naturalWidth;
        srcCanvas.height = img.naturalHeight;
        const sctx = srcCanvas.getContext('2d')!;
        sctx.drawImage(img, 0, 0);
        const srcImageData = sctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);

        const outData = perspectiveWarp(srcImageData, img.naturalWidth, img.naturalHeight, srcQuad, outW, outH);
        const outCanvas = document.createElement('canvas');
        outCanvas.width  = outW;
        outCanvas.height = outH;
        outCanvas.getContext('2d')!.putImageData(outData, 0, 0);
        return outCanvas;
      }
    }), [handles]);

    // ── Load image + set default handles ────────────────────────────
    useEffect(() => {
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        const canvas = canvasRef.current;
        if (!canvas) return;
        // Set canvas to displayed size
        const { width: cw, height: ch } = canvas.getBoundingClientRect();
        canvas.width  = cw  || img.naturalWidth;
        canvas.height = ch || img.naturalHeight;
        const pad = 20;
        setHandles([
          { x: pad,             y: pad },
          { x: canvas.width - pad,  y: pad },
          { x: canvas.width - pad,  y: canvas.height - pad },
          { x: pad,             y: canvas.height - pad },
        ]);
      };
      img.src = src;
    }, [src]);

    // ── Draw overlay ─────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      const img    = imgRef.current;
      if (!canvas || !img || handles.length < 4) return;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw source image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Dim outside the quad
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(handles[0].x, handles[0].y);
      handles.forEach((h) => ctx.lineTo(h.x, h.y));
      ctx.closePath();
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill();
      ctx.restore();
      ctx.restore();

      // Draw quad outline
      ctx.beginPath();
      ctx.moveTo(handles[0].x, handles[0].y);
      handles.forEach((h) => ctx.lineTo(h.x, h.y));
      ctx.closePath();
      ctx.strokeStyle = 'rgba(124,106,247,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw handles
      handles.forEach((h) => {
        ctx.beginPath();
        ctx.arc(h.x, h.y, HANDLE_R, 0, Math.PI * 2);
        ctx.fillStyle   = '#7c6af7';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 2;
        ctx.fill();
        ctx.stroke();
      });
    }, [handles]);

    // ── Pointer events ───────────────────────────────────────────────
    const getCanvasPoint = (e: React.PointerEvent): Point => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
      const p = getCanvasPoint(e);
      const idx = handles.findIndex(
        (h) => Math.hypot(h.x - p.x, h.y - p.y) <= HANDLE_R + 4
      );
      if (idx === -1) return;
      dragging.current = idx;
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    }, [handles]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
      if (dragging.current === null) return;
      const p = getCanvasPoint(e);
      const canvas = canvasRef.current!;
      const clamped: Point = {
        x: Math.max(0, Math.min(canvas.width,  p.x)),
        y: Math.max(0, Math.min(canvas.height, p.y)),
      };
      setHandles((prev) => {
        const next = [...prev];
        next[dragging.current!] = clamped;
        return next;
      });
      onChange?.();
    }, [onChange]);

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
  }
);
