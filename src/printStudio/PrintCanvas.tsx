// ─── Print Studio Canvas ──────────────────────────────────────────────────────
// Renders the page at true proportion. Each element is draggable/resizable/
// rotatable. Zoom changes only CSS px representation — never mm values.
//
// All interactions write back to mm-based state via callbacks.

import { useRef, useState, useCallback, useEffect } from 'react';
import type { PrintDocument, PrintElement } from './types';
import type { ImageItem } from '../types';
import { mmToPx, pxToMm, effectivePageSize } from './units';

interface Props {
  doc: PrintDocument;
  zoom: number;
  images: ImageItem[];
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onUpdateElement: (id: string, patch: Partial<Omit<PrintElement, 'id'>>) => void;
  onAddFromDrop: (imageId: string, naturalW: number, naturalH: number, x_mm: number, y_mm: number) => void;
}

// ── Handle types for resize ────────────────────────────────────────────────────
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface DragState {
  type: 'move' | 'resize' | 'rotate';
  elementId: string;
  startX: number; // pointer start X (client)
  startY: number; // pointer start Y (client)
  startEl: PrintElement; // snapshot of element state at drag start
  handle?: ResizeHandle;
  // For rotate: the angle from element center to pointer at drag start
  rotateStartAngle?: number;
}

export function PrintCanvas({
  doc, zoom, images, selectedElementId,
  onSelectElement, onUpdateElement, onAddFromDrop,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const { width_mm, height_mm } = effectivePageSize(doc);
  const pageW = mmToPx(width_mm, zoom);
  const pageH = mmToPx(height_mm, zoom);

  // ── Pointer event handlers ─────────────────────────────────────────────────

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (drag.type === 'move') {
      onUpdateElement(drag.elementId, {
        x_mm: drag.startEl.x_mm + pxToMm(dx, zoom),
        y_mm: drag.startEl.y_mm + pxToMm(dy, zoom),
      });
    } else if (drag.type === 'resize' && drag.handle) {
      const patch = computeResize(drag.startEl, drag.handle, dx, dy, zoom);
      onUpdateElement(drag.elementId, patch);
    } else if (drag.type === 'rotate') {
      const page = canvasRef.current;
      if (!page) return;
      const rect = page.getBoundingClientRect();
      const elCenterX = rect.left + mmToPx(drag.startEl.x_mm + drag.startEl.width_mm / 2, zoom);
      const elCenterY = rect.top  + mmToPx(drag.startEl.y_mm + drag.startEl.height_mm / 2, zoom);
      const angle = Math.atan2(e.clientY - elCenterY, e.clientX - elCenterX) * (180 / Math.PI);
      const newRotation = angle - (drag.rotateStartAngle ?? 0) + drag.startEl.rotation_deg;
      onUpdateElement(drag.elementId, { rotation_deg: newRotation });
    }
  }, [zoom, onUpdateElement]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  // ── Drag-and-drop from Image Tray ──────────────────────────────────────────

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    try {
      const { imageId, naturalW, naturalH } = JSON.parse(raw) as {
        imageId: string; naturalW: number; naturalH: number;
      };
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dropX_mm = pxToMm(e.clientX - rect.left, zoom);
      const dropY_mm = pxToMm(e.clientY - rect.top, zoom);
      onAddFromDrop(imageId, naturalW, naturalH, dropX_mm, dropY_mm);
    } catch { /* ignore parse errors */ }
  }

  // ── Background click to deselect ───────────────────────────────────────────

  function handleCanvasClick(e: React.MouseEvent) {
    if (e.target === canvasRef.current) {
      onSelectElement(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const sortedElements = [...doc.elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="ps-canvas-scroll">
      <div className="ps-canvas-center">
        {/* The page rectangle */}
        <div
          ref={canvasRef}
          className={`ps-page${isDragOver ? ' ps-page--dragover' : ''}`}
          style={{ width: pageW, height: pageH }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleCanvasClick}
        >
          {/* Subtle grid / margin guides */}
          <PageGuides width_mm={width_mm} height_mm={height_mm} zoom={zoom} margins_mm={doc.margins_mm} />

          {/* Elements */}
          {sortedElements.map((el) => {
            const imgItem = images.find((i) => i.id === el.sourceImageId);
            if (!imgItem) return null;
            const src = imgItem.processedDataUrl ?? imgItem.originalDataUrl;
            return (
              <CanvasElement
                key={el.id}
                el={el}
                src={src}
                zoom={zoom}
                isSelected={el.id === selectedElementId}
                onSelect={() => onSelectElement(el.id)}
                onMoveStart={(e) => startDrag(e, 'move', el)}
                onResizeStart={(e, handle) => startDrag(e, 'resize', el, handle)}
                onRotateStart={(e) => {
                  const elCenterX = e.currentTarget.closest('.ps-element')!.getBoundingClientRect().left +
                    mmToPx(el.width_mm / 2, zoom);
                  const elCenterY = e.currentTarget.closest('.ps-element')!.getBoundingClientRect().top +
                    mmToPx(el.height_mm / 2, zoom);
                  const startAngle = Math.atan2(e.clientY - elCenterY, e.clientX - elCenterX) * (180 / Math.PI);
                  dragRef.current = {
                    type: 'rotate',
                    elementId: el.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    startEl: { ...el },
                    rotateStartAngle: startAngle - el.rotation_deg,
                  };
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );

  function startDrag(
    e: React.PointerEvent,
    type: 'move' | 'resize',
    el: PrintElement,
    handle?: ResizeHandle,
  ) {
    e.stopPropagation();
    dragRef.current = {
      type,
      elementId: el.id,
      startX: e.clientX,
      startY: e.clientY,
      startEl: { ...el },
      handle,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelectElement(el.id);
  }
}

// ── computeResize ─────────────────────────────────────────────────────────────

function computeResize(
  el: PrintElement,
  handle: ResizeHandle,
  dxPx: number,
  dyPx: number,
  zoom: number,
): Partial<PrintElement> {
  const dx = pxToMm(dxPx, zoom);
  const dy = pxToMm(dyPx, zoom);
  const aspect = el.width_mm / el.height_mm;

  let { x_mm, y_mm, width_mm, height_mm } = el;
  const minSize = 5; // 5mm minimum

  switch (handle) {
    case 'se':
      width_mm  = Math.max(minSize, el.width_mm + dx);
      height_mm = el.lockAspect ? width_mm / aspect : Math.max(minSize, el.height_mm + dy);
      break;
    case 's':
      height_mm = Math.max(minSize, el.height_mm + dy);
      break;
    case 'e':
      width_mm  = Math.max(minSize, el.width_mm + dx);
      if (el.lockAspect) height_mm = width_mm / aspect;
      break;
    case 'sw':
      width_mm  = Math.max(minSize, el.width_mm - dx);
      height_mm = el.lockAspect ? width_mm / aspect : Math.max(minSize, el.height_mm + dy);
      x_mm      = el.x_mm + el.width_mm - width_mm;
      break;
    case 'w':
      width_mm  = Math.max(minSize, el.width_mm - dx);
      x_mm      = el.x_mm + el.width_mm - width_mm;
      if (el.lockAspect) height_mm = width_mm / aspect;
      break;
    case 'nw':
      width_mm  = Math.max(minSize, el.width_mm - dx);
      height_mm = el.lockAspect ? width_mm / aspect : Math.max(minSize, el.height_mm - dy);
      x_mm      = el.x_mm + el.width_mm  - width_mm;
      y_mm      = el.y_mm + el.height_mm - height_mm;
      break;
    case 'n':
      height_mm = Math.max(minSize, el.height_mm - dy);
      y_mm      = el.y_mm + el.height_mm - height_mm;
      break;
    case 'ne':
      width_mm  = Math.max(minSize, el.width_mm + dx);
      height_mm = el.lockAspect ? width_mm / aspect : Math.max(minSize, el.height_mm - dy);
      y_mm      = el.y_mm + el.height_mm - height_mm;
      break;
  }

  return { x_mm, y_mm, width_mm, height_mm };
}

// ── CanvasElement ─────────────────────────────────────────────────────────────

interface CanvasElProps {
  el: PrintElement;
  src: string;
  zoom: number;
  isSelected: boolean;
  onSelect: () => void;
  onMoveStart: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent, handle: ResizeHandle) => void;
  onRotateStart: (e: React.PointerEvent) => void;
}

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
  e:  'e-resize',  se: 'se-resize', s: 's-resize',
  sw: 'sw-resize', w: 'w-resize',
};

function CanvasElement({
  el, src, zoom, isSelected,
  onSelect, onMoveStart, onResizeStart, onRotateStart,
}: CanvasElProps) {
  const left   = mmToPx(el.x_mm, zoom);
  const top    = mmToPx(el.y_mm, zoom);
  const width  = mmToPx(el.width_mm, zoom);
  const height = mmToPx(el.height_mm, zoom);

  return (
    <div
      className={`ps-element${isSelected ? ' ps-element--selected' : ''}`}
      style={{
        position: 'absolute',
        left, top, width, height,
        transform: `rotate(${el.rotation_deg}deg)`,
        transformOrigin: 'center center',
        zIndex: el.zIndex,
        cursor: 'move',
        userSelect: 'none',
        touchAction: 'none',
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();
        onMoveStart(e);
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }}
      />

      {isSelected && (
        <>
          {/* Resize handles */}
          {HANDLES.map((h) => (
            <div
              key={h}
              className={`ps-handle ps-handle--${h}`}
              style={{ cursor: HANDLE_CURSORS[h] }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeStart(e, h);
              }}
            />
          ))}

          {/* Rotate handle — above center-top */}
          <div
            className="ps-handle ps-handle--rotate"
            onPointerDown={(e) => {
              e.stopPropagation();
              onRotateStart(e);
            }}
          />

          {/* Selection border overlay */}
          <div className="ps-element-border" />
        </>
      )}
    </div>
  );
}

// ── PageGuides ────────────────────────────────────────────────────────────────

function PageGuides({
  width_mm, height_mm, zoom, margins_mm,
}: {
  width_mm: number;
  height_mm: number;
  zoom: number;
  margins_mm?: { top: number; right: number; bottom: number; left: number };
}) {
  if (!margins_mm) return null;
  const { top, right, bottom, left } = margins_mm;
  const t = mmToPx(top, zoom);
  const r = mmToPx(right, zoom);
  const b = mmToPx(bottom, zoom);
  const l = mmToPx(left, zoom);
  const w = mmToPx(width_mm, zoom);
  const h = mmToPx(height_mm, zoom);
  return (
    <div
      className="ps-margins"
      style={{
        position: 'absolute',
        top: t, left: l,
        width: w - l - r,
        height: h - t - b,
        pointerEvents: 'none',
      }}
    />
  );
}
