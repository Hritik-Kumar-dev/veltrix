// ─── Print Studio ─────────────────────────────────────────────────────────────
// Main container for the Print Studio tab. Manages layout and wires sub-panels:
//   Left sidebar:   PageSetupPanel + ImageTray
//   Center:         Canvas (zoom, drag, resize, rotate)
//   Right sidebar:  SelectedElementPanel
//   Bottom bar:     ZoomControls + ExportBar
//   Overlay:        PrintPreview (when open)

import { usePrintStudio } from './usePrintStudio';
import { PageSetupPanel } from './PageSetupPanel';
import { ImageTray } from './ImageTray';
import { PrintCanvas } from './PrintCanvas';
import { SelectedElementPanel } from './SelectedElementPanel';
import { ZoomControls } from './ZoomControls';
import { ExportBar } from './ExportBar';
import { PrintPreview } from './PrintPreview';
import type { ImageItem } from '../types';
import { effectivePageSize } from './units';
import { Plus, Printer, FileText, Trash2 } from 'lucide-react';

interface Props {
  /** Gallery images from useImageStore — read-only reference */
  galleryImages: ImageItem[];
}

export function PrintStudio({ galleryImages }: Props) {
  const {
    state,
    activeDoc,
    activeElement,
    newDocument,
    setActiveDoc,
    renameDocument,
    deleteDocument,
    setPagePreset,
    setPortrait,
    setExportSettings,
    addElement,
    updateElement,
    deleteElement,
    duplicateElement,
    raiseElement,
    lowerElement,
    selectElement,
    setZoom,
    setDisplayUnit,
    setPreviewOpen,
  } = usePrintStudio();

  // ── No document yet: show empty state ─────────────────────────────────────

  if (!activeDoc) {
    return (
      <div className="ps-empty-state">
        <Printer size={48} className="ps-empty-icon" />
        <h2 className="ps-empty-title">Print Studio</h2>
        <p className="ps-empty-sub">Create a new layout to get started.</p>
        <button className="toolbar-btn primary" onClick={newDocument}>
          <Plus size={16} /> New Layout
        </button>
      </div>
    );
  }

  // ── Add element from Image Tray click ─────────────────────────────────────

  function handleAddImage(imageId: string, naturalW: number, naturalH: number) {
    const { width_mm, height_mm } = effectivePageSize(activeDoc!);
    // Scale image to fit 1/3 of the shorter page dimension, preserving aspect
    const aspect = naturalW / naturalH;
    const maxDim = Math.min(width_mm, height_mm) * 0.4;
    let w = maxDim;
    let h = maxDim / aspect;
    if (h > maxDim) { h = maxDim; w = maxDim * aspect; }
    addElement(imageId, w, h);
  }

  // ── Add element from canvas drop ──────────────────────────────────────────

  function handleDropOnCanvas(
    imageId: string, naturalW: number, naturalH: number, x_mm: number, y_mm: number
  ) {
    const { width_mm, height_mm } = effectivePageSize(activeDoc!);
    const aspect = naturalW / naturalH;
    const maxDim = Math.min(width_mm, height_mm) * 0.4;
    let w = maxDim;
    let h = maxDim / aspect;
    if (h > maxDim) { h = maxDim; w = maxDim * aspect; }
    addElement(imageId, w, h, x_mm - w / 2, y_mm - h / 2);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="ps-root">
      {/* ── Top bar ── */}
      <div className="ps-topbar">
        {/* Document tabs */}
        <div className="ps-doc-tabs">
          {state.documents.map((doc) => (
            <button
              key={doc.id}
              className={`ps-doc-tab${doc.id === state.activeDocId ? ' active' : ''}`}
              onClick={() => setActiveDoc(doc.id)}
              title={doc.name}
            >
              <FileText size={13} />
              <span className="ps-doc-tab-name">{doc.name}</span>
            </button>
          ))}
          <button className="ps-doc-tab ps-doc-tab--new" onClick={newDocument} title="New layout">
            <Plus size={14} />
          </button>
        </div>

        {/* Current document name (editable) + delete */}
        <div className="ps-topbar-right">
          <input
            className="ps-doc-name-input"
            value={activeDoc.name}
            onChange={(e) => renameDocument(activeDoc.id, e.target.value)}
            spellCheck={false}
            aria-label="Layout name"
          />
          <button
            className="toolbar-btn danger"
            onClick={() => {
              if (confirm(`Delete "${activeDoc.name}"?`)) deleteDocument(activeDoc.id);
            }}
            title="Delete this layout"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* ── Main workspace ── */}
      <div className="ps-workspace">
        {/* Left sidebar */}
        <aside className="ps-sidebar ps-sidebar--left">
          <PageSetupPanel
            doc={activeDoc}
            displayUnit={state.displayUnit}
            onUnitChange={setDisplayUnit}
            onPresetChange={setPagePreset}
            onPortraitChange={setPortrait}
          />
          <ImageTray
            images={galleryImages}
            onAddImage={handleAddImage}
          />
        </aside>

        {/* Canvas area */}
        <div className="ps-canvas-area">
          <PrintCanvas
            doc={activeDoc}
            zoom={state.zoom}
            images={galleryImages}
            selectedElementId={state.selectedElementId}
            onSelectElement={selectElement}
            onUpdateElement={updateElement}
            onAddFromDrop={handleDropOnCanvas}
          />

          {/* Bottom controls bar */}
          <div className="ps-bottom-bar">
            <ZoomControls zoom={state.zoom} onZoom={setZoom} />
            <div style={{ flex: 1 }} />
            <ExportBar
              doc={activeDoc}
              images={galleryImages}
              onOpenPreview={() => setPreviewOpen(true)}
              onExportSettingsChange={setExportSettings}
            />
          </div>
        </div>

        {/* Right sidebar — only when element is selected */}
        <aside className={`ps-sidebar ps-sidebar--right${activeElement ? ' visible' : ''}`}>
          {activeElement && (
            <SelectedElementPanel
              element={activeElement}
              displayUnit={state.displayUnit}
              onUpdate={(patch) => updateElement(activeElement.id, patch)}
              onDelete={() => deleteElement(activeElement.id)}
              onDuplicate={() => duplicateElement(activeElement.id)}
              onRaise={() => raiseElement(activeElement.id)}
              onLower={() => lowerElement(activeElement.id)}
            />
          )}
        </aside>
      </div>

      {/* Print Preview overlay */}
      {state.previewOpen && (
        <PrintPreview
          doc={activeDoc}
          images={galleryImages}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
