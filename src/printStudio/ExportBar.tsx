// ─── Export Bar ───────────────────────────────────────────────────────────────
// Controls for PDF and PNG/JPEG export

import { useState } from 'react';
import { FileDown, ImageDown, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { saveAs } from 'file-saver';
import type { PrintDocument, ExportFormat } from './types';
import type { ImageItem } from '../types';
import { exportToPdf } from './pdfExport';
import { renderPageToBlob } from './PrintPreview';

interface Props {
  doc: PrintDocument;
  images: ImageItem[];
  onOpenPreview: () => void;
  onExportSettingsChange: (s: Partial<{ dpi: number; format: ExportFormat }>) => void;
}

export function ExportBar({ doc, images, onOpenPreview, onExportSettingsChange }: Props) {
  const [exporting, setExporting] = useState(false);
  const { dpi } = doc.exportSettings;

  async function handlePdfExport() {
    if (doc.elements.length === 0) {
      toast.error('No elements to export.');
      return;
    }
    setExporting(true);
    toast.promise(
      exportToPdf(doc, images).then((blob) => {
        const safeName = doc.name.replace(/[^a-z0-9_\-]/gi, '_');
        saveAs(blob, `${safeName}.pdf`);
      }),
      {
        loading: 'Generating PDF…',
        success: 'PDF exported!',
        error: (err) => `Export failed: ${String(err)}`,
      }
    ).finally(() => setExporting(false));
  }

  async function handleRasterExport(format: 'png' | 'jpeg') {
    if (doc.elements.length === 0) {
      toast.error('No elements to export.');
      return;
    }
    setExporting(true);
    toast.promise(
      renderPageToBlob(doc, images, dpi, format).then((blob) => {
        const safeName = doc.name.replace(/[^a-z0-9_\-]/gi, '_');
        saveAs(blob, `${safeName}.${format}`);
      }),
      {
        loading: `Rendering at ${dpi} DPI…`,
        success: `${format.toUpperCase()} exported!`,
        error: (err) => `Export failed: ${String(err)}`,
      }
    ).finally(() => setExporting(false));
  }

  return (
    <div className="ps-export-bar">
      <button className="toolbar-btn" onClick={onOpenPreview} title="Print preview">
        <Eye size={14} /> Preview
      </button>

      <div className="toolbar-divider" />

      <button
        className="toolbar-btn primary"
        onClick={handlePdfExport}
        disabled={exporting}
        title="Export as PDF"
      >
        <FileDown size={14} /> PDF
      </button>

      <div className="ps-dpi-group">
        <label className="ps-label">DPI</label>
        <select
          className="ps-select ps-select--sm"
          value={dpi}
          onChange={(e) => onExportSettingsChange({ dpi: parseInt(e.target.value) })}
        >
          {[72, 96, 150, 300, 600].map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <button
        className="toolbar-btn"
        onClick={() => handleRasterExport('png')}
        disabled={exporting}
        title="Export as PNG raster"
      >
        <ImageDown size={14} /> PNG
      </button>

      <button
        className="toolbar-btn"
        onClick={() => handleRasterExport('jpeg')}
        disabled={exporting}
        title="Export as JPEG raster"
      >
        <ImageDown size={14} /> JPEG
      </button>
    </div>
  );
}
