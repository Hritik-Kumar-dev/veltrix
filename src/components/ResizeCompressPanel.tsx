import { useState } from 'react';
import type { ResizeCompressConfig } from '../types';

type SizePreset = '100kb' | '200kb' | '500kb' | '1mb' | 'custom' | 'none';
type DimPreset = 'original' | '1200' | '1920' | '800' | 'custom';

const SIZE_PRESETS: { id: SizePreset; label: string; bytes: number | null }[] = [
  { id: 'none',   label: 'None',    bytes: null },
  { id: '100kb',  label: '≤ 100 KB', bytes: 100  * 1024 },
  { id: '200kb',  label: '≤ 200 KB', bytes: 200  * 1024 },
  { id: '500kb',  label: '≤ 500 KB', bytes: 500  * 1024 },
  { id: '1mb',    label: '≤ 1 MB',  bytes: 1024 * 1024 },
  { id: 'custom', label: 'Custom',  bytes: null },
];

const DIM_PRESETS: { id: DimPreset; label: string; max: number | null }[] = [
  { id: 'original', label: 'Original', max: null },
  { id: '800',      label: '800 px',  max: 800  },
  { id: '1200',     label: '1200 px', max: 1200 },
  { id: '1920',     label: '1920 px', max: 1920 },
  { id: 'custom',   label: 'Custom',  max: null },
];

interface Props {
  config: ResizeCompressConfig;
  onChange: (cfg: ResizeCompressConfig) => void;
  /** Optional: estimated output size string to show as live feedback */
  estimatedSize?: string;
}

export function ResizeCompressPanel({ config, onChange, estimatedSize }: Props) {
  const [sizePreset, setSizePreset] = useState<SizePreset>('none');
  const [dimPreset,  setDimPreset]  = useState<DimPreset>('original');
  const [customKb,   setCustomKb]   = useState<string>('');
  const [customW,    setCustomW]    = useState<string>(config.maxWidth  ? String(config.maxWidth)  : '');
  const [customH,    setCustomH]    = useState<string>(config.maxHeight ? String(config.maxHeight) : '');

  const update = (partial: Partial<ResizeCompressConfig>) =>
    onChange({ ...config, ...partial });

  // ── Size preset ────────────────────────────────────────────────────
  const handleSizePreset = (preset: typeof SIZE_PRESETS[number]) => {
    setSizePreset(preset.id);
    if (preset.id !== 'custom') {
      update({ maxSizeBytes: preset.bytes });
    }
  };

  const handleCustomKb = (val: string) => {
    setCustomKb(val);
    const n = Number(val);
    update({ maxSizeBytes: n > 0 ? n * 1024 : null });
  };

  // ── Dimension preset ───────────────────────────────────────────────
  const handleDimPreset = (preset: typeof DIM_PRESETS[number]) => {
    setDimPreset(preset.id);
    if (preset.id === 'original') {
      setCustomW('');
      setCustomH('');
      update({ maxWidth: null, maxHeight: null });
    } else if (preset.id !== 'custom') {
      setCustomW(String(preset.max));
      setCustomH('');
      update({ maxWidth: preset.max, maxHeight: null });
    }
  };

  const handleCustomW = (val: string) => {
    setCustomW(val);
    const n = Number(val);
    update({ maxWidth: n > 0 ? n : null });
  };

  const handleCustomH = (val: string) => {
    setCustomH(val);
    const n = Number(val);
    update({ maxHeight: n > 0 ? n : null });
  };

  return (
    <div className="rc-panel">
      {/* ── Dimensions ── */}
      <div className="rc-section">
        <span className="rc-section-title">Resize Dimensions</span>

        <div className="rc-presets">
          {DIM_PRESETS.map((p) => (
            <button
              key={p.id}
              className={`rc-preset-btn ${dimPreset === p.id ? 'active' : ''}`}
              onClick={() => handleDimPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {dimPreset === 'custom' && (
          <div className="rc-dim-inputs">
            <div className="rc-dim-field">
              <label className="rc-dim-label">Width</label>
              <div className="rc-dim-input-wrap">
                <input
                  type="number"
                  className="rc-dim-input"
                  min={1}
                  placeholder="e.g. 1200"
                  value={customW}
                  onChange={(e) => handleCustomW(e.target.value)}
                />
                <span className="rc-dim-unit">px</span>
              </div>
            </div>
            <div className="rc-dim-field">
              <label className="rc-dim-label">Height</label>
              <div className="rc-dim-input-wrap">
                <input
                  type="number"
                  className="rc-dim-input"
                  min={1}
                  placeholder="e.g. 900"
                  value={customH}
                  onChange={(e) => handleCustomH(e.target.value)}
                />
                <span className="rc-dim-unit">px</span>
              </div>
            </div>
          </div>
        )}

        {/* Show current dimension constraint if set */}
        {(config.maxWidth || config.maxHeight) && (
          <div className="rc-current-constraint">
            Max: {config.maxWidth ?? '—'} × {config.maxHeight ?? '—'} px
          </div>
        )}

        <label className="rc-checkbox-row">
          <input
            type="checkbox"
            className="rc-checkbox"
            checked={config.maintainAspectRatio}
            onChange={(e) => update({ maintainAspectRatio: e.target.checked })}
          />
          <span className="rc-checkbox-label">Maintain aspect ratio</span>
        </label>
      </div>

      {/* ── File size ── */}
      <div className="rc-section">
        <span className="rc-section-title">Max File Size</span>

        <div className="rc-presets">
          {SIZE_PRESETS.map((p) => (
            <button
              key={p.id}
              className={`rc-preset-btn ${sizePreset === p.id ? 'active' : ''}`}
              onClick={() => handleSizePreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {sizePreset === 'custom' && (
          <div className="rc-dim-inputs">
            <div className="rc-dim-field">
              <label className="rc-dim-label">Maximum</label>
              <div className="rc-dim-input-wrap">
                <input
                  type="number"
                  className="rc-dim-input"
                  min={1}
                  placeholder="e.g. 300"
                  value={customKb}
                  onChange={(e) => handleCustomKb(e.target.value)}
                />
                <span className="rc-dim-unit">KB</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Live size estimate ── */}
      {estimatedSize && (
        <div className="rc-estimate">
          <span className="rc-estimate-label">Est. output size</span>
          <span className="rc-estimate-value">{estimatedSize}</span>
        </div>
      )}
    </div>
  );
}
