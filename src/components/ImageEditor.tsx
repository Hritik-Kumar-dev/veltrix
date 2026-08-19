import { useRef, useState, useCallback, useEffect } from 'react';
import Cropper from 'react-cropper';
import type { ReactCropperElement } from 'react-cropper';
import {
  RotateCcw, RotateCw, Save, SkipForward, ZoomIn, ZoomOut,
  ChevronDown, ChevronUp, Crop, PenTool,
} from 'lucide-react';
import 'cropperjs/dist/cropper.css';
import type { ImageItem, CropData, ResizeCompressConfig, EditorGlobals } from '../types';
import { DEFAULT_RESIZE_CONFIG } from '../types';
import { AspectRatioSelector } from './AspectRatioSelector';
import { ResizeCompressPanel } from './ResizeCompressPanel';
import { PerspectiveCropOverlay } from './PerspectiveCropOverlay';
import type { PerspectiveCropHandle } from './PerspectiveCropOverlay';
import { resizeAndCompress, estimateSizeLabel } from '../resizeCompress';

type CropMode = 'standard' | 'perspective';

interface Props {
  image: ImageItem;
  hasNext: boolean;
  editorGlobals: EditorGlobals;
  onSave: (id: string, cropData: CropData, processedDataUrl: string) => void;
  onNext: () => void;
  onSaveAndNext: (id: string, cropData: CropData, processedDataUrl: string) => void;
  onResizeConfigChange: (id: string, cfg: ResizeCompressConfig) => void;
  onGlobalsChange: (g: Partial<EditorGlobals>) => void;
}

export function ImageEditor({
  image,
  hasNext,
  editorGlobals,
  onSave,
  onNext,
  onSaveAndNext,
  onResizeConfigChange,
  onGlobalsChange,
}: Props) {
  const cropperRef   = useRef<ReactCropperElement>(null);
  const perspRef     = useRef<PerspectiveCropHandle>(null);

  const [cropMode, setCropMode]     = useState<CropMode>('standard');
  const [rotation, setRotation]     = useState(image.cropData?.rotate ?? 0);
  const [isSaving, setIsSaving]     = useState(false);
  const [resizePanelOpen, setResizePanelOpen] = useState(false);
  const [resizeConfig, setResizeConfigState]  = useState<ResizeCompressConfig>(
    image.resizeConfig ?? DEFAULT_RESIZE_CONFIG
  );
  const [estimatedSize, setEstimatedSize] = useState('');
  const [originalRatio, setOriginalRatio] = useState(1);

  // ── Sync per-image state on image switch ──────────────────────────
  useEffect(() => {
    setRotation(image.cropData?.rotate ?? 0);
    // Apply locked resize config if set
    const effectiveResize = editorGlobals.lockedResizeConfig ?? image.resizeConfig ?? DEFAULT_RESIZE_CONFIG;
    setResizeConfigState(effectiveResize);
    setEstimatedSize('');
    setCropMode('standard');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image.id]);

  // ── Derived: forced ratio for AspectRatioSelector ─────────────────
  const forcedRatio = editorGlobals.lockedAspectRatio !== null
    ? editorGlobals.lockedAspectRatio
    : undefined;

  // ── Resize config changes ─────────────────────────────────────────
  const handleResizeConfigChange = useCallback((cfg: ResizeCompressConfig) => {
    setResizeConfigState(cfg);
    onResizeConfigChange(image.id, cfg);
    setEstimatedSize('');
  }, [image.id, onResizeConfigChange]);

  // ── Rotation helpers ──────────────────────────────────────────────
  const applyRotation = useCallback((deg: number) => {
    cropperRef.current?.cropper.rotateTo(deg);
  }, []);

  const handleRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setRotation(val);
    applyRotation(val);
  };

  const handleRotateLeft  = () => { const n = rotation - 90; setRotation(n); applyRotation(n); };
  const handleRotateRight = () => { const n = rotation + 90; setRotation(n); applyRotation(n); };
  const handleZoomIn      = () => cropperRef.current?.cropper.zoom(0.1);
  const handleZoomOut     = () => cropperRef.current?.cropper.zoom(-0.1);
  const handleResetCrop   = () => { cropperRef.current?.cropper.reset(); setRotation(0); };

  // ── Aspect ratio change ───────────────────────────────────────────
  const handleRatioChange = useCallback((ratio: number | null) => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    cropper.setAspectRatio(ratio === null ? NaN : ratio);
  }, []);

  // ── Core pipeline ─────────────────────────────────────────────────
  const getCroppedDataUrl = useCallback((): string | null => {
    try {
      let sourceCanvas: HTMLCanvasElement;

      if (cropMode === 'perspective') {
        const pc = perspRef.current?.getCroppedCanvas();
        if (!pc) return null;
        sourceCanvas = pc;
      } else {
        const cropper = cropperRef.current?.cropper;
        if (!cropper) return null;
        sourceCanvas = cropper.getCroppedCanvas({ maxWidth: 4096, maxHeight: 4096 });
      }

      const hasConstraints =
        resizeConfig.maxWidth !== null ||
        resizeConfig.maxHeight !== null ||
        resizeConfig.maxSizeBytes !== null;

      return hasConstraints
        ? resizeAndCompress(sourceCanvas, resizeConfig)
        : sourceCanvas.toDataURL('image/jpeg', 0.92);
    } catch { return null; }
  }, [cropMode, resizeConfig]);

  const buildCropData = useCallback((): CropData => {
    const cropper = cropperRef.current?.cropper;
    const cd = cropper?.getCropBoxData();
    const id = cropper?.getImageData();
    return {
      x: cd?.left ?? 0, y: cd?.top ?? 0,
      width: cd?.width ?? 0, height: cd?.height ?? 0,
      rotate: rotation,
      scaleX: id?.scaleX ?? 1, scaleY: id?.scaleY ?? 1,
    };
  }, [rotation]);

  // ── Save actions ──────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    const dataUrl = getCroppedDataUrl();
    if (!dataUrl) { setIsSaving(false); return; }
    setEstimatedSize(estimateSizeLabel(dataUrl));
    onSave(image.id, buildCropData(), dataUrl);
    setIsSaving(false);
  }, [image.id, getCroppedDataUrl, buildCropData, onSave]);

  const handleSaveAndNext = useCallback(async () => {
    setIsSaving(true);
    const dataUrl = getCroppedDataUrl();
    if (!dataUrl) { setIsSaving(false); return; }
    onSaveAndNext(image.id, buildCropData(), dataUrl);
    setIsSaving(false);
  }, [image.id, getCroppedDataUrl, buildCropData, onSaveAndNext]);

  // ── Keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.ctrlKey ? -90 : -1;
        setRotation((p) => { const n = p + step; applyRotation(n); return n; });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.ctrlKey ? 90 : 1;
        setRotation((p) => { const n = p + step; applyRotation(n); return n; });
      } else if (e.key === ' ') {
        e.preventDefault();
        if (hasNext) handleSaveAndNext(); else handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [applyRotation, hasNext, handleSave, handleSaveAndNext]);

  // ── Restore saved crop on CropperJS ready ────────────────────────
  const onCropperReady = useCallback(() => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    const imgData = cropper.getImageData();
    if (imgData.naturalWidth && imgData.naturalHeight) {
      setOriginalRatio(imgData.naturalWidth / imgData.naturalHeight);
    }
    // Apply locked aspect ratio if set
    if (editorGlobals.lockedAspectRatio !== null) {
      const r = editorGlobals.lockedAspectRatio;
      cropper.setAspectRatio(r === 'free' ? NaN : (r as number));
    }
    if (!image.cropData) return;
    const cd = image.cropData;
    cropper.rotateTo(cd.rotate);
    setTimeout(() => {
      cropper.setCropBoxData({ left: cd.x, top: cd.y, width: cd.width, height: cd.height });
    }, 50);
  }, [image.cropData, editorGlobals.lockedAspectRatio]);

  const hasResizeActive =
    resizeConfig.maxWidth !== null ||
    resizeConfig.maxHeight !== null ||
    resizeConfig.maxSizeBytes !== null;

  const ratioLocked   = editorGlobals.lockedAspectRatio !== null;
  const resizeLocked  = editorGlobals.lockedResizeConfig !== null;

  return (
    <div className="editor-container">
      <div className="editor-header">
        <span className="editor-filename">{image.name}</span>
        <span className={`editor-status-badge ${image.status}`}>{image.status}</span>
      </div>

      {/* ── Crop mode toggle ── */}
      <div className="crop-mode-bar">
        <button
          className={`crop-mode-btn ${cropMode === 'standard' ? 'active' : ''}`}
          onClick={() => setCropMode('standard')}
          title="Standard rectangular crop"
        >
          <Crop size={15} /> Standard
        </button>
        <button
          className={`crop-mode-btn ${cropMode === 'perspective' ? 'active' : ''}`}
          onClick={() => setCropMode('perspective')}
          title="Four-corner perspective crop"
        >
          <PenTool size={15} /> Perspective
        </button>
      </div>

      {/* ── Canvas area ── */}
      <div className="editor-canvas-wrap">
        {/* Standard CropperJS — hidden (not unmounted) when perspective active so state is preserved */}
        <div style={{ display: cropMode === 'standard' ? 'flex' : 'none', width: '100%', height: '100%' }}>
          <Cropper
            ref={cropperRef}
            src={image.originalDataUrl}
            style={{ height: '100%', width: '100%' }}
            initialAspectRatio={NaN}
            aspectRatio={NaN}
            guides={true}
            rotatable={true}
            scalable={true}
            zoomable={true}
            viewMode={1}
            autoCropArea={1}
            checkOrientation={false}
            ready={onCropperReady}
            background={false}
            responsive={true}
            restore={false}
          />
        </div>

        {/* Perspective overlay */}
        {cropMode === 'perspective' && (
          <PerspectiveCropOverlay
            ref={perspRef}
            src={image.originalDataUrl}
          />
        )}
      </div>

      {/* ── Controls ── */}
      <div className="editor-controls">
        {/* Aspect ratio (standard mode only) */}
        {cropMode === 'standard' && (
          <div className="control-row control-row--aspect">
            <label className="control-label">Ratio</label>
            <AspectRatioSelector
              onRatioChange={handleRatioChange}
              originalRatio={originalRatio}
              forcedRatio={forcedRatio}
              locked={ratioLocked}
              onLockChange={(locked, ratio) =>
                onGlobalsChange({ lockedAspectRatio: locked ? ratio : null })
              }
            />
          </div>
        )}

        {/* Rotation */}
        <div className="control-row">
          <label className="control-label">Rotate</label>
          <div className="rotate-controls">
            <button className="icon-btn" onClick={handleRotateLeft}  title="Rotate -90° (Ctrl+←)"><RotateCcw size={16} /></button>
            <input type="range" min={-180} max={180} step={1} value={rotation}
              onChange={handleRotationChange} className="rotate-slider" />
            <button className="icon-btn" onClick={handleRotateRight} title="Rotate +90° (Ctrl+→)"><RotateCw  size={16} /></button>
            <input type="number" min={-180} max={180} value={rotation}
              onChange={handleRotationChange} className="rotate-number" />
            <span className="rotate-unit">°</span>
          </div>
        </div>

        {/* Zoom / Reset (standard mode only) */}
        {cropMode === 'standard' && (
          <div className="control-row">
            <label className="control-label">Zoom</label>
            <div className="zoom-controls">
              <button className="icon-btn" onClick={handleZoomOut} title="Zoom out"><ZoomOut size={16} /></button>
              <button className="icon-btn" onClick={handleZoomIn}  title="Zoom in"><ZoomIn  size={16} /></button>
              <button className="icon-btn secondary" onClick={handleResetCrop} title="Reset crop &amp; rotation">
                <RotateCcw size={14} /><span className="btn-label">Reset</span>
              </button>
            </div>
          </div>
        )}

        {/* Resize & Compress */}
        <div className="control-row">
          <button
            className={`resize-toggle-btn ${resizePanelOpen ? 'open' : ''} ${hasResizeActive ? 'has-active' : ''}`}
            onClick={() => setResizePanelOpen((o) => !o)}
          >
            {resizePanelOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Resize &amp; Compress
            {hasResizeActive && <span className="resize-active-dot" />}
          </button>
        </div>

        {resizePanelOpen && (
          <ResizeCompressPanel
            config={resizeConfig}
            onChange={handleResizeConfigChange}
            estimatedSize={estimatedSize}
            locked={resizeLocked}
            onLockChange={(locked, cfg) =>
              onGlobalsChange({ lockedResizeConfig: locked ? cfg : null })
            }
          />
        )}

        {/* Actions */}
        <div className="editor-actions">
          <button className="action-btn primary" onClick={handleSave} disabled={isSaving} title="Save (Space)">
            <Save size={16} /> Save
          </button>
          {hasNext && (
            <button className="action-btn success" onClick={handleSaveAndNext} disabled={isSaving}>
              <Save size={16} /> Save &amp; Next <SkipForward size={16} /><kbd className="kbd">Space</kbd>
            </button>
          )}
          {hasNext && (
            <button className="action-btn secondary" onClick={onNext} disabled={isSaving}>
              <SkipForward size={16} /> Skip
            </button>
          )}
        </div>

        {/* Keyboard hints */}
        <div className="kbd-hints">
          <span className="kbd-hint"><kbd className="kbd">←</kbd><kbd className="kbd">→</kbd> Rotate 1°</span>
          <span className="kbd-hint"><kbd className="kbd">Ctrl</kbd><kbd className="kbd">←</kbd><kbd className="kbd">→</kbd> Rotate 90°</span>
          <span className="kbd-hint"><kbd className="kbd">Space</kbd> Save &amp; Next</span>
        </div>
      </div>
    </div>
  );
}
