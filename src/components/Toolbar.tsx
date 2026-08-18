import { useRef } from 'react';
import { FolderOpen, Download, DownloadCloud, Trash2, Image } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';
import type { ImageItem } from '../types';

interface Props {
  images: ImageItem[];
  onImport: (files: File[]) => Promise<void>;
  onClearAll: () => void;
  doneCount: number;
}

export function Toolbar({ images, onImport, onClearAll, doneCount }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    await onImport(files);
    toast.success(`Imported ${files.length} image${files.length > 1 ? 's' : ''}`);
    // Reset so same files can be re-imported if needed
    e.target.value = '';
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const downloadSingle = (img: ImageItem) => {
    const src = img.processedDataUrl ?? img.originalDataUrl;
    const a = document.createElement('a');
    a.href = src;
    // Preserve original extension, swap to jpg for processed
    const ext = img.processedDataUrl ? 'jpg' : img.name.split('.').pop() ?? 'jpg';
    a.download = img.name.replace(/\.[^.]+$/, '') + '_processed.' + ext;
    a.click();
  };

  const handleExportSelected = () => {
    const done = images.filter((img) => img.status === 'done');
    if (!done.length) {
      toast.error('No processed images to export.');
      return;
    }
    toast.promise(
      (async () => {
        const zip = new JSZip();
        done.forEach((img) => {
          const base64 = (img.processedDataUrl ?? img.originalDataUrl).split(',')[1];
          const name = img.name.replace(/\.[^.]+$/, '') + '_processed.jpg';
          zip.file(name, base64, { base64: true });
        });
        const blob = await zip.generateAsync({ type: 'blob' });
        saveAs(blob, 'processed_images.zip');
      })(),
      {
        loading: 'Building ZIP…',
        success: `Exported ${done.length} image${done.length > 1 ? 's' : ''}`,
        error: 'Export failed',
      }
    );
  };

  const handleExportOne = () => {
    const done = images.filter((img) => img.status === 'done');
    if (!done.length) {
      toast.error('No processed images to export.');
      return;
    }
    done.forEach(downloadSingle);
    toast.success(`Downloading ${done.length} file${done.length > 1 ? 's' : ''}…`);
  };

  const handleClearAll = () => {
    if (images.length === 0) return;
    if (!confirm('Remove all images and clear local storage? This cannot be undone.')) return;
    onClearAll();
    toast.success('All images cleared');
  };

  return (
    <header className="toolbar">
      {/* Brand */}
      <div className="toolbar-brand">
        <Image size={20} className="brand-icon" />
        <span className="brand-name">BatchCrop</span>
      </div>

      {/* Actions */}
      <div className="toolbar-actions">
        <button className="toolbar-btn primary" onClick={handleImportClick}>
          <FolderOpen size={16} />
          Import Images
        </button>

        <div className="toolbar-divider" />

        <button
          className="toolbar-btn"
          onClick={handleExportSelected}
          disabled={doneCount === 0}
          title="Export all processed images as ZIP"
        >
          <DownloadCloud size={16} />
          Export ZIP
          {doneCount > 0 && <span className="toolbar-badge">{doneCount}</span>}
        </button>

        <button
          className="toolbar-btn"
          onClick={handleExportOne}
          disabled={doneCount === 0}
          title="Download each processed image separately"
        >
          <Download size={16} />
          Download All
        </button>

        <div className="toolbar-divider" />

        <button
          className="toolbar-btn danger"
          onClick={handleClearAll}
          disabled={images.length === 0}
          title="Clear all images"
        >
          <Trash2 size={16} />
          Clear All
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden-input"
        onChange={handleFileChange}
      />
    </header>
  );
}
