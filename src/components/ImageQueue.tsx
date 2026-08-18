import { useRef } from 'react';
import { CheckCircle2, Clock, Pencil, Trash2, RotateCcw } from 'lucide-react';
import type { ImageItem } from '../types';

interface Props {
  images: ImageItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReset: (id: string) => void;
  doneCount: number;
  pendingCount: number;
}

function StatusIcon({ status }: { status: ImageItem['status'] }) {
  if (status === 'done')
    return <CheckCircle2 size={14} className="text-green-400 shrink-0" />;
  if (status === 'editing')
    return <Pencil size={14} className="text-blue-400 shrink-0 animate-pulse" />;
  return <Clock size={14} className="text-zinc-500 shrink-0" />;
}

export function ImageQueue({
  images,
  activeId,
  onSelect,
  onRemove,
  onReset,
  doneCount,
  pendingCount,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <aside className="queue-sidebar">
      {/* Stats bar */}
      <div className="queue-stats">
        <span className="stat done">{doneCount} done</span>
        <span className="stat-sep">/</span>
        <span className="stat pending">{pendingCount} left</span>
        <span className="stat-sep">/</span>
        <span className="stat total">{images.length} total</span>
      </div>

      {/* Progress bar */}
      <div className="progress-bar-track">
        <div
          className="progress-bar-fill"
          style={{
            width: images.length ? `${(doneCount / images.length) * 100}%` : '0%',
          }}
        />
      </div>

      {/* Image list */}
      <div className="queue-list" ref={listRef}>
        {images.length === 0 && (
          <div className="queue-empty">
            <p>No images yet.</p>
            <p className="queue-empty-hint">Import images to get started.</p>
          </div>
        )}

        {images.map((img, index) => {
          const isActive = img.id === activeId;
          return (
            <div
              key={img.id}
              className={`queue-item ${isActive ? 'active' : ''} ${img.status === 'done' ? 'done' : ''}`}
              onClick={() => onSelect(img.id)}
              title={img.name}
            >
              {/* Thumbnail */}
              <div className="queue-thumb-wrap">
                <img
                  src={img.processedDataUrl ?? img.originalDataUrl}
                  alt={img.name}
                  className="queue-thumb"
                  loading="lazy"
                />
                <span className="queue-index">{index + 1}</span>
              </div>

              {/* Info */}
              <div className="queue-info">
                <span className="queue-name">{img.name}</span>
                <div className="queue-status-row">
                  <StatusIcon status={img.status} />
                  <span className={`queue-status-label ${img.status}`}>
                    {img.status}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="queue-actions" onClick={(e) => e.stopPropagation()}>
                {img.status === 'done' && (
                  <button
                    className="queue-action-btn"
                    title="Re-edit"
                    onClick={() => onReset(img.id)}
                  >
                    <RotateCcw size={13} />
                  </button>
                )}
                <button
                  className="queue-action-btn danger"
                  title="Remove"
                  onClick={() => onRemove(img.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
