import { useRef, useState, useCallback, useEffect } from 'react';
import Cropper from 'react-cropper';
import type { ReactCropperElement } from 'react-cropper';
import {
  RotateCcw, RotateCw, Save, SkipForward, ZoomIn, ZoomOut,
  ChevronDown, ChevronUp, Crop, PenTool, Scan, Loader2, X,
  Camera, FileText, ToggleLeft, ToggleRight,
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
import { detectDocumentRegion } from '../autoCrop/detectDocumentRegion';

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
  | { kind: 'no-document' }
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

  // Refs that always hold the latest prop values so async callbacks and
  // effects with narrow dep arrays can read them without going stale.
  const autoApplyEnabledRef = useRef(editorGlobals.autoApplyAutoCrop);
  const autoCropModeRef     = useRef(editorGlobals.autoCropMode);
  const imageDataUrlRef     = useRef(image.originalDataUrl);
  const imageCropDataRef    = useRef(image.cropData);

  // Keep the refs in sync on every render (cheap, always correct).
  autoApplyEnabledRef.current = editorGlobals.autoApplyAutoCrop;
  autoCropModeRef.current     = editorGlobals.autoCropMode;
  imageDataUrlRef.current     = image.originalDataUrl;
  imageCropDataRef.current    = image.cropData;

  // Track which image was last auto-applied so we never run twice on the
  // same image ID within a session.  Reset to null on each new image so
  // the guard is fresh and turning the toggle on mid-image works.
  const autoAppliedForRef = useRef<string | null>(null);

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

  // ── Photo Auto Crop — rectangular region → CropperJS ─────────────
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

  // ── Document Auto Crop — 4 corners → Perspective overlay ─────────
  const applyDocumentCorners = useCallback((
    corners: Awaited<ReturnType<typeof detectDocumentRegion>>,
  ) => {
    if (!corners) return;
    // Switch to perspective mode, then inject corners after a tick so the
    // overlay has mounted and imgRef/rotatedCanvasRef are populated.
    setCropMode('perspective');
    setTimeout(() => {
      perspRef.current?.setCorners(corners);
      schedulePreview();
    }, 80);
  }, [schedulePreview]);

  // ── Unified Auto Crop dispatcher ──────────────────────────────────
  /**
   * Run whichever mode is currently selected.
   * `silent` = true suppresses the "not detected" toast (used by auto-apply).
   *
   * Reads mode and dataUrl from refs so it is always current regardless of
   * when (or which render) created this callback.
   */
  const runAutoCrop = useCallback(async (silent = false) => {
    // Read fresh values from refs — never stale even in auto-apply effects
    const mode    = autoCropModeRef.current;
    const dataUrl = imageDataUrlRef.current;

    console.log(`[AutoCrop] running mode="${mode}" silent=${silent} image="${dataUrl.slice(0, 40)}…"`);

    setAutoCropStatus({ kind: 'running' });

    if (mode === 'photo') {
      // ── Photo mode: face detection ─────────────────────────────
      const faces = await detectFaces(dataUrl);

      if (faces.length === 0) {
        if (silent) {
          setAutoCropStatus({ kind: 'idle' });
        } else {
          setAutoCropStatus({ kind: 'no-face' });
        }
        return;
      }

      const imgEl = await new Promise<HTMLImageElement>((res) => {
        const i = new Image();
        i.onload = () => res(i);
        i.src = dataUrl;
      });

      const candidates: AutoCropCandidate[] = faces.map((faceBox) => ({
        faceBox,
        region: estimatePhotoRegion(faceBox, imgEl.naturalWidth, imgEl.naturalHeight),
      }));

      if (candidates.length === 1) {
        setCropMode('standard');
        setTimeout(() => {
          applyCropRegion(candidates[0].region);
          setAutoCropStatus({ kind: 'idle' });
        }, 80);
      } else {
        // Multiple faces — always show picker regardless of silent flag
        setAutoCropStatus({ kind: 'candidates', list: candidates });
      }

    } else {
      // ── Document mode: edge/contour detection ──────────────────
      const corners = await detectDocumentRegion(dataUrl);

      if (!corners) {
        if (silent) {
          setAutoCropStatus({ kind: 'idle' });
        } else {
          setAutoCropStatus({ kind: 'no-document' });
        }
        return;
      }

      applyDocumentCorners(corners);
      setAutoCropStatus({ kind: 'idle' });
    }
  }, [
    // Only stable callbacks here — no prop values, those come from refs
    applyCropRegion,
    applyDocumentCorners,
  ]);

  // Public handler for the explicit button click (never silent)
  const handleAutoCrop = useCallback(() => runAutoCrop(false), [runAutoCrop]);

  const handlePickCandidate = useCallback((candidate: AutoCropCandidate) => {
    setCropMode('standard');
    setTimeout(() => {
      applyCropRegion(candidate.region);
      setAutoCropStatus({ kind: 'idle' });
    }, 80);
  }, [applyCropRegion]);

  // ── Auto-apply on image select ────────────────────────────────────
  //
  // Effect 1: fires when image.id changes (new image selected / Save & Next).
  // Resets the dedup ref for the incoming image, then schedules auto-apply
  // if enabled.  Reads toggle state from autoApplyEnabledRef so it always
  // sees the current value even if the prop changed between renders.
  useEffect(() => {
    // Always reset so the new image gets a clean slate.
    autoAppliedForRef.current = null;

    // Read fresh from ref — not from a closed-over prop value.
    if (!autoApplyEnabledRef.current) return;
    if (imageCropDataRef.current !== null) return; // already has user crop — skip

    autoAppliedForRef.current = image.id;
    console.log(`[AutoCrop] auto-apply scheduled for new image id="${image.id}" mode="${autoCropModeRef.current}"`);

    // Delay so CropperJS / PerspectiveCropOverlay finish mounting first.
    const timer = setTimeout(() => {
      runAutoCrop(true /* silent */);
    }, 300);

    return () => clearTimeout(timer);
  // runAutoCrop is stable (deps are only stable callbacks).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image.id, runAutoCrop]);

  // Effect 2: fires when the toggle is turned ON while an image is already
  // displayed.  This lets the user enable auto-apply mid-session and have
  // it fire immediately for the currently-shown image (if it has no crop).
  useEffect(() => {
    if (!editorGlobals.autoApplyAutoCrop) return;          // toggle just turned OFF — ignore
    if (imageCropDataRef.current !== null) return;         // image already has a crop
    if (autoAppliedForRef.current === image.id) return;    // already ran for this image

    autoAppliedForRef.current = image.id;
    console.log(`[AutoCrop] auto-apply triggered by toggle ON for image id="${image.id}" mode="${autoCropModeRef.current}"`);

    const timer = setTimeout(() => {
      runAutoCrop(true /* silent */);
    }, 300);

    return () => clearTimeout(timer);
  // Intentionally only re-fires when autoApplyAutoCrop flips to true.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorGlobals.autoApplyAutoCrop]);

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

  // ── Auto Crop "no detection" toasts ──────────────────────────────
  // These fire in non-silent (manual button press) mode only, because in
  // silent mode we flip directly to 'idle' before the status can persist.
  useEffect(() => {
    if (autoCropStatus.kind === 'no-face') {
      toast('No face detected — switch to manual crop', { icon: '🔍', duration: 3000 });
      setAutoCropStatus({ kind: 'idle' });
    }
    if (autoCropStatus.kind === 'no-document') {
      toast('No document edge detected — adjust manually', { icon: '📄', duration: 3000 });
      setAutoCropStatus({ kind: 'idle' });
    }
  }, [autoCropStatus.kind]);

  const isRunning = autoCropStatus.kind === 'running';

  // ── Derived globals for render ────────────────────────────────────
  const { autoCropMode, autoApplyAutoCrop } = editorGlobals;

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

        {/* ── Auto Crop section ── */}
        <div className="crop-mode-sep" />

        {/* Mode selector: Photo vs Document */}
        <div className="autocrop-mode-selector" role="group" aria-label="Auto Crop mode">
          <button
            className={`autocrop-mode-btn ${autoCropMode === 'photo' ? 'active' : ''}`}
            onClick={() => onGlobalsChange({ autoCropMode: 'photo' })}
            title="Photo Auto Crop — detect face and suggest passport-style crop"
          >
            <Camera size={13} /> Photo
          </button>
          <button
            className={`autocrop-mode-btn ${autoCropMode === 'document' ? 'active' : ''}`}
            onClick={() => onGlobalsChange({ autoCropMode: 'document' })}
            title="Document Auto Crop — detect outer document boundary"
          >
            <FileText size={13} /> Document
          </button>
        </div>

        {/* Run button */}
        <button
          className={`crop-mode-btn crop-mode-btn--auto${isRunning ? ' running' : ''}`}
          onClick={handleAutoCrop}
          disabled={isRunning}
          title={
            autoCropMode === 'photo'
              ? 'Detect face and suggest a passport-style crop'
              : 'Detect document boundary and set perspective corners'
          }
        >
          {isRunning
            ? <><Loader2 size={15} className="spin" /> Detecting…</>
            : <><Scan size={15} /> Auto Crop</>
          }
        </button>

        {/* Auto-apply toggle */}
        <div className="crop-mode-sep" />
        <button
          className={`autocrop-toggle-btn${autoApplyAutoCrop ? ' on' : ''}`}
          onClick={() => onGlobalsChange({ autoApplyAutoCrop: !autoApplyAutoCrop })}
          title={
            autoApplyAutoCrop
              ? 'Auto-apply on select: ON — click to disable'
              : 'Auto-apply on select: OFF — click to enable'
          }
          aria-pressed={autoApplyAutoCrop}
        >
          {autoApplyAutoCrop
            ? <ToggleRight size={16} className="autocrop-toggle-icon on" />
            : <ToggleLeft  size={16} className="autocrop-toggle-icon"    />
          }
          <span className="autocrop-toggle-label">Auto-apply</span>
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
