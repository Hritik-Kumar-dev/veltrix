import { useState, useEffect } from 'react';
import { Lock, Unlock } from 'lucide-react';
import type { ResizeCompressConfig } from '../types';

type SizePreset = '100kb' | '200kb' | '500kb' | '1mb' | 'custom' | 'none';
type DimPreset  = 'original' | '800' | '1200' | '1920' | 'custom';

const SIZE_PRESETS: { id: SizePreset; label: string; bytes: number | null }[] = [
  { id: 'none',   label: 'None',      bytes: null },
  { id: '100kb',  label: '≤ 100 KB',  bytes: 100  * 1024 },
  { id: '200kb',  label: '≤ 200 KB',  bytes: 200  * 1024 },
  { id: '500kb',  label: '≤ 500 KB',  bytes: 500  * 1024 },
  { id: '1mb',    label: '≤ 1 MB',    bytes: 1024 * 1024 },
  { id: 'custom', label: 'Custom',    bytes: null },
];

const DIM_PRESETS: { id: DimPreset; label: string; max: number | null }[] = [
  { id: 'original', label: 'Original', max: null },
  { id: '800',      label: '800 px',  max: 800  },
  { id: '1200',     label: '1200 px', max: 1200 },
  { id: '1920',     label: '1920 px', max: 1920 },
  { id: 'custom',   label: 'Custom',  max: null },
];

/** Map a maxSizeBytes value back to its named preset (or 'custom' / 'none'). */
function sizePresetFromBytes(bytes: number | null): SizePreset {
  if (bytes === null) return 'none';
  const match = SIZE_PRESETS.find((p) => p.id !== 'none' && p.id !== 'custom' && p.bytes === bytes);
  return match ? match.id : 'custom';
}

/** Map maxWidth back to its named dimension preset (or 'custom' / 'original'). */
function dimPresetFromWidth(maxWidth: number | null, maxHeight: number | null): DimPreset {
  if (maxWidth === null && maxHeight === null) return 'original';
  const match = DIM_PRESETS.find(
    (p) => p.id !== 'original' && p.id !== 'custom' && p.max === maxWidth && maxHeight === null
  );
  return match ? match.id : 'custom';
}

interface Props {
  config: ResizeCompressConfig;
  onChange: (cfg: ResizeCompressConfig) => void;
  estimatedSize?: string;
  locked: boolean;
  onLockChange: (locked: boolean, cfg: ResizeCompressConfig | null) => void;
}

export function ResizeCompressPanel({ config, onChange, estimatedSize, locked, onLockChange }: Props) {
  // Derive the highlighted preset button from the incoming config so that
  // when the parent switches images (or applies a locked config) the UI
  // always reflects the active values instead of holding onto stale state.
  const [sizePreset, setSizePreset] = useState<SizePreset>(() => sizePresetFromBytes(config.maxSizeBytes));
  const [dimPreset,  setDimPreset]  = useState<DimPreset>(() => dimPresetFromWidth(config.maxWidth, config.maxHeight));
  const [customKb,   setCustomKb]   = useState(() =>
    sizePresetFromBytes(config.maxSizeBytes) === 'custom' && config.maxSizeBytes !== null
      ? String(Math.round(config.maxSizeBytes / 1024))
      : ''
  );
  const [customW,    setCustomW]    = useState(config.maxWidth  ? String(config.maxWidth)  : '');
  const [customH,    setCustomH]    = useState(config.maxHeight ? String(config.maxHeight) : '');

  // Sync local preset display whenever the config prop changes from outside
  // (e.g. image switch with a locked resize config).
  useEffect(() => {
    const sp = sizePresetFromBytes(config.maxSizeBytes);
    setSizePreset(sp);
    if (sp === 'custom' && config.maxSizeBytes !== null) {
      setCustomKb(String(Math.round(config.maxSizeBytes / 1024)));
    } else if (sp !== 'custom') {
      setCustomKb('');
    }

    const dp = dimPresetFromWidth(config.maxWidth, config.maxHeight);
    setDimPreset(dp);
    // Always sync the custom input fields to match config values.
    // This covers both custom (where inputs are shown) and named presets
    // (where they are hidden but kept up-to-date for when custom is selected).
    setCustomW(config.maxWidth  ? String(config.maxWidth)  : '');
    setCustomH(config.maxHeight ? String(config.maxHeight) : '');
  // We intentionally depend on the individual config fields so that the
  // effect only fires when the actual values change, not on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.maxSizeBytes, config.maxWidth, config.maxHeight]);

  const emit = (partial: Partial<ResizeCompressConfig>) => {
    const next = { ...config, ...partial };
    onChange(next);
    if (locked) onLockChange(true, next);
  };

  const handleSizePreset = (p: typeof SIZE_PRESETS[number]) => {
    setSizePreset(p.id);
    if (p.id !== 'custom') emit({ maxSizeBytes: p.bytes });
  };

  const handleCustomKb = (val: string) => {
    setCustomKb(val);
    const n = Number(val);
    emit({ maxSizeBytes: n > 0 ? n * 1024 : null });
  };

  const handleDimPreset = (p: typeof DIM_PRESETS[number]) => {
    setDimPreset(p.id);
    if (p.id === 'original') { setCustomW(''); setCustomH(''); emit({ maxWidth: null, maxHeight: null }); }
    else if (p.id !== 'custom') { setCustomW(String(p.max)); setCustomH(''); emit({ maxWidth: p.max, maxHeight: null }); }
  };

  const handleCustomW = (val: string) => { setCustomW(val); const n = Number(val); emit({ maxWidth:  n > 0 ? n : null }); };
  const handleCustomH = (val: string) => { setCustomH(val); const n = Number(val); emit({ maxHeight: n > 0 ? n : null }); };

  const handleLockToggle = () => {
    const nowLocked = !locked;
    onLockChange(nowLocked, nowLocked ? config : null);
  };

  return (
    <div className="rc-panel">
      {/* Lock header */}
      <div className="rc-lock-row">
        <span className="rc-lock-label">Resize &amp; Compress</span>
        <button
          className={`rc-lock-btn ${locked ? 'locked' : ''}`}
          onClick={handleLockToggle}
          title={locked ? 'Resize settings locked across images — click to unlock' : 'Click to lock these settings for all images'}
        >
          {locked ? <Lock size={12} /> : <Unlock size={12} />}
          {locked ? 'Locked' : 'Unlocked'}
        </button>
      </div>

      {/* Dimensions */}
      <div className="rc-section">
        <span className="rc-section-title">Resize Dimensions</span>
        <div className="rc-presets">
          {DIM_PRESETS.map((p) => (
            <button key={p.id} className={`rc-preset-btn ${dimPreset === p.id ? 'active' : ''}`}
              onClick={() => handleDimPreset(p)}>{p.label}</button>
          ))}
        </div>
        {dimPreset === 'custom' && (
          <div className="rc-dim-inputs">
            <div className="rc-dim-field">
              <label className="rc-dim-label">Width</label>
              <div className="rc-dim-input-wrap">
                <input type="number" className="rc-dim-input" min={1} placeholder="e.g. 1200"
                  value={customW} onChange={(e) => handleCustomW(e.target.value)} />
                <span className="rc-dim-unit">px</span>
              </div>
            </div>
            <div className="rc-dim-field">
              <label className="rc-dim-label">Height</label>
              <div className="rc-dim-input-wrap">
                <input type="number" className="rc-dim-input" min={1} placeholder="e.g. 900"
                  value={customH} onChange={(e) => handleCustomH(e.target.value)} />
                <span className="rc-dim-unit">px</span>
              </div>
            </div>
          </div>
        )}
        {(config.maxWidth || config.maxHeight) && (
          <div className="rc-current-constraint">
            Max: {config.maxWidth ?? '—'} × {config.maxHeight ?? '—'} px
          </div>
        )}
        <label className="rc-checkbox-row">
          <input type="checkbox" className="rc-checkbox" checked={config.maintainAspectRatio}
            onChange={(e) => emit({ maintainAspectRatio: e.target.checked })} />
          <span className="rc-checkbox-label">Maintain aspect ratio</span>
        </label>
      </div>

      {/* File size */}
      <div className="rc-section">
        <span className="rc-section-title">Max File Size</span>
        <div className="rc-presets">
          {SIZE_PRESETS.map((p) => (
            <button key={p.id} className={`rc-preset-btn ${sizePreset === p.id ? 'active' : ''}`}
              onClick={() => handleSizePreset(p)}>{p.label}</button>
          ))}
        </div>
        {sizePreset === 'custom' && (
          <div className="rc-dim-inputs">
            <div className="rc-dim-field">
              <label className="rc-dim-label">Maximum</label>
              <div className="rc-dim-input-wrap">
                <input type="number" className="rc-dim-input" min={1} placeholder="e.g. 300"
                  value={customKb} onChange={(e) => handleCustomKb(e.target.value)} />
                <span className="rc-dim-unit">KB</span>
              </div>
            </div>
          </div>
        )}
      </div>

     {estimatedSize && (
        <div className="rc-estimate">
          <span className="rc-estimate-label">Est. output size</span>
          <span className="rc-estimate-value">{estimatedSize}</span>
        </div>
      )}
    </div>
  );
}
