import { useState } from 'react';
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

interface Props {
  config: ResizeCompressConfig;
  onChange: (cfg: ResizeCompressConfig) => void;
  estimatedSize?: string;
  locked: boolean;
  onLockChange: (locked: boolean, cfg: ResizeCompressConfig | null) => void;
}

export function ResizeCompressPanel({ config, onChange, estimatedSize, locked, onLockChange }: Props) {
  const [sizePreset, setSizePreset] = useState<SizePreset>('none');
  const [dimPreset,  setDimPreset]  = useState<DimPreset>('original');
  const [customKb,   setCustomKb]   = useState('');
  const [customW,    setCustomW]    = useState(config.maxWidth  ? String(config.maxWidth)  : '');
  const [customH,    setCustomH]    = useState(config.maxHeight ? String(config.maxHeight) : '');

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
