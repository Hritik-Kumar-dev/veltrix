import { useRef, useState, useCallback, useEffect } from 'react';
import Cropper from 'react-cropper';
import type { ReactCropperElement } from 'react-cropper';
import { RotateCcw, RotateCw, Save, SkipForward, ZoomIn, ZoomOut, ChevronDown, ChevronUp } from 'lucide-react';
import 'cropperjs/dist/cropper.css';
import type { ImageItem, CropData, ResizeCompressConfig } from '../types';
import { DEFAULT_RESIZE_CONFIG } from '../types';
import { AspectRatioSelector } from './AspectRatioSelector';
import { ResizeCompressPanel } from './ResizeCompressPanel';
import { resizeAndCompress, estimateSizeLabel } from '../resizeCompress';

interface Props {
  image: ImageItem;
  hasNext: boolean;
  onSave: (id: string, cropData: CropData, processedDataUrl: string) => void;
  onNext: () => void;
  onSaveAndNext: (id: string, cropData: CropData, processedDataUrl: string) => void;
  onResizeConfigChange: (id: string, cfg: ResizeCompressConfig) => void;
}

export function ImageEditor({
  image,
  hasNext,
  onSave,
  onNext,
  onSaveAndNext,
  onResizeConfigChange,
}: Props) {
  const cropperRef = useRef<ReactCropperElement>(null);
  const [rotation, setRotation] = useState<number>(image.cropData?.rotate ?? 0);
  const [isSaving, setIsSaving] = useState(false);
  const [resizePanelOpen, setResizePanelOpen] = useState(false);
  const [resizeConfig, setResizeConfig] = useState<ResizeCompressConfig>(
    image.resizeConfig ?? DEFAULT_RESIZE_CONFIG
  );
  // Live size estimate shown in the resize panel
  const [estimatedSize, setEstimatedSize] = useState<string>('');
  // Track the natural image ratio for the "Original" aspect preset
  const [originalRatio, setOriginalRatio] = useState<number>(1);

  // ── Sync state when image changes ────────────────────────────────
  useEffect(() => {
    setRotation(image.cropData?.rotate ?? 0);
    setResizeConfig(image.resizeConfig ?? DEFAULT_RESIZE_CONFIG);
    setEstimatedSize('');
  }, [image.id, image.cropData?.rotate, image.resizeConfig]);

  // ── Propagate resize config changes up to the store ──────────────
  const handleResizeConfigChange = useCallback(
    (cfg: ResizeCompressConfig) => {
      setResizeConfig(cfg);
      onResizeConfigChange(image.id, cfg);
      // Clear stale estimate when settings change
      setEstimatedSize('');
    },
    [image.id, onResizeConfigChange]
  );

  // ── Rotation helpers ─────────────────────────────────────────────
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

  // ── Zoom / Reset ─────────────────────────────────────────────────
  const handleZoomIn    = () => cropperRef.current?.cropper.zoom(0.1);
  const handleZoomOut   = () => cropperRef.current?.cropper.zoom(-0.1);
  const handleResetCrop = () => { cropperRef.current?.cropper.reset(); setRotation(0); };

  // ── Aspect ratio ─────────────────────────────────────────────────
  const handleRatioChange = useCallback((ratio: number | null) => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    // CropperJS: NaN = free, numeric = locked
    cropper.setAspectRatio(ratio === null ? NaN : ratio);
  }, []);

  // ── Core pipeline: crop → resize → compress → dataUrl ────────────
  const getCroppedDataUrl = useCallback((): string | null => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return null;
    try {
      // Step 1: get the crop+rotation canvas at full resolution
      const croppedCanvas = cropper.getCroppedCanvas({ maxWidth: 4096, maxHeight: 4096 });

      // Step 2: apply resize + compression (no-ops when config is all-null)
      const hasConstraints =
        resizeConfig.maxWidth !== null ||
        resizeConfig.maxHeight !== null ||
        resizeConfig.maxSizeBytes !== null;

      if (!hasConstraints) {
        return croppedCanvas.toDataURL('image/jpeg', 0.92);
      }
      return resizeAndCompress(croppedCanvas, resizeConfig);
    } catch {
      return null;
    }
  }, [resizeConfig]);

  const buildCropData = useCallback((): CropData => {
    const cropper = cropperRef.current?.cropper;
    const cd = cropper?.getCropBoxData();
    const id = cropper?.getImageData();
    return {
      x: cd?.left ?? 0,
      y: cd?.top ?? 0,
      width: cd?.width ?? 0,
      height: cd?.height ?? 0,
      rotate: rotation,
      scaleX: id?.scaleX ?? 1,
      scaleY: id?.scaleY ?? 1,
    };
  }, [rotation]);

  // ── Save actions ─────────────────────────────────────────────────
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

  // ── Keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.ctrlKey ? -90 : -1;
        setRotation((prev) => { const n = prev + step; applyRotation(n); return n; });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.ctrlKey ? 90 : 1;
        setRotation((prev) => { const n = prev + step; applyRotation(n); return n; });
      } else if (e.key === ' ') {
        e.preventDefault();
        if (hasNext) handleSaveAndNext(); else handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [applyRotation, hasNext, handleSave, handleSaveAndNext]);

  // ── Restore saved crop state after cropper is ready ──────────────
  const onCropperReady = useCallback(() => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;

    // Record the natural image ratio for the "Original" aspect preset
    const imgData = cropper.getImageData();
    if (imgData.naturalWidth && imgData.naturalHeight) {
      setOriginalRatio(imgData.naturalWidth / imgData.naturalHeight);
    }

    if (!image.cropData) return;
    const cd = image.cropData;
    cropper.rotateTo(cd.rotate);
    setTimeout(() => {
      cropper.setCropBoxData({ left: cd.x, top: cd.y, width: cd.width, height: cd.height });
    }, 50);
  }, [image.cropData]);

  // ── Derived: does resize config have any active constraint? ──────
  const hasResizeActive =
    resizeConfig.maxWidth !== null ||
    resizeConfig.maxHeight !== null ||
    resizeConfig.maxSizeBytes !== null;

  return (
    <div className="editor-container">
      {/* Header */}
      <div className="editor-header">
        <span className="editor-filename">{image.name}</span>
        <span className={`editor-status-badge ${image.status}`}>{image.status}</span>
      </div>

      {/* Cropper canvas */}
      <div className="editor-canvas-wrap">
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

      {/* Controls */}
      <div className="editor-controls">

        {/* ── Aspect Ratio row ── */}
        <div className="control-row control-row--aspect">
          <label className="control-label">Ratio</label>
          <AspectRatioSelector
            onRatioChange={handleRatioChange}
            originalRatio={originalRatio}
          />
        </div>

        {/* ── Rotation row ── */}
        <div className="control-row">
          <label className="control-label">Rotate</label>
          <div className="rotate-controls">
            <button className="icon-btn" onClick={handleRotateLeft} title="Rotate -90° (Ctrl+←)">
              <RotateCcw size={16} />
            </button>
            <input
              type="range"
              min={-180} max={180} step={1}
              value={rotation}
              onChange={handleRotationChange}
              className="rotate-slider"
            />
            <button className="icon-btn" onClick={handleRotateRight} title="Rotate +90° (Ctrl+→)">
              <RotateCw size={16} />
            </button>
            <input
              type="number"
              min={-180} max={180}
              value={rotation}
              onChange={handleRotationChange}
              className="rotate-number"
            />
            <span className="rotate-unit">°</span>
          </div>
        </div>

        {/* ── Zoom / Reset row ── */}
        <div className="control-row">
          <label className="control-label">Zoom</label>
          <div className="zoom-controls">
            <button className="icon-btn" onClick={handleZoomOut} title="Zoom out"><ZoomOut size={16} /></button>
            <button className="icon-btn" onClick={handleZoomIn}  title="Zoom in"><ZoomIn  size={16} /></button>
            <button className="icon-btn secondary" onClick={handleResetCrop} title="Reset crop &amp; rotation">
              <RotateCcw size={14} />
              <span className="btn-label">Reset</span>
            </button>
          </div>
        </div>

        {/* ── Resize & Compress toggle ── */}
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
          />
        )}

        {/* ── Action buttons ── */}
        <div className="editor-actions">
          <button className="action-btn primary" onClick={handleSave} disabled={isSaving}
            title="Save (Space)">
            <Save size={16} /> Save
          </button>
          {hasNext && (
            <button className="action-btn success" onClick={handleSaveAndNext} disabled={isSaving}
              title="Save &amp; go to next image (Space)">
              <Save size={16} /> Save &amp; Next <SkipForward size={16} />
              <kbd className="kbd">Space</kbd>
            </button>
          )}
          {hasNext && (
            <button className="action-btn secondary" onClick={onNext} disabled={isSaving}>
              <SkipForward size={16} /> Skip
            </button>
          )}
        </div>

        {/* ── Keyboard hints ── */}
        <div className="kbd-hints">
          <span className="kbd-hint"><kbd className="kbd">←</kbd><kbd className="kbd">→</kbd> Rotate 1°</span>
          <span className="kbd-hint"><kbd className="kbd">Ctrl</kbd><kbd className="kbd">←</kbd><kbd className="kbd">→</kbd> Rotate 90°</span>
          <span className="kbd-hint"><kbd className="kbd">Space</kbd> Save &amp; Next</span>
        </div>
      </div>
    </div>
  );
}
