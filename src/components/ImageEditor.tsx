import { useRef, useState, useCallback, useEffect } from 'react';
import Cropper from 'react-cropper';
import type { ReactCropperElement } from 'react-cropper';
import { RotateCcw, RotateCw, Save, SkipForward, ZoomIn, ZoomOut } from 'lucide-react';
import 'cropperjs/dist/cropper.css';
import type { ImageItem, CropData } from '../types';

interface Props {
  image: ImageItem;
  hasNext: boolean;
  onSave: (id: string, cropData: CropData, processedDataUrl: string) => void;
  onNext: () => void;
  onSaveAndNext: (id: string, cropData: CropData, processedDataUrl: string) => void;
}

export function ImageEditor({ image, hasNext, onSave, onNext, onSaveAndNext }: Props) {
  const cropperRef = useRef<ReactCropperElement>(null);
  const [rotation, setRotation] = useState<number>(image.cropData?.rotate ?? 0);
  const [isSaving, setIsSaving] = useState(false);

  // Reset rotation when the image changes
  useEffect(() => {
    setRotation(image.cropData?.rotate ?? 0);
  }, [image.id, image.cropData?.rotate]);

  // Apply rotation to cropper whenever slider changes
  const applyRotation = useCallback((deg: number) => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    cropper.rotateTo(deg);
  }, []);

  const handleRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setRotation(val);
    applyRotation(val);
  };

  const handleRotateLeft = () => {
    const next = rotation - 90;
    setRotation(next);
    applyRotation(next);
  };

  const handleRotateRight = () => {
    const next = rotation + 90;
    setRotation(next);
    applyRotation(next);
  };

  const handleZoomIn = () => {
    cropperRef.current?.cropper.zoom(0.1);
  };

  const handleZoomOut = () => {
    cropperRef.current?.cropper.zoom(-0.1);
  };

  const handleResetCrop = () => {
    cropperRef.current?.cropper.reset();
    setRotation(0);
  };

  /** Render the cropped/rotated image to a data URL */
  const getCroppedDataUrl = useCallback((): string | null => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return null;
    try {
      return cropper.getCroppedCanvas({ maxWidth: 4096, maxHeight: 4096 }).toDataURL('image/jpeg', 0.92);
    } catch {
      return null;
    }
  }, []);

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

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    const dataUrl = getCroppedDataUrl();
    if (!dataUrl) { setIsSaving(false); return; }
    const cropData = buildCropData();
    onSave(image.id, cropData, dataUrl);
    setIsSaving(false);
  }, [image.id, getCroppedDataUrl, buildCropData, onSave]);

  const handleSaveAndNext = useCallback(async () => {
    setIsSaving(true);
    const dataUrl = getCroppedDataUrl();
    if (!dataUrl) { setIsSaving(false); return; }
    const cropData = buildCropData();
    onSaveAndNext(image.id, cropData, dataUrl);
    setIsSaving(false);
  }, [image.id, getCroppedDataUrl, buildCropData, onSaveAndNext]);

  // Keyboard shortcuts — active whenever the editor is mounted
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire when the user is typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.ctrlKey ? -90 : -1;
        setRotation((prev) => {
          const next = prev + step;
          applyRotation(next);
          return next;
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.ctrlKey ? 90 : 1;
        setRotation((prev) => {
          const next = prev + step;
          applyRotation(next);
          return next;
        });
      } else if (e.key === ' ') {
        // Prevent page scroll
        e.preventDefault();
        // Trigger Save & Next (or just Save if no next image)
        if (hasNext) {
          handleSaveAndNext();
        } else {
          handleSave();
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [applyRotation, hasNext, handleSave, handleSaveAndNext]);

  // Restore crop box from saved state after cropper is ready
  const onCropperReady = useCallback(() => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper || !image.cropData) return;
    const cd = image.cropData;
    cropper.rotateTo(cd.rotate);
    // Small delay to let the rotation settle before restoring crop box
    setTimeout(() => {
      cropper.setCropBoxData({
        left: cd.x,
        top: cd.y,
        width: cd.width,
        height: cd.height,
      });
    }, 50);
  }, [image.cropData]);

  return (
    <div className="editor-container">
      {/* Image name header */}
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
        {/* Rotation row */}
        <div className="control-row">
          <label className="control-label">Rotate</label>
          <div className="rotate-controls">
            <button className="icon-btn" onClick={handleRotateLeft} title="Rotate -90°">
              <RotateCcw size={16} />
            </button>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={rotation}
              onChange={handleRotationChange}
              className="rotate-slider"
            />
            <button className="icon-btn" onClick={handleRotateRight} title="Rotate +90°">
              <RotateCw size={16} />
            </button>
            <input
              type="number"
              min={-180}
              max={180}
              value={rotation}
              onChange={handleRotationChange}
              className="rotate-number"
            />
            <span className="rotate-unit">°</span>
          </div>
        </div>

        {/* Zoom row */}
        <div className="control-row">
          <label className="control-label">Zoom</label>
          <div className="zoom-controls">
            <button className="icon-btn" onClick={handleZoomOut} title="Zoom out">
              <ZoomOut size={16} />
            </button>
            <button className="icon-btn" onClick={handleZoomIn} title="Zoom in">
              <ZoomIn size={16} />
            </button>
            <button className="icon-btn secondary" onClick={handleResetCrop} title="Reset crop &amp; rotation">
              <RotateCcw size={14} />
              <span className="btn-label">Reset</span>
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="editor-actions">
          <button
            className="action-btn primary"
            onClick={handleSave}
            disabled={isSaving}
            title="Save (or press Space when no next image)"
          >
            <Save size={16} />
            Save
          </button>
          {hasNext && (
            <button
              className="action-btn success"
              onClick={handleSaveAndNext}
              disabled={isSaving}
              title="Save &amp; go to next image (Space)"
            >
              <Save size={16} />
              Save &amp; Next
              <SkipForward size={16} />
              <kbd className="kbd">Space</kbd>
            </button>
          )}
          {hasNext && (
            <button
              className="action-btn secondary"
              onClick={onNext}
              disabled={isSaving}
            >
              <SkipForward size={16} />
              Skip
            </button>
          )}
        </div>

        {/* Keyboard shortcut hints */}
        <div className="kbd-hints">
          <span className="kbd-hint"><kbd className="kbd">←</kbd><kbd className="kbd">→</kbd> Rotate 1°</span>
          <span className="kbd-hint"><kbd className="kbd">Ctrl</kbd><kbd className="kbd">←</kbd><kbd className="kbd">→</kbd> Rotate 90°</span>
          <span className="kbd-hint"><kbd className="kbd">Space</kbd> Save &amp; Next</span>
        </div>
      </div>
    </div>
  );
}
