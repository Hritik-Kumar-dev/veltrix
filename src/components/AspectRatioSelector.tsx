import { useState } from 'react';

export type AspectRatioPreset =
  | 'free'
  | 'original'
  | '7:9'
  | '1:1'
  | '4:3'
  | '3:2'
  | '16:9'
  | 'custom';

interface Preset {
  id: AspectRatioPreset;
  label: string;
  sub?: string;
  /** null = free (NaN), 'original' = signal to caller, numeric = w/h */
  ratio: number | null | 'original';
}

const PRESETS: Preset[] = [
  { id: 'free',     label: 'Free',     ratio: null },
  { id: 'original', label: 'Original', ratio: 'original' },
  { id: '7:9',      label: '7:9',      sub: 'Passport',  ratio: 7 / 9 },
  { id: '1:1',      label: '1:1',      sub: 'Square',    ratio: 1 },
  { id: '4:3',      label: '4:3',      ratio: 4 / 3 },
  { id: '3:2',      label: '3:2',      ratio: 3 / 2 },
  { id: '16:9',     label: '16:9',     ratio: 16 / 9 },
  { id: 'custom',   label: 'Custom',   ratio: null },
];

interface Props {
  /** Called whenever the aspect ratio should be applied to the cropper */
  onRatioChange: (ratio: number | null) => void;
  /** The natural (original) w/h ratio of the source image */
  originalRatio: number;
}

export function AspectRatioSelector({ onRatioChange, originalRatio }: Props) {
  const [active, setActive] = useState<AspectRatioPreset>('free');
  const [customW, setCustomW] = useState<string>('');
  const [customH, setCustomH] = useState<string>('');

  const apply = (preset: Preset, w?: number, h?: number) => {
    if (preset.ratio === null && preset.id !== 'custom') {
      onRatioChange(null); // free
    } else if (preset.ratio === 'original') {
      onRatioChange(originalRatio);
    } else if (preset.id === 'custom') {
      const cw = w ?? Number(customW);
      const ch = h ?? Number(customH);
      if (cw > 0 && ch > 0) {
        onRatioChange(cw / ch);
      } else {
        onRatioChange(null); // treat invalid custom as free
      }
    } else {
      onRatioChange(preset.ratio as number);
    }
  };

  const handlePresetClick = (preset: Preset) => {
    setActive(preset.id);
    apply(preset);
  };

  const handleCustomChange = (field: 'w' | 'h', val: string) => {
    const cw = field === 'w' ? val : customW;
    const ch = field === 'h' ? val : customH;
    if (field === 'w') setCustomW(val);
    else setCustomH(val);
    const nw = Number(cw);
    const nh = Number(ch);
    if (nw > 0 && nh > 0) {
      onRatioChange(nw / nh);
    }
  };

  return (
    <div className="ar-selector">
      <div className="ar-presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            className={`ar-btn ${active === preset.id ? 'active' : ''}`}
            onClick={() => handlePresetClick(preset)}
            title={preset.sub}
          >
            <span className="ar-btn-label">{preset.label}</span>
            {preset.sub && <span className="ar-btn-sub">{preset.sub}</span>}
          </button>
        ))}
      </div>

      {active === 'custom' && (
        <div className="ar-custom-inputs">
          <input
            type="number"
            className="ar-custom-input"
            min={1}
            placeholder="W"
            value={customW}
            onChange={(e) => handleCustomChange('w', e.target.value)}
          />
          <span className="ar-custom-sep">×</span>
          <input
            type="number"
            className="ar-custom-input"
            min={1}
            placeholder="H"
            value={customH}
            onChange={(e) => handleCustomChange('h', e.target.value)}
          />
          <span className="ar-custom-unit">px</span>
        </div>
      )}
    </div>
  );
}
