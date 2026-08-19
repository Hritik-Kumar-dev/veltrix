import { useRef } from 'react';
import { FolderOpen, Download, DownloadCloud, Trash2, Image, Tag, ArrowLeft } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';
import type { ImageItem } from '../types';

type AppView = 'editor' | 'rename';

interface Props {
  images: ImageItem[];
  onImport: (files: File[]) => Promise<void>;
  onClearAll: () => void;
  onNavigateRename: () => void;
  onNavigateEditor: () => void;
  view: AppView;
  doneCount: number;
  getFinalName: (img: ImageItem, index: number) => string;
  zipFilename: string;
  onZipFilenameChange: (name: string) => void;
}

/** Sanitise a user-provided filename: strip path chars, collapse spaces, strip .zip suffix */
function sanitiseZipName(raw: string): string {
  return raw
    .replace(/\.zip$/i, '')          // strip trailing .zip
    .replace(/[/\\:*?"<>|]/g, '_')   // replace illegal chars
    .replace(/\s+/g, '_')            // collapse whitespace
    .trim() || 'batch_export';       // fallback
}

export function Toolbar({
  images,
  onImport,
  onClearAll,
  onNavigateRename,
  onNavigateEditor,
  view,
  doneCount,
  getFinalName,
  zipFilename,
  onZipFilenameChange,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    await onImport(files);
    toast.success(`Imported ${files.length} image${files.length > 1 ? 's' : ''}`);
    e.target.value = '';
  };

  const handleExportZip = () => {
    if (!images.length) { toast.error('No images to export.'); return; }
    const finalZipName = sanitiseZipName(zipFilename) + '.zip';
    toast.promise(
      (async () => {
        const zip = new JSZip();
        images.forEach((img, idx) => {
          const src    = img.processedDataUrl ?? img.originalDataUrl;
          const base64 = src.split(',')[1];
          zip.file(getFinalName(img, idx), base64, { base64: true });
        });
        const blob = await zip.generateAsync({ type: 'blob' });
        saveAs(blob, finalZipName);
      })(),
      {
        loading: 'Building ZIP…',
        success: `Exported as ${finalZipName}`,
        error: 'Export failed',
      }
    );
  };

  const handleDownloadAll = () => {
    if (!images.length) { toast.error('No images to download.'); return; }
    images.forEach((img, idx) => {
      const a = document.createElement('a');
      a.href = img.processedDataUrl ?? img.originalDataUrl;
      a.download = getFinalName(img, idx);
      a.click();
    });
    toast.success(`Downloading ${images.length} file${images.length > 1 ? 's' : ''}…`);
  };

  const handleClearAll = () => {
    if (!images.length) return;
    if (!confirm('Remove all images? This cannot be undone.')) return;
    onClearAll();
    toast.success('All images cleared');
  };

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <Image size={20} className="brand-icon" />
        <span className="brand-name">BatchCrop</span>
      </div>

      {view === 'rename' && (
        <button className="toolbar-btn toolbar-back-btn" onClick={onNavigateEditor}>
          <ArrowLeft size={16} /> Back to Editor
        </button>
      )}

      <div className="toolbar-actions">
        {view === 'editor' && (
          <button className="toolbar-btn primary" onClick={() => fileInputRef.current?.click()}>
            <FolderOpen size={16} /> Import Images
          </button>
        )}

        {view === 'editor' && <div className="toolbar-divider" />}

        {view === 'editor' ? (
          <button className="toolbar-btn" onClick={onNavigateRename} title="Open bulk rename workspace">
            <Tag size={16} /> Rename
          </button>
        ) : (
          <span className="toolbar-view-indicator"><Tag size={14} /> Bulk Rename</span>
        )}

        <div className="toolbar-divider" />

        {/* ZIP filename input */}
        <div className="zip-name-field" title="Name for the exported ZIP file">
          <input
            type="text"
            className="zip-name-input"
            value={zipFilename}
            onChange={(e) => onZipFilenameChange(e.target.value)}
            placeholder="export_name"
            spellCheck={false}
            aria-label="ZIP export filename"
          />
          <span className="zip-name-ext">.zip</span>
        </div>

        <button
          className="toolbar-btn"
          onClick={handleExportZip}
          disabled={images.length === 0}
          title="Export all images as ZIP"
        >
          <DownloadCloud size={16} />
          Export ZIP
          {doneCount > 0 && <span className="toolbar-badge">{doneCount}</span>}
        </button>

        <button
          className="toolbar-btn"
          onClick={handleDownloadAll}
          disabled={images.length === 0}
          title="Download each image individually"
        >
          <Download size={16} /> Download All
        </button>

        <div className="toolbar-divider" />

        <button
          className="toolbar-btn danger"
          onClick={handleClearAll}
          disabled={images.length === 0}
        >
          <Trash2 size={16} /> Clear All
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple
        className="hidden-input" onChange={handleFileChange} />
    </header>
  );
}
