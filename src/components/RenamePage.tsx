import { useRef, useState, useCallback } from 'react';
import {
  RotateCcw,
  Tag,
  CheckCircle2,
  Clock,
  GripVertical,
} from 'lucide-react';
import type { ImageItem, RenameConfig } from '../types';
import { generateFinalName } from '../renameUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ImageItem['status'] }) {
  if (status === 'done')
    return (
      <span className="rp-badge done">
        <CheckCircle2 size={10} /> done
      </span>
    );
  if (status === 'editing')
    return (
      <span className="rp-badge in-progress">
        <Clock size={10} /> in progress
      </span>
    );
  return (
    <span className="rp-badge pending">
      <Clock size={10} /> pending
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gallery card
// ─────────────────────────────────────────────────────────────────────────────

interface CardProps {
  img: ImageItem;
  index: number;
  config: RenameConfig;
  isDragOver: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDrop: (e: React.DragEvent, i: number) => void;
  onDragEnd: () => void;
}

function RenameCard({
  img,
  index,
  config,
  isDragOver,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: CardProps) {
  const finalName = generateFinalName(img.name, index, config);
  const changed = finalName !== img.name;

  // Use the saved/processed version when available (reflects crop + rotation).
  // For images not yet saved, fall back to the original — and show an indicator.
  const previewSrc = img.processedDataUrl ?? img.originalDataUrl;
  const hasUnsavedEdits = img.status !== 'done' && img.cropData !== null;

  return (
    <div
      className={`rp-card ${isDragOver ? 'rp-card--drag-over' : ''} ${isDragging ? 'rp-card--dragging' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      {/* Drag handle — top-right grip */}
      <div className="rp-card-grip">
        <GripVertical size={14} />
      </div>

      {/* Position badge */}
      <span className="rp-card-index">{index + 1}</span>

      {/* Thumbnail — always the latest saved edit, or original if not yet saved */}
      <div className="rp-card-thumb-wrap">
        <img
          src={previewSrc}
          alt={img.name}
          className="rp-card-thumb"
          loading="lazy"
          draggable={false}
        />
        {/* Overlay shown when edits exist but haven't been saved yet */}
        {hasUnsavedEdits && (
          <div className="rp-card-unsaved" title="Edits not yet saved — return to editor and click Save to reflect them here">
            unsaved edits
          </div>
        )}
      </div>

      {/* Name block */}
      <div className="rp-card-names">
        <span className="rp-card-orig" title={img.name}>
          {img.name}
        </span>
        <span className={`rp-card-final ${changed ? 'changed' : ''}`} title={finalName}>
          → {finalName}
        </span>
      </div>

      {/* Status — read-only indicator, no editing affordance */}
      <div className="rp-card-footer">
        <StatusBadge status={img.status} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rename controls panel
// ─────────────────────────────────────────────────────────────────────────────

interface ControlsProps {
  images: ImageItem[];
  config: RenameConfig;
  onChange: (cfg: RenameConfig) => void;
  onReset: () => void;
}

function RenameControls({ images, config, onChange, onReset }: ControlsProps) {
  const update = (partial: Partial<RenameConfig>) => onChange({ ...config, ...partial });

  return (
    <div className="rp-controls">
      {/* Header */}
      <div className="rp-controls-header">
        <Tag size={15} className="rp-controls-icon" />
        <span className="rp-controls-title">Rename Settings</span>
      </div>

      {/* Fields */}
      <div className="rp-controls-body">
        <div className="rp-field">
          <label className="rp-label">Prefix</label>
          <input
            type="text"
            className="rp-input"
            placeholder="e.g. vacation"
            value={config.prefix}
            onChange={(e) => update({ prefix: e.target.value })}
            spellCheck={false}
          />
        </div>

        <label className="rp-checkbox-row">
          <input
            type="checkbox"
            className="rp-checkbox"
            checked={config.keepOriginalName}
            onChange={(e) => update({ keepOriginalName: e.target.checked })}
          />
          <span className="rp-checkbox-label">Keep original filename</span>
        </label>

        <div className="rp-field-pair">
          <div className="rp-field">
            <label className="rp-label">Start #</label>
            <input
              type="number"
              className="rp-input"
              min={0}
              value={config.startNumber}
              onChange={(e) => update({ startNumber: Math.max(0, Number(e.target.value)) })}
            />
          </div>
          <div className="rp-field">
            <label className="rp-label">Padding</label>
            <input
              type="number"
              className="rp-input"
              min={1}
              max={10}
              value={config.padding}
              onChange={(e) =>
                update({ padding: Math.min(10, Math.max(1, Number(e.target.value))) })
              }
            />
          </div>
        </div>

        <div className="rp-example-box">
          <span className="rp-example-label">Example output</span>
          {images.length > 0 ? (
            <span className="rp-example-value">
              {generateFinalName(images[0].name, 0, config)}
            </span>
          ) : (
            <span className="rp-example-value muted">—</span>
          )}
        </div>

        <button className="rp-reset-btn" onClick={onReset}>
          <RotateCcw size={13} />
          Reset to defaults
        </button>
      </div>

      {/* Live preview table */}
      {images.length > 0 && (
        <div className="rp-preview-wrap">
          <p className="rp-preview-label">Live Preview</p>
          <div className="rp-preview-table">
            <div className="rp-preview-head">
              <span>#</span>
              <span>Original</span>
              <span>→</span>
              <span>Generated</span>
            </div>
            <div className="rp-preview-body">
              {images.slice(0, 100).map((img, idx) => {
                const final = generateFinalName(img.name, idx, config);
                const changed = final !== img.name;
                return (
                  <div key={img.id} className="rp-preview-row">
                    <span className="rp-pv-num">{idx + 1}</span>
                    <span className="rp-pv-orig" title={img.name}>
                      {img.name}
                    </span>
                    <span className="rp-pv-arrow">→</span>
                    <span
                      className={`rp-pv-final ${changed ? 'changed' : ''}`}
                      title={final}
                    >
                      {final}
                    </span>
                  </div>
                );
              })}
              {images.length > 100 && (
                <div className="rp-preview-more">+{images.length - 100} more…</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main RenamePage
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  images: ImageItem[];
  config: RenameConfig;
  onChange: (cfg: RenameConfig) => void;
  onReset: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export function RenamePage({ images, config, onChange, onReset, onReorder }: Props) {
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    setDraggingIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(index);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = dragIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex) {
        onReorder(fromIndex, toIndex);
      }
      dragIndexRef.current = null;
      setDragOverIdx(null);
      setDraggingIdx(null);
    },
    [onReorder]
  );

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIdx(null);
    setDraggingIdx(null);
  }, []);

  return (
    <div className="rp-root">
      {/* Large gallery — left */}
      <section className="rp-gallery-section">
        <div className="rp-gallery-header">
          <span className="rp-gallery-title">Gallery</span>
          <span className="rp-gallery-hint">Drag cards to reorder · numbering updates instantly</span>
          <span className="rp-gallery-count">{images.length} image{images.length !== 1 ? 's' : ''}</span>
        </div>

        {images.length === 0 ? (
          <div className="rp-gallery-empty">
            <p>No images imported yet.</p>
            <p className="rp-gallery-empty-hint">Import images from the toolbar to get started.</p>
          </div>
        ) : (
          <div
            className="rp-gallery-grid"
            onDragOver={(e) => e.preventDefault()}
          >
            {images.map((img, index) => (
              <RenameCard
                key={img.id}
                img={img}
                index={index}
                config={config}
                isDragOver={dragOverIdx === index}
                isDragging={draggingIdx === index}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        )}
      </section>

      {/* Controls — right */}
      <RenameControls
        images={images}
        config={config}
        onChange={onChange}
        onReset={onReset}
      />
    </div>
  );
}
