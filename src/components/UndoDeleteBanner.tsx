import { useEffect, useState } from 'react';
import { Trash2, Undo2 } from 'lucide-react';
import type { PendingDelete } from '../types';
import { UNDO_DELAY_MS } from '../hooks/useImageStore';

const DURATION = UNDO_DELAY_MS;
const RADIUS   = 10;
const CIRCUM   = 2 * Math.PI * RADIUS;

interface Props {
  pendingDelete: PendingDelete;
  onUndo: () => void;
}

export function UndoDeleteBanner({ pendingDelete, onUndo }: Props) {
  // Tick every 50 ms to drive the countdown ring
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const id = setInterval(() => {
      const e = Date.now() - pendingDelete.startedAt;
      setElapsed(Math.min(e, DURATION));
    }, 50);
    return () => clearInterval(id);
  }, [pendingDelete.startedAt]);

  const progress  = elapsed / DURATION;           // 0 → 1
  const remaining = Math.max(0, Math.ceil((DURATION - elapsed) / 1000));
  const dashOffset = CIRCUM * (1 - progress);     // ring drains as progress grows

  return (
    <div className="undo-banner" role="status" aria-live="polite">
      {/* Countdown ring */}
      <svg
        className="undo-ring"
        width={28}
        height={28}
        viewBox="0 0 28 28"
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={14} cy={14} r={RADIUS}
          fill="none"
          stroke="var(--border-light)"
          strokeWidth={2.5}
        />
        {/* Draining arc */}
        <circle
          cx={14} cy={14} r={RADIUS}
          fill="none"
          stroke="var(--red)"
          strokeWidth={2.5}
          strokeDasharray={CIRCUM}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 14 14)"
          style={{ transition: 'stroke-dashoffset 50ms linear' }}
        />
        {/* Seconds label */}
        <text
          x={14} y={14}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={8}
          fontWeight={700}
          fill="var(--text-primary)"
        >
          {remaining}
        </text>
      </svg>

      {/* Message */}
      <Trash2 size={14} className="undo-trash-icon" />
      <span className="undo-message">
        <span className="undo-name" title={pendingDelete.image.name}>
          {pendingDelete.image.name}
        </span>
        &nbsp;removed
      </span>

      {/* Undo button */}
      <button className="undo-btn" onClick={onUndo} aria-label="Undo delete">
        <Undo2 size={13} />
        Undo
      </button>
    </div>
  );
}
