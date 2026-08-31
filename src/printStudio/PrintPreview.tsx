// ─── Print Preview ────────────────────────────────────────────────────────────
// Read-only render of the page at true aspect ratio — no handles, no rulers,
// no editor chrome. Overlaid as a modal. This is also used as the export source.

import type { PrintDocument } from './types';
import type { ImageItem } from '../types';
import { effectivePageSize } from './units';
import { X } from 'lucide-react';

interface Props {
  doc: PrintDocument;
  images: ImageItem[];
  onClose: () => void;
}

// Fixed pixel size for preview display (scaled to fit viewport)
const PREVIEW_LONG_EDGE_PX = 600;

export function PrintPreview({ doc, images, onClose }: Props) {
  const { width_mm, height_mm } = effectivePageSize(doc);
  const isPortrait = height_mm >= width_mm;

  // Scale so the long edge fits within PREVIEW_LONG_EDGE_PX
  const scale = isPortrait
    ? PREVIEW_LONG_EDGE_PX / height_mm
    : PREVIEW_LONG_EDGE_PX / width_mm;

  const previewW = width_mm * scale;
  const previewH = height_mm * scale;

  return (
    <div className="ps-preview-overlay" onClick={onClose}>
      <div className="ps-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ps-preview-header">
          <span className="ps-preview-title">Print Preview — {doc.name}</span>
          <button className="toolbar-btn" onClick={onClose} title="Close preview">
            <X size={16} />
          </button>
        </div>

        <div className="ps-preview-scroll">
          {/* The actual page render — no handles, no selection chrome */}
          <div
            id="ps-preview-page"
            style={{
              width:  previewW,
              height: previewH,
              background: '#fff',
              position: 'relative',
              boxShadow: '0 4px 32px rgba(0,0,0,0.5)',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {[...doc.elements]
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((el) => {
                const imgItem = images.find((i) => i.id === el.sourceImageId);
                if (!imgItem) return null;
                const src = imgItem.processedDataUrl ?? imgItem.originalDataUrl;
                return (
                  <img
                    key={el.id}
                    src={src}
                    alt=""
                    draggable={false}
                    style={{
                      position: 'absolute',
                      left:   el.x_mm * scale,
                      top:    el.y_mm * scale,
                      width:  el.width_mm * scale,
                      height: el.height_mm * scale,
                      transform: `rotate(${el.rotation_deg}deg)`,
                      transformOrigin: 'center center',
                      zIndex: el.zIndex,
                      objectFit: 'fill',
                      display: 'block',
                    }}
                  />
                );
              })}
          </div>
        </div>

        <div className="ps-preview-footer">
          <span className="ps-dims-info">
            {width_mm.toFixed(0)} × {height_mm.toFixed(0)} mm · {doc.elements.length} element{doc.elements.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Headless renderer for export ─────────────────────────────────────────────
// Renders the page into an off-screen canvas at the given DPI and returns a
// data URL. Uses Image.decode() for clean rendering.

export async function renderPageToCanvas(
  doc: PrintDocument,
  images: ImageItem[],
  dpi: number,
): Promise<HTMLCanvasElement> {
  const { width_mm, height_mm } = effectivePageSize(doc);
  const MM_PER_INCH = 25.4;
  const canvasW = Math.round((width_mm  / MM_PER_INCH) * dpi);
  const canvasH = Math.round((height_mm / MM_PER_INCH) * dpi);
  const scale   = dpi / MM_PER_INCH; // px per mm at this DPI

  const canvas = document.createElement('canvas');
  canvas.width  = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d')!;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const sorted = [...doc.elements].sort((a, b) => a.zIndex - b.zIndex);

  for (const el of sorted) {
    const imgItem = images.find((i) => i.id === el.sourceImageId);
    if (!imgItem) continue;
    const src = imgItem.processedDataUrl ?? imgItem.originalDataUrl;

    // Compute pixel dimensions from mm — NOT from the source image resolution
    const elW = el.width_mm  * scale;
    const elH = el.height_mm * scale;
    const elX = el.x_mm      * scale;
    const elY = el.y_mm      * scale;

    const img = new Image();
    img.src = src;
    await img.decode();

    ctx.save();
    // Translate to element center, rotate, then draw
    const cx = elX + elW / 2;
    const cy = elY + elH / 2;
    ctx.translate(cx, cy);
    ctx.rotate((el.rotation_deg * Math.PI) / 180);
    ctx.drawImage(img, -elW / 2, -elH / 2, elW, elH);
    ctx.restore();
  }

  return canvas;
}

/** Export page to a blob at the given DPI as image/png or image/jpeg */
export async function renderPageToBlob(
  doc: PrintDocument,
  images: ImageItem[],
  dpi: number,
  format: 'png' | 'jpeg' = 'png',
): Promise<Blob> {
  const canvas = await renderPageToCanvas(doc, images, dpi);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
      format === 'jpeg' ? 'image/jpeg' : 'image/png',
      0.95,
    );
  });
}
