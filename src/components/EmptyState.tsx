import { useRef } from 'react';
import { UploadCloud, ArrowLeft } from 'lucide-react';

interface Props {
  hasImages: boolean;
  onImport: (files: File[]) => Promise<void>;
}

export function EmptyState({ hasImages, onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) await onImport(files);
    e.target.value = '';
  };

  return (
    <div className="empty-state">
      {hasImages ? (
        <>
          <ArrowLeft size={40} className="empty-icon muted" />
          <p className="empty-title">Select an image</p>
          <p className="empty-hint">Pick an image from the queue on the left to start editing.</p>
        </>
      ) : (
        <>
          <UploadCloud size={56} className="empty-icon" />
          <p className="empty-title">Import images to get started</p>
          <p className="empty-hint">
            Click the button below or use <strong>Import Images</strong> in the toolbar.
          </p>
          <button className="action-btn primary large" onClick={() => inputRef.current?.click()}>
            <UploadCloud size={18} />
            Choose Images
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden-input"
            onChange={handleChange}
          />
        </>
      )}
    </div>
  );
}
