// ─── Selected Element Panel ───────────────────────────────────────────────────
// Numeric inputs for X, Y, Width, Height, Rotation — all in the user's chosen
// display unit, converted to/from mm. Both this panel and canvas drag write to
// the same mm-based state.

import { useEffect, useState } from 'react';
import { Lock, Unlock, Copy, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type { PrintElement, DisplayUnit } from './types';
import { mmToDisplay, displayToMm, UNIT_LABELS } from './units';

interface Props {
  element: PrintElement;
  displayUnit: DisplayUnit;
  onUpdate: (patch: Partial<Omit<PrintElement, 'id'>>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRaise: () => void;
  onLower: () => void;
}

export function SelectedElementPanel({
  element, displayUnit,
  onUpdate, onDelete, onDuplicate, onRaise, onLower,
}: Props) {
  const u = UNIT_LABELS[displayUnit];

  // Local string state so partial typing (e.g. "1.") doesn't lose focus
  const [fields, setFields] = useState(() => toDisplayFields(element, displayUnit));

  // Sync when element changes externally (e.g. from drag)
  useEffect(() => {
    setFields(toDisplayFields(element, displayUnit));
  }, [element.x_mm, element.y_mm, element.width_mm, element.height_mm, element.rotation_deg, displayUnit]);

  function commit(field: keyof typeof fields, raw: string) {
    const v = parseFloat(raw);
    if (isNaN(v)) return;
    switch (field) {
      case 'x':   onUpdate({ x_mm: displayToMm(v, displayUnit) }); break;
      case 'y':   onUpdate({ y_mm: displayToMm(v, displayUnit) }); break;
      case 'w': {
        const w_mm = displayToMm(v, displayUnit);
        if (element.lockAspect) {
          const aspect = element.width_mm / element.height_mm;
          onUpdate({ width_mm: w_mm, height_mm: w_mm / aspect });
        } else {
          onUpdate({ width_mm: w_mm });
        }
        break;
      }
      case 'h': {
        const h_mm = displayToMm(v, displayUnit);
        if (element.lockAspect) {
          const aspect = element.width_mm / element.height_mm;
          onUpdate({ height_mm: h_mm, width_mm: h_mm * aspect });
        } else {
          onUpdate({ height_mm: h_mm });
        }
        break;
      }
      case 'r':   onUpdate({ rotation_deg: v }); break;
    }
  }

  function handleChange(field: keyof typeof fields, val: string) {
    setFields((prev) => ({ ...prev, [field]: val }));
  }

  function handleBlur(field: keyof typeof fields) {
    commit(field, fields[field]);
  }

  function handleKeyDown(e: React.KeyboardEvent, field: keyof typeof fields) {
    if (e.key === 'Enter') commit(field, fields[field]);
  }

  return (
    <div className="ps-panel ps-panel--element">
      <div className="ps-panel-title">Element</div>

      {/* Position */}
      <div className="ps-field-row">
        <NumInput
          label={`X (${u})`} value={fields.x}
          onChange={(v) => handleChange('x', v)}
          onBlur={() => handleBlur('x')}
          onKeyDown={(e) => handleKeyDown(e, 'x')}
        />
        <NumInput
          label={`Y (${u})`} value={fields.y}
          onChange={(v) => handleChange('y', v)}
          onBlur={() => handleBlur('y')}
          onKeyDown={(e) => handleKeyDown(e, 'y')}
        />
      </div>

      {/* Size */}
      <div className="ps-field-row">
        <NumInput
          label={`W (${u})`} value={fields.w}
          onChange={(v) => handleChange('w', v)}
          onBlur={() => handleBlur('w')}
          onKeyDown={(e) => handleKeyDown(e, 'w')}
        />
        <NumInput
          label={`H (${u})`} value={fields.h}
          onChange={(v) => handleChange('h', v)}
          onBlur={() => handleBlur('h')}
          onKeyDown={(e) => handleKeyDown(e, 'h')}
        />
      </div>

      {/* Aspect lock + Rotation */}
      <div className="ps-field-row">
        <button
          className={`ps-icon-btn${element.lockAspect ? ' active' : ''}`}
          title={element.lockAspect ? 'Aspect locked' : 'Aspect unlocked'}
          onClick={() => onUpdate({ lockAspect: !element.lockAspect })}
        >
          {element.lockAspect ? <Lock size={13} /> : <Unlock size={13} />}
          <span>{element.lockAspect ? 'Locked' : 'Free'}</span>
        </button>
        <NumInput
          label="Rot °" value={fields.r}
          onChange={(v) => handleChange('r', v)}
          onBlur={() => handleBlur('r')}
          onKeyDown={(e) => handleKeyDown(e, 'r')}
          step="1"
        />
      </div>

      {/* Z-order */}
      <div className="ps-field-row ps-field-row--actions">
        <button className="ps-icon-btn" title="Raise layer" onClick={onRaise}>
          <ArrowUp size={13} /> <span>Raise</span>
        </button>
        <button className="ps-icon-btn" title="Lower layer" onClick={onLower}>
          <ArrowDown size={13} /> <span>Lower</span>
        </button>
        <button className="ps-icon-btn" title="Duplicate element" onClick={onDuplicate}>
          <Copy size={13} /> <span>Copy</span>
        </button>
        <button className="ps-icon-btn danger" title="Delete element" onClick={onDelete}>
          <Trash2 size={13} /> <span>Del</span>
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDisplayFields(el: PrintElement, unit: DisplayUnit) {
  const dp = unit === 'mm' ? 1 : 2;
  return {
    x: mmToDisplay(el.x_mm, unit).toFixed(dp),
    y: mmToDisplay(el.y_mm, unit).toFixed(dp),
    w: mmToDisplay(el.width_mm, unit).toFixed(dp),
    h: mmToDisplay(el.height_mm, unit).toFixed(dp),
    r: el.rotation_deg.toFixed(1),
  };
}

interface NumInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  step?: string;
}

function NumInput({ label, value, onChange, onBlur, onKeyDown, step = '0.1' }: NumInputProps) {
  return (
    <div className="ps-num-field">
      <label className="ps-label">{label}</label>
      <input
        type="number"
        className="ps-input ps-input--num"
        value={value}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
