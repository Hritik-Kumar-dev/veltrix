// ─── Image Tray ───────────────────────────────────────────────────────────────
// Shows thumbnails of all gallery images. User can click to add to canvas,
// or drag the thumbnail onto the canvas.

import { useRef } from 'react';
import { Plus } from 'lucide-react';
import type { ImageItem } from '../types';

interface Props {
  images: ImageItem[];
  onAddImage: (imageId: string, naturalW: number, naturalH: number) => void;
  /** Called when drag of a tray item starts — pass imageId to canvas handler */
  onDragStart?: (imageId: string, naturalW: number, naturalH: number) => void;
}

export function ImageTray({ images, onAddImage, onDragStart }: Props) {
  return (
    <div className="ps-panel">
      <div className="ps-panel-title">Images ({images.length})</div>
      {images.length === 0 ? (
        <p className="ps-tray-empty">Import images in the Editor tab to use them here.</p>
      ) : (
        <div className="ps-tray-grid">
          {images.map((img) => (
            <TrayItem
              key={img.id}
              img={img}
              onAdd={onAddImage}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TrayItemProps {
  img: ImageItem;
  onAdd: (id: string, w: number, h: number) => void;
  onDragStart?: (id: string, w: number, h: number) => void;
}

function TrayItem({ img, onAdd, onDragStart }: TrayItemProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const src = img.processedDataUrl ?? img.originalDataUrl;

  function getNaturalDims(): { w: number; h: number } {
    const el = imgRef.current;
    if (el && el.naturalWidth > 0) return { w: el.naturalWidth, h: el.naturalHeight };
    return { w: 100, h: 100 }; // fallback
  }

  function handleClick() {
    const { w, h } = getNaturalDims();
    onAdd(img.id, w, h);
  }

  function handleDragStart(e: React.DragEvent) {
    const { w, h } = getNaturalDims();
    e.dataTransfer.setData('text/plain', JSON.stringify({ imageId: img.id, naturalW: w, naturalH: h }));
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart?.(img.id, w, h);
  }

  const shortName = img.name.length > 18
    ? img.name.slice(0, 15) + '…'
    : img.name;

  return (
    <div
      className="ps-tray-item"
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      title={`${img.name}\nClick or drag onto canvas to place`}
    >
      <div className="ps-tray-thumb">
        <img
          ref={imgRef}
          src={src}
          alt={img.name}
          className="ps-tray-img"
          draggable={false}
        />
        <div className="ps-tray-add-overlay">
          <Plus size={18} />
        </div>
      </div>
      <span className="ps-tray-name">{shortName}</span>
      {img.processedDataUrl && (
        <span className="ps-tray-badge" title="Processed">✓</span>
      )}
    </div>
  );
}
