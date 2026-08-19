import { useState, useEffect } from 'react';
import { Lock, Unlock } from 'lucide-react';

export type AspectRatioPreset =
  | 'free' | 'original' | '7:9' | '1:1' | '4:3' | '3:2' | '16:9' | 'custom';

interface Preset {
  id: AspectRatioPreset;
  label: string;
  sub?: string;
  ratio: number | null | 'original';
}

const PRESETS: Preset[] = [
  { id: 'free',     label: 'Free',    ratio: null },
  { id: 'original', label: 'Orig',    ratio: 'original' },
  { id: '7:9',      label: '7:9',     sub: 'Passport', ratio: 7 / 9 },
  { id: '1:1',      label: '1:1',     sub: 'Square',   ratio: 1 },
  { id: '4:3',      label: '4:3',     ratio: 4 / 3 },
  { id: '3:2',      label: '3:2',     ratio: 3 / 2 },
  { id: '16:9',     label: '16:9',    ratio: 16 / 9 },
  { id: 'custom',   label: 'Custom',  ratio: null },
];

interface Props {
  onRatioChange: (ratio: number | null) => void;
  originalRatio: number;
  /** If set, forces this preset active (used when a lock is applied on image switch) */
  forcedRatio?: number | 'free' | null;
  /** Whether this setting is currently locked across images */
  locked: boolean;
  onLockChange: (locked: boolean, ratio: number | 'free' | null) => void;
}

function ratioToPreset(ratio: number | 'free' | null): AspectRatioPreset {
  if (ratio === null || ratio === 'free') return 'free';
  if (Math.abs(ratio - 7 / 9)  < 0.001) return '7:9';
  if (Math.abs(ratio - 1)      < 0.001) return '1:1';
  if (Math.abs(ratio - 4 / 3)  < 0.001) return '4:3';
  if (Math.abs(ratio - 3 / 2)  < 0.001) return '3:2';
  if (Math.abs(ratio - 16 / 9) < 0.001) return '16:9';
  return 'custom';
}

export function AspectRatioSelector({ onRatioChange, originalRatio, forcedRatio, locked, onLockChange }: Props) {
  const [active, setActive] = useState<AspectRatioPreset>('free');
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');
  // Track the current resolved numeric ratio so we can pass it to the lock
  const [currentRatio, setCurrentRatio] = useState<number | 'free' | null>(null);

  // Apply forced ratio when image changes and lock is on
  useEffect(() => {
    if (forcedRatio === undefined) return;
    const preset = ratioToPreset(forcedRatio);
    setActive(preset);
    if (forcedRatio === null || forcedRatio === 'free') {
      setCurrentRatio('free');
      onRatioChange(null);
    } else {
      setCurrentRatio(forcedRatio);
      onRatioChange(forcedRatio as number);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedRatio]);

  const resolveRatio = (preset: Preset, w?: number, h?: number): number | 'free' | null => {
    if (preset.ratio === null && preset.id !== 'custom') return 'free';
    if (preset.ratio === 'original') return originalRatio;
    if (preset.id === 'custom') {
      const cw = w ?? Number(customW);
      const ch = h ?? Number(customH);
      return cw > 0 && ch > 0 ? cw / ch : 'free';
    }
    return preset.ratio as number;
  };

  const applyPreset = (preset: Preset, w?: number, h?: number) => {
    const r = resolveRatio(preset, w, h);
    setCurrentRatio(r);
    setActive(preset.id);
    onRatioChange(r === 'free' || r === null ? null : (r as number));
    if (locked) {
      onLockChange(true, r);
    }
  };

  const handleCustomChange = (field: 'w' | 'h', val: string) => {
    const cw = field === 'w' ? val : customW;
    const ch = field === 'h' ? val : customH;
    if (field === 'w') setCustomW(val); else setCustomH(val);
    const nw = Number(cw); const nh = Number(ch);
    if (nw > 0 && nh > 0) {
      const r = nw / nh;
      setCurrentRatio(r);
      onRatioChange(r);
      if (locked) onLockChange(true, r);
    }
  };

  const handleLockToggle = () => {
    const nowLocked = !locked;
    onLockChange(nowLocked, nowLocked ? currentRatio : null);
  };

  return (
    <div className="ar-selector">
      <div className="ar-presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            className={`ar-btn ${active === preset.id ? 'active' : ''}`}
            onClick={() => applyPreset(preset)}
            title={preset.sub}
          >
            <span className="ar-btn-label">{preset.label}</span>
            {preset.sub && <span className="ar-btn-sub">{preset.sub}</span>}
          </button>
        ))}
        <button
          className={`ar-lock-btn ${locked ? 'locked' : ''}`}
          onClick={handleLockToggle}
          title={locked ? 'Aspect ratio locked across images — click to unlock' : 'Click to lock this ratio for all images'}
        >
          {locked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
      </div>

      {active === 'custom' && (
        <div className="ar-custom-inputs">
          <input type="number" className="ar-custom-input" min={1} placeholder="W"
            value={customW} onChange={(e) => handleCustomChange('w', e.target.value)} />
          <span className="ar-custom-sep">×</span>
          <input type="number" className="ar-custom-input" min={1} placeholder="H"
            value={customH} onChange={(e) => handleCustomChange('h', e.target.value)} />
          <span className="ar-custom-unit">px</span>
        </div>
      )}
    </div>
  );
}
