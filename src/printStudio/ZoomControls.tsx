// ─── Zoom Controls ────────────────────────────────────────────────────────────

import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface ZoomControlsProps {
  zoom: number;
  onZoom: (z: number) => void;
}

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export function ZoomControls({ zoom, onZoom }: ZoomControlsProps) {
  const pct = Math.round(zoom * 100);

  function zoomIn() {
    const next = ZOOM_STEPS.find((s) => s > zoom);
    if (next !== undefined) onZoom(next);
  }

  function zoomOut() {
    const prev = [...ZOOM_STEPS].reverse().find((s) => s < zoom);
    if (prev !== undefined) onZoom(prev);
  }

  return (
    <div className="ps-zoom-controls">
      <button className="ps-zoom-btn" onClick={zoomOut} title="Zoom out" disabled={zoom <= ZOOM_STEPS[0]}>
        <ZoomOut size={14} />
      </button>
      <select
        className="ps-zoom-select"
        value={zoom}
        onChange={(e) => onZoom(parseFloat(e.target.value))}
        title="Zoom level"
      >
        {ZOOM_STEPS.map((s) => (
          <option key={s} value={s}>{Math.round(s * 100)}%</option>
        ))}
      </select>
      <button className="ps-zoom-btn" onClick={zoomIn} title="Zoom in" disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}>
        <ZoomIn size={14} />
      </button>
      <button className="ps-zoom-btn" onClick={() => onZoom(1)} title="Reset zoom">
        <Maximize2 size={14} />
      </button>
      <span className="ps-zoom-label">{pct}%</span>
    </div>
  );
}
