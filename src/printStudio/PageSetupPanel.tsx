// ─── Page Setup Panel ─────────────────────────────────────────────────────────
// Allows the user to pick A4/A3/Legal/B4/Custom and portrait/landscape.
// Custom preset reveals width/height inputs with unit selector.

import { useState, useEffect } from 'react';
import type { PagePreset, DisplayUnit } from './types';
import type { PrintDocument } from './types';
import {
  PAGE_PRESET_ORDER, PAGE_PRESETS,
  mmToDisplay, displayToMm, UNIT_LABELS, effectivePageSize,
} from './units';

interface Props {
  doc: PrintDocument;
  displayUnit: DisplayUnit;
  onUnitChange: (u: DisplayUnit) => void;
  onPresetChange: (preset: PagePreset, customW?: number, customH?: number) => void;
  onPortraitChange: (portrait: boolean) => void;
}

export function PageSetupPanel({
  doc, displayUnit, onUnitChange, onPresetChange, onPortraitChange,
}: Props) {
  const isCustom = doc.page.name === 'Custom';

  // Custom dimension local state (in mm, driven by display unit input)
  const [customW, setCustomW] = useState(doc.page.width_mm);
  const [customH, setCustomH] = useState(doc.page.height_mm);

  // Sync when page changes externally
  useEffect(() => {
    setCustomW(doc.page.width_mm);
    setCustomH(doc.page.height_mm);
  }, [doc.page.width_mm, doc.page.height_mm]);

  const { width_mm, height_mm } = effectivePageSize(doc);

  function handlePresetSelect(preset: string) {
    if (preset === 'Custom') {
      onPresetChange('Custom', customW, customH);
    } else {
      onPresetChange(preset as PagePreset);
    }
  }

  function handleCustomW(raw: string) {
    const v = parseFloat(raw);
    if (isNaN(v) || v <= 0) return;
    const mm = displayToMm(v, displayUnit);
    setCustomW(mm);
    onPresetChange('Custom', mm, customH);
  }

  function handleCustomH(raw: string) {
    const v = parseFloat(raw);
    if (isNaN(v) || v <= 0) return;
    const mm = displayToMm(v, displayUnit);
    setCustomH(mm);
    onPresetChange('Custom', customW, mm);
  }

  return (
    <div className="ps-panel">
      <div className="ps-panel-title">Page</div>

      {/* Page preset dropdown */}
      <div className="ps-field">
        <label className="ps-label">Size</label>
        <select
          className="ps-select"
          value={doc.page.name}
          onChange={(e) => handlePresetSelect(e.target.value)}
        >
          {PAGE_PRESET_ORDER.map((p) => (
            <option key={p} value={p}>
              {p} ({PAGE_PRESETS[p].width_mm}×{PAGE_PRESETS[p].height_mm} mm)
            </option>
          ))}
          <option value="Custom">Custom</option>
        </select>
      </div>

      {/* Custom size inputs */}
      {isCustom && (
        <div className="ps-field ps-field--row">
          <div className="ps-dim-group">
            <label className="ps-label">W</label>
            <input
              type="number"
              className="ps-input"
              step="0.1"
              min="1"
              value={mmToDisplay(customW, displayUnit).toFixed(1)}
              onChange={(e) => handleCustomW(e.target.value)}
            />
          </div>
          <span className="ps-dim-sep">×</span>
          <div className="ps-dim-group">
            <label className="ps-label">H</label>
            <input
              type="number"
              className="ps-input"
              step="0.1"
              min="1"
              value={mmToDisplay(customH, displayUnit).toFixed(1)}
              onChange={(e) => handleCustomH(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Portrait / Landscape toggle */}
      <div className="ps-field">
        <label className="ps-label">Orientation</label>
        <div className="ps-orient-group">
          <button
            className={`ps-orient-btn${doc.portrait ? ' active' : ''}`}
            onClick={() => onPortraitChange(true)}
            title="Portrait"
          >
            <PortraitIcon />
            <span>Portrait</span>
          </button>
          <button
            className={`ps-orient-btn${!doc.portrait ? ' active' : ''}`}
            onClick={() => onPortraitChange(false)}
            title="Landscape"
          >
            <LandscapeIcon />
            <span>Landscape</span>
          </button>
        </div>
      </div>

      {/* Page dimensions info */}
      <div className="ps-dims-info">
        {mmToDisplay(width_mm, displayUnit).toFixed(1)} × {mmToDisplay(height_mm, displayUnit).toFixed(1)} {UNIT_LABELS[displayUnit]}
      </div>

      {/* Display unit selector */}
      <div className="ps-field">
        <label className="ps-label">Units</label>
        <div className="ps-unit-group">
          {(['mm', 'cm', 'in'] as DisplayUnit[]).map((u) => (
            <button
              key={u}
              className={`ps-unit-btn${displayUnit === u ? ' active' : ''}`}
              onClick={() => onUnitChange(u)}
            >
              {UNIT_LABELS[u]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PortraitIcon() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
      <rect x="1" y="1" width="10" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function LandscapeIcon() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
      <rect x="1" y="1" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}
