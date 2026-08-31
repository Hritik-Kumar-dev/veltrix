// ─── Image Tray ───────────────────────────────────────────────────────────────
// Shows thumbnails of all gallery images. The Import button at the top opens
// the system file picker and feeds files through the same shared addImages /
// pdfToImageItems flow as the main toolbar — one central ImageItem list.

import { useRef, useState } from 'react';
import { Plus, FolderOpen, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { ImageItem } from '../types';
import { pdfToImageItems } from '../pdfUtils';

interface Props {
  images: ImageItem[];
  onAddImage: (imageId: string, naturalW: number, naturalH: number) => void;
  /** Same addImages used by the main toolbar — feeds the central ImageItem list */
  onImport: (files: File[]) => Promise<void>;
  /** Same addImageItems used by the main toolbar — for PDF pages */
  onImportItems: (items: ImageItem[]) => void;
  onDragStart?: (imageId: string, naturalW: number, naturalH: number) => void;
}

export function ImageTray({ images, onAddImage, onImport, onImportItems, onDragStart }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const allFiles = Array.from(e.target.files ?? []);
    if (!allFiles.length) return;

    const imageFiles = allFiles.filter(
      (f) => f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf'),
    );
    const pdfFiles = allFiles.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    );

    setImporting(true);
    try {
      if (imageFiles.length > 0) {
        await onImport(imageFiles);
        toast.success(
          `Imported ${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''}`,
        );
      }
      for (const pdfFile of pdfFiles) {
        await toast.promise(
          (async () => {
            const items = await pdfToImageItems(pdfFile);
            onImportItems(items);
            return items.length;
          })(),
          {
            loading: `Converting ${pdfFile.name}…`,
            success: (n: number) =>
              `${pdfFile.name}: ${n} page${n > 1 ? 's' : ''} imported`,
            error: (err: unknown) =>
              `Failed to import ${pdfFile.name}: ${String(err)}`,
          },
        );
      }
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  return (
    <div className="ps-panel">
      {/* Header row ─ title on the left, Import button on the right */}
      <div className="ps-tray-header">
        <span className="ps-panel-title" style={{ margin: 0 }}>
          Images ({images.length})
        </span>
        <button
          className="toolbar-btn primary ps-tray-import-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          title="Import images or PDFs into the gallery"
        >
          {importing ? (
            <><Loader2 size={13} className="spin" /> Importing…</>
          ) : (
            <><FolderOpen size={13} /> Import</>
          )}
        </button>
      </div>

      {images.length === 0 ? (
        <p className="ps-tray-empty">
          Click Import above to add images, or import them from the main toolbar.
        </p>
      ) : (
        <div className="ps-tray-grid">
          {images.map((img) => (
            <TrayItem key={img.id} img={img} onAdd={onAddImage} onDragStart={onDragStart} />
          ))}
        </div>
      )}

      {/* Hidden file input — accepts images and PDFs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        className="hidden-input"
        onChange={handleFileChange}
      />
    </div>
  );
}

// ── TrayItem ──────────────────────────────────────────────────────────────────

interface TrayItemProps {
  img: ImageItem;
  onAdd: (id: string, w: number, h: number) => void;
  onDragStart?: (id: string, w: number, h: number) => void;
}

function TrayItem({ img, onAdd, onDragStart }: TrayItemProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const src = img.processedDataUrl ?? img.originalDataUrl;

  function getNaturalDims() {
    const el = imgRef.current;
    if (el && el.naturalWidth > 0) return { w: el.naturalWidth, h: el.naturalHeight };
    return { w: 100, h: 100 };
  }

  function handleDragStart(e: React.DragEvent) {
    const { w, h } = getNaturalDims();
    e.dataTransfer.setData(
      'text/plain',
      JSON.stringify({ imageId: img.id, naturalW: w, naturalH: h }),
    );
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart?.(img.id, w, h);
  }

  const shortName = img.name.length > 18 ? img.name.slice(0, 15) + '…' : img.name;

  return (
    <div
      className="ps-tray-item"
      draggable
      onDragStart={handleDragStart}
      onClick={() => { const { w, h } = getNaturalDims(); onAdd(img.id, w, h); }}
      title={`${img.name}\nClick or drag onto canvas to place`}
    >
      <div className="ps-tray-thumb">
        <img ref={imgRef} src={src} alt={img.name} className="ps-tray-img" draggable={false} />
        <div className="ps-tray-add-overlay"><Plus size={18} /></div>
      </div>
      <span className="ps-tray-name">{shortName}</span>
      {img.processedDataUrl && (
        <span className="ps-tray-badge" title="Processed">✓</span>
      )}
    </div>
  );
}
