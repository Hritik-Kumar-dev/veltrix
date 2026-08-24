import { useRef, useState, useCallback, useEffect } from 'react';
import { CheckCircle2, Clock, Pencil, Trash2, RotateCcw, LayoutGrid, List, Copy } from 'lucide-react';
import type { ImageItem, RenameConfig } from '../types';
import { generateFinalName } from '../renameUtils';

interface Props {
  images: ImageItem[];
  activeId: string | null;
  renameConfig: RenameConfig;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReset: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDuplicate: (id: string) => void;
  doneCount: number;
  pendingCount: number;
  /** Live thumbnail from the open editor; null when nothing is editing. */
  previewDataUrl?: string | null;
}

type ViewMode = 'list' | 'grid';

function StatusIcon({ status }: { status: ImageItem['status'] }) {
  if (status === 'done')    return <CheckCircle2 size={12} className="si-done" />;
  if (status === 'editing') return <Pencil       size={12} className="si-editing" />;
  return                           <Clock        size={12} className="si-pending" />;
}

export function ImageQueue({
  images, activeId, renameConfig,
  onSelect, onRemove, onReset, onReorder, onDuplicate,
  doneCount, pendingCount, previewDataUrl,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // ── FLIP drag state ───────────────────────────────────────────────
  const dragIndexRef  = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  // Visual-order while dragging (reordered IDs, not committed yet)
  const [visualOrder, setVisualOrder] = useState<string[]>([]);

  // Initialise / sync visual order with real order
  useEffect(() => {
    setVisualOrder(images.map((img) => img.id));
  }, [images]);

  const getVisualImages = useCallback((): ImageItem[] => {
    if (visualOrder.length !== images.length) return images;
    const map = new Map(images.map((img) => [img.id, img]));
    return visualOrder.map((id) => map.get(id)!).filter(Boolean);
  }, [images, visualOrder]);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    setDraggingIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(targetIndex);

    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === targetIndex) return;

    // Compute tentative visual order while still dragging
    setVisualOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, moved);
      // Update the logical drag index so subsequent moves stay consistent
      dragIndexRef.current = targetIndex;
      return next;
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    // Commit via real images array positions
    if (fromIndex !== null && fromIndex !== toIndex) {
      const realImages = images;
      const dragged = visualOrder[toIndex]; // id of the dragged item
      const realFrom = realImages.findIndex((img) => img.id === (visualOrder[dragIndexRef.current ?? toIndex] ?? dragged));
      void realFrom;
      // Simplest: just use the visual indices as they track the intended position
      onReorder(
        images.findIndex((img) => img.id === visualOrder[fromIndex < toIndex ? fromIndex : toIndex]),
        images.findIndex((img) => img.id === visualOrder[fromIndex < toIndex ? toIndex   : fromIndex])
      );
    }
    dragIndexRef.current = null;
    setDragOverIdx(null);
    setDraggingIdx(null);
  }, [images, visualOrder, onReorder]);

  const handleDragEnd = useCallback(() => {
    // Snap visual order back to real order on cancel
    setVisualOrder(images.map((img) => img.id));
    dragIndexRef.current = null;
    setDragOverIdx(null);
    setDraggingIdx(null);
  }, [images]);

  // ── Render items ─────────────────────────────────────────────────
  const visImages = getVisualImages();

  const renderItem = (img: ImageItem, visualIndex: number) => {
    const realIndex = images.findIndex((i) => i.id === img.id);
    const isActive     = img.id === activeId;
    const isDragOver   = dragOverIdx === visualIndex;
    const isDragging   = draggingIdx !== null && images[draggingIdx]?.id === img.id;
    const finalName    = generateFinalName(img.name, realIndex, renameConfig);
    const hasRename    = finalName !== img.name;

    const sharedDragProps = {
      draggable: true,
      onDragStart: (e: React.DragEvent) => handleDragStart(e, visualIndex),
      onDragOver:  (e: React.DragEvent) => handleDragOver(e, visualIndex),
      onDrop:      (e: React.DragEvent) => handleDrop(e, visualIndex),
      onDragEnd:   handleDragEnd,
    };

    if (viewMode === 'grid') {
      return (
        <div
          key={img.id}
          className={[
            'gallery-card',
            isActive    ? 'active'    : '',
            img.status === 'done' ? 'done' : '',
            isDragOver  ? 'drag-over' : '',
            isDragging  ? 'dragging'  : '',
          ].filter(Boolean).join(' ')}
          onClick={() => onSelect(img.id)}
          title={img.name}
          {...sharedDragProps}
        >
          <div className="gallery-thumb-wrap">
            <img src={img.processedDataUrl ?? img.originalDataUrl} alt={img.name}
              className="gallery-thumb" loading="lazy" />
            <span className="gallery-index">{realIndex + 1}</span>
            <span className={`gallery-status-dot ${img.status}`} />
          </div>
          <div className="gallery-card-info">
            <span className="gallery-orig-name">{img.name}</span>
            {hasRename && <span className="gallery-final-name" title={finalName}>→ {finalName}</span>}
          </div>
          <div className="gallery-card-actions" onClick={(e) => e.stopPropagation()}>
            <button className="queue-action-btn" title="Duplicate" onClick={() => onDuplicate(img.id)}>
              <Copy size={11} />
            </button>
            {img.status === 'done' && (
              <button className="queue-action-btn" title="Re-edit" onClick={() => onReset(img.id)}>
                <RotateCcw size={11} />
              </button>
            )}
            <button className="queue-action-btn danger" title="Remove" onClick={() => onRemove(img.id)}>
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={img.id}
        className={[
          'queue-item',
          isActive   ? 'active'    : '',
          img.status === 'done' ? 'done' : '',
          isDragOver ? 'drag-over' : '',
          isDragging ? 'dragging'  : '',
        ].filter(Boolean).join(' ')}
        onClick={() => onSelect(img.id)}
        title={img.name}
        {...sharedDragProps}
      >
        <div className="drag-handle" title="Drag to reorder">⠿</div>
        <div className="queue-thumb-wrap">
          <img src={img.processedDataUrl ?? img.originalDataUrl} alt={img.name}
            className="queue-thumb" loading="lazy" />
          <span className="queue-index">{realIndex + 1}</span>
        </div>
        <div className="queue-info">
          <span className="queue-name">{img.name}</span>
          {hasRename && <span className="queue-final-name" title={finalName}>→ {finalName}</span>}
          <div className="queue-status-row">
            <StatusIcon status={img.status} />
            <span className={`queue-status-label ${img.status}`}>{img.status}</span>
          </div>
        </div>
        <div className="queue-actions" onClick={(e) => e.stopPropagation()}>
          <button className="queue-action-btn" title="Duplicate" onClick={() => onDuplicate(img.id)}>
            <Copy size={13} />
          </button>
          {img.status === 'done' && (
            <button className="queue-action-btn" title="Re-edit" onClick={() => onReset(img.id)}>
              <RotateCcw size={13} />
            </button>
          )}
          <button className="queue-action-btn danger" title="Remove" onClick={() => onRemove(img.id)}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <aside className="queue-sidebar">
      <div className="queue-stats">
        <span className="stat done">{doneCount} done</span>
        <span className="stat-sep">/</span>
        <span className="stat pending">{pendingCount} left</span>
        <span className="stat-sep">/</span>
        <span className="stat total">{images.length} total</span>
        <div className="view-toggle">
          <button className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')} title="List view"><List size={13} /></button>
          <button className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')} title="Grid view"><LayoutGrid size={13} /></button>
        </div>
      </div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill"
          style={{ width: images.length ? `${(doneCount / images.length) * 100}%` : '0%' }} />
      </div>
      <div className={viewMode === 'grid' ? 'gallery-grid' : 'queue-list'}
        onDragOver={(e) => e.preventDefault()}>
        {images.length === 0 && (
          <div className="queue-empty">
            <p>No images yet.</p>
            <p className="queue-empty-hint">Import images to get started.</p>
          </div>
        )}
        {visImages.map((img, visIdx) => renderItem(img, visIdx))}
      </div>

      {/* ── Live preview panel ── */}
      {previewDataUrl && (
        <div className="queue-preview-panel">
          <span className="queue-preview-label">Preview</span>
          <div className="queue-preview-img-wrap">
            <img
              src={previewDataUrl}
              alt="Live preview"
              className="queue-preview-img"
            />
          </div>
        </div>
      )}
    </aside>
  );
}
