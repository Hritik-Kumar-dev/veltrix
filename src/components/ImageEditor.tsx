import { useRef, useState, useCallback, useEffect } from 'react';
import Cropper from 'react-cropper';
import type { ReactCropperElement } from 'react-cropper';
import {
  RotateCcw, RotateCw, Save, SkipForward, ZoomIn, ZoomOut,
  ChevronDown, ChevronUp, Crop, PenTool, Scan, Loader2, X,
} from 'lucide-react';
import 'cropperjs/dist/cropper.css';
import toast from 'react-hot-toast';
import type { ImageItem, CropData, ResizeCompressConfig, EditorGlobals } from '../types';
import { DEFAULT_RESIZE_CONFIG } from '../types';
import { AspectRatioSelector } from './AspectRatioSelector';
import { ResizeCompressPanel } from './ResizeCompressPanel';
import { PerspectiveCropOverlay } from './PerspectiveCropOverlay';
import type { PerspectiveCropHandle } from './PerspectiveCropOverlay';
import { resizeAndCompress, estimateSizeLabel } from '../resizeCompress';
import { detectFaces } from '../autoCrop/detectFaces';
import { estimatePhotoRegion } from '../autoCrop/estimatePhotoRegion';
import type { CropRegion } from '../autoCrop/estimatePhotoRegion';
import type { FaceBox } from '../autoCrop/detectFaces';

type CropMode = 'standard' | 'perspective';

/** Maximum dimension used when generating the sidebar preview thumbnail. */
const PREVIEW_MAX_PX = 320;

interface Props {
  image: ImageItem;
  hasNext: boolean;
  editorGlobals: EditorGlobals;
  onSave: (id: string, cropData: CropData, processedDataUrl: string) => void;
  onNext: () => void;
  onSaveAndNext: (id: string, cropData: CropData, processedDataUrl: string) => void;
  onResizeConfigChange: (id: string, cfg: ResizeCompressConfig) => void;
  onGlobalsChange: (g: Partial<EditorGlobals>) => void;
  /** Called with a small data-URL thumbnail whenever the editing state changes. */
  onPreviewChange?: (dataUrl: string | null) => void;
}

// ── Auto Crop state ───────────────────────────────────────────────────────────

interface AutoCropCandidate {
  faceBox:  FaceBox;
  region:   CropRegion;
}

type AutoCropStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'no-face' }
  | { kind: 'candidates'; list: AutoCropCandidate[] };

export function ImageEditor({
  image,
  hasNext,
  editorGlobals,
  onSave,
  onNext,
  onSaveAndNext,
  onResizeConfigChange,
  onGlobalsChange,
  onPreviewChange,
}: Props) {
  const cropperRef   = useRef<ReactCropperElement>(null);
  const perspRef     = useRef<PerspectiveCropHandle>(null);

  const [cropMode, setCropMode]     = useState<CropMode>('standard');
  const [rotation, setRotation]     = useState(image.cropData?.rotate ?? 0);
  const rotationRef = useRef<number>(image.cropData?.rotate ?? 0);
  const [isSaving, setIsSaving]     = useState(false);
  const [resizePanelOpen, setResizePanelOpen] = useState(false);
  const [resizeConfig, setResizeConfigState]  = useState<ResizeCompressConfig>(
    image.resizeConfig ?? DEFAULT_RESIZE_CONFIG
  );
  const [estimatedSize, setEstimatedSize] = useState('');
  const [originalRatio, setOriginalRatio] = useState(1);

  // ── Auto Crop state ───────────────────────────────────────────────
  const [autoCropStatus, setAutoCropStatus] = useState<AutoCropStatus>({ kind: 'idle' });

  // ── Debounced preview generation ─────────────────────────────────
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current !== null) clearTimeout(previewTimerRef.current);
    };
  }, []);

  const rotateCanvas = useCallback((src: HTMLCanvasElement, degrees: number): HTMLCanvasElement => {
    const rad  = (degrees * Math.PI) / 180;
    const sin  = Math.abs(Math.sin(rad));
    const cos  = Math.abs(Math.cos(rad));
    const outW = Math.round(src.width  * cos + src.height * sin);
    const outH = Math.round(src.width  * sin + src.height * cos);
    const out  = document.createElement('canvas');
    out.width  = outW;
    out.height = outH;
    const ctx  = out.getContext('2d')!;
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate(rad);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    return out;
  }, []);

  const schedulePreview = useCallback(() => {
    if (!onPreviewChange) return;
    if (previewTimerRef.current !== null) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      try {
        let sourceCanvas: HTMLCanvasElement | null = null;

        if (cropMode === 'perspective') {
          const pc = perspRef.current?.getCroppedCanvas() ?? null;
          if (pc) {
            sourceCanvas = rotationRef.current !== 0 ? rotateCanvas(pc, rotationRef.current) : pc;
          }
        } else {
          const cropper = cropperRef.current?.cropper;
          if (cropper) {
            sourceCanvas = cropper.getCroppedCanvas({ maxWidth: 4096, maxHeight: 4096 });
          }
        }

        if (!sourceCanvas) { onPreviewChange(null); return; }

        const scale = Math.min(1, PREVIEW_MAX_PX / Math.max(sourceCanvas.width, sourceCanvas.height));
        const tw = Math.max(1, Math.round(sourceCanvas.width  * scale));
        const th = Math.max(1, Math.round(sourceCanvas.height * scale));
        const thumb = document.createElement('canvas');
        thumb.width  = tw;
        thumb.height = th;
        thumb.getContext('2d')!.drawImage(sourceCanvas, 0, 0, tw, th);
        onPreviewChange(thumb.toDataURL('image/jpeg', 0.75));
      } catch {
        onPreviewChange(null);
      }
    }, 150);
  }, [cropMode, onPreviewChange, rotateCanvas]);

  // ── Sync per-image state on image switch ──────────────────────────
  useEffect(() => {
    const r = image.cropData?.rotate ?? 0;
    rotationRef.current = r;
    setRotation(r);
    const effectiveResize = editorGlobals.lockedResizeConfig ?? image.resizeConfig ?? DEFAULT_RESIZE_CONFIG;
    setResizeConfigState(effectiveResize);
    setEstimatedSize('');
    setCropMode('standard');
    setAutoCropStatus({ kind: 'idle' });
    if (onPreviewChange) {
      onPreviewChange(image.processedDataUrl ?? image.originalDataUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image.id]);

  const forcedRatio = editorGlobals.lockedAspectRatio !== null
    ? editorGlobals.lockedAspectRatio
    : undefined;

  const handleResizeConfigChange = useCallback((cfg: ResizeCompressConfig) => {
    setResizeConfigState(cfg);
    onResizeConfigChange(image.id, cfg);
    setEstimatedSize('');
  }, [image.id, onResizeConfigChange]);

  const applyRotation = useCallback((deg: number) => {
    if (cropperRef.current?.cropper) {
      cropperRef.current.cropper.rotateTo(deg);
    }
  }, []);

  const handleRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    rotationRef.current = val;
    setRotation(val);
    applyRotation(val);
    schedulePreview();
  };

  const handleRotateLeft  = () => { const n = rotation - 90; rotationRef.current = n; setRotation(n); applyRotation(n); schedulePreview(); };
  const handleRotateRight = () => { const n = rotation + 90; rotationRef.current = n; setRotation(n); applyRotation(n); schedulePreview(); };
  const handleZoomIn      = () => { cropperRef.current?.cropper.zoom(0.1);  schedulePreview(); };
  const handleZoomOut     = () => { cropperRef.current?.cropper.zoom(-0.1); schedulePreview(); };
  const handleResetCrop   = () => { cropperRef.current?.cropper.reset(); rotationRef.current = 0; setRotation(0); schedulePreview(); };

  const handleRatioChange = useCallback((ratio: number | null) => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    cropper.setAspectRatio(ratio === null ? NaN : ratio);
  }, []);

  // ── Auto Crop ─────────────────────────────────────────────────────
  //
  // Coordinate mapping: CropperJS crop-box coords live in the "canvas"
  // coordinate space (the rendered, scaled image within the cropper widget).
  //
  //   imageData    = cropper.getImageData()   — has naturalWidth/Height and displayed width/height
  //   canvasData   = cropper.getCanvasData()  — left/top offset of rendered canvas in container
  //
  //   displayScale = canvasData.width / imageData.naturalWidth
  //   cropBoxLeft  = canvasData.left + origPx.x * displayScale
  //   cropBoxTop   = canvasData.top  + origPx.y * displayScale
  //   cropBoxWidth = origPx.width  * displayScale
  //   cropBoxHeight= origPx.height * displayScale

  const applyCropRegion = useCallback((region: CropRegion) => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;

    const imageData  = cropper.getImageData();
    const canvasData = cropper.getCanvasData();
    const scale = canvasData.width / imageData.naturalWidth;

    cropper.setCropBoxData({
      left:   canvasData.left + region.x      * scale,
      top:    canvasData.top  + region.y      * scale,
      width:  region.width  * scale,
      height: region.height * scale,
    });
    schedulePreview();
  }, [schedulePreview]);

  const handleAutoCrop = useCallback(async () => {
    setAutoCropStatus({ kind: 'running' });

    const faces = await detectFaces(image.originalDataUrl);

    if (faces.length === 0) {
      setAutoCropStatus({ kind: 'no-face' });
      return;
    }

    // Resolve image dimensions from the data URL
    const imgEl = await new Promise<HTMLImageElement>((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.src = image.originalDataUrl;
    });
    const origW = imgEl.naturalWidth;
    const origH = imgEl.naturalHeight;

    const candidates: AutoCropCandidate[] = faces.map((faceBox) => ({
      faceBox,
      region: estimatePhotoRegion(faceBox, origW, origH),
    }));

    if (candidates.length === 1) {
      // Single face — apply immediately without picker
      setCropMode('standard');
      // Give CropperJS a tick to show (it may be hidden)
      setTimeout(() => {
        applyCropRegion(candidates[0].region);
        setAutoCropStatus({ kind: 'idle' });
      }, 80);
    } else {
      // Multiple faces — show picker
      setAutoCropStatus({ kind: 'candidates', list: candidates });
    }
  }, [image.originalDataUrl, applyCropRegion]);

  const handlePickCandidate = useCallback((candidate: AutoCropCandidate) => {
    setCropMode('standard');
    setTimeout(() => {
      applyCropRegion(candidate.region);
      setAutoCropStatus({ kind: 'idle' });
    }, 80);
  }, [applyCropRegion]);

  // ── Core pipeline ─────────────────────────────────────────────────
  const getCroppedDataUrl = useCallback((): string | null => {
    try {
      let sourceCanvas: HTMLCanvasElement;

      if (cropMode === 'perspective') {
        const pc = perspRef.current?.getCroppedCanvas();
        if (!pc) return null;
        sourceCanvas = rotation !== 0 ? rotateCanvas(pc, rotation) : pc;
      } else {
        const cropper = cropperRef.current?.cropper;
        if (!cropper) return null;
        sourceCanvas = cropper.getCroppedCanvas({ maxWidth: 4096, maxHeight: 4096 });
      }

      const hasConstraints =
        resizeConfig.maxWidth  !== null ||
        resizeConfig.maxHeight !== null ||
        resizeConfig.maxSizeBytes !== null;

      return hasConstraints
        ? resizeAndCompress(sourceCanvas, resizeConfig)
        : sourceCanvas.toDataURL('image/jpeg', 0.92);
    } catch { return null; }
  }, [cropMode, resizeConfig, rotation, rotateCanvas]);

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
        setRotation((p) => { const n = p + step; rotationRef.current = n; applyRotation(n); schedulePreview(); return n; });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.ctrlKey ? 90 : 1;
        setRotation((p) => { const n = p + step; rotationRef.current = n; applyRotation(n); schedulePreview(); return n; });
      } else if (e.key === ' ') {
        e.preventDefault();
        if (hasNext) handleSaveAndNext(); else handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [applyRotation, schedulePreview, hasNext, handleSave, handleSaveAndNext]);

  // ── Restore saved crop on CropperJS ready ────────────────────────
  const onCropperReady = useCallback(() => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    const imgData = cropper.getImageData();
    if (imgData.naturalWidth && imgData.naturalHeight) {
      setOriginalRatio(imgData.naturalWidth / imgData.naturalHeight);
    }
    if (editorGlobals.lockedAspectRatio !== null) {
      const r = editorGlobals.lockedAspectRatio;
      cropper.setAspectRatio(r === 'free' ? NaN : (r as number));
    }
    if (!image.cropData) {
      schedulePreview();
      return;
    }
    const cd = image.cropData;
    cropper.rotateTo(cd.rotate);
    setTimeout(() => {
      cropper.setCropBoxData({ left: cd.x, top: cd.y, width: cd.width, height: cd.height });
      schedulePreview();
    }, 50);
  }, [image.cropData, editorGlobals.lockedAspectRatio, schedulePreview]);

  const hasResizeActive =
    resizeConfig.maxWidth !== null ||
    resizeConfig.maxHeight !== null ||
    resizeConfig.maxSizeBytes !== null;

  const ratioLocked   = editorGlobals.lockedAspectRatio !== null;
  const resizeLocked  = editorGlobals.lockedResizeConfig !== null;

  // ── Auto Crop "no face" toast (show once, then reset to idle) ─────
  useEffect(() => {
    if (autoCropStatus.kind === 'no-face') {
      toast('No face detected — switch to manual crop', {
        icon: '🔍',
        duration: 3000,
      });
      setAutoCropStatus({ kind: 'idle' });
    }
  }, [autoCropStatus.kind]);

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
          onClick={() => { setCropMode('standard'); schedulePreview(); }}
          title="Standard rectangular crop"
        >
          <Crop size={15} /> Standard
        </button>
        <button
          className={`crop-mode-btn ${cropMode === 'perspective' ? 'active' : ''}`}
          onClick={() => { setCropMode('perspective'); schedulePreview(); }}
          title="Four-corner perspective crop"
        >
          <PenTool size={15} /> Perspective
        </button>

        {/* Auto Crop button — sits in the same bar, visually separated */}
        <div className="crop-mode-sep" />
        <button
          className={`crop-mode-btn crop-mode-btn--auto${autoCropStatus.kind === 'running' ? ' running' : ''}`}
          onClick={handleAutoCrop}
          disabled={autoCropStatus.kind === 'running'}
          title="Detect face and suggest a passport-style crop"
        >
          {autoCropStatus.kind === 'running'
            ? <><Loader2 size={15} className="spin" /> Detecting…</>
            : <><Scan size={15} /> Auto Crop</>
          }
        </button>
      </div>

      {/* ── Candidate picker (shown when multiple faces detected) ── */}
      {autoCropStatus.kind === 'candidates' && (
        <div className="autocrop-picker">
          <div className="autocrop-picker-header">
            <span className="autocrop-picker-title">
              {autoCropStatus.list.length} faces detected — pick a region:
            </span>
            <button
              className="autocrop-picker-dismiss"
              onClick={() => setAutoCropStatus({ kind: 'idle' })}
              title="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
          <div className="autocrop-picker-list">
            {autoCropStatus.list.map((candidate, i) => (
              <button
                key={i}
                className="autocrop-candidate-btn"
                onClick={() => handlePickCandidate(candidate)}
                title={`Confidence: ${(candidate.faceBox.confidence * 100).toFixed(0)}%`}
              >
                <CandidateThumbnail
                  dataUrl={image.originalDataUrl}
                  region={candidate.region}
                />
                <span className="autocrop-candidate-label">
                  Face {i + 1}
                  <span className="autocrop-candidate-conf">
                    {(candidate.faceBox.confidence * 100).toFixed(0)}%
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Canvas area ── */}
      <div className="editor-canvas-wrap">
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
            crop={schedulePreview}
            background={false}
            responsive={true}
            restore={false}
          />
        </div>

        {cropMode === 'perspective' && (
          <PerspectiveCropOverlay
            ref={perspRef}
            src={image.originalDataUrl}
            rotation={rotation}
            onChange={schedulePreview}
          />
        )}
      </div>

      {/* ── Controls ── */}
      <div className="editor-controls">
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

        <div className="kbd-hints">
          <span className="kbd-hint"><kbd className="kbd">←</kbd><kbd className="kbd">→</kbd> Rotate 1°</span>
          <span className="kbd-hint"><kbd className="kbd">Ctrl</kbd><kbd className="kbd">←</kbd><kbd className="kbd">→</kbd> Rotate 90°</span>
          <span className="kbd-hint"><kbd className="kbd">Space</kbd> Save &amp; Next</span>
        </div>
      </div>
    </div>
  );
}

// ── CandidateThumbnail ────────────────────────────────────────────────────────
// Renders a tiny cropped preview of a candidate region so the user can
// visually identify which face is which before picking.

interface ThumbProps {
  dataUrl: string;
  region: CropRegion;
}

function CandidateThumbnail({ dataUrl, region }: ThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      const THUMB = 64;
      const aspect = region.width / region.height;
      const tw = aspect >= 1 ? THUMB : Math.round(THUMB * aspect);
      const th = aspect < 1  ? THUMB : Math.round(THUMB / aspect);
      canvas.width  = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(
        img,
        region.x, region.y, region.width, region.height,
        0, 0, tw, th,
      );
    };
    img.src = dataUrl;
  }, [dataUrl, region]);

  return <canvas ref={canvasRef} className="autocrop-thumb" />;
}
