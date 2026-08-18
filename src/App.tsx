import { Toaster } from 'react-hot-toast';
import { useImageStore } from './hooks/useImageStore';
import { Toolbar } from './components/Toolbar';
import { ImageQueue } from './components/ImageQueue';
import { ImageEditor } from './components/ImageEditor';
import { EmptyState } from './components/EmptyState';
import type { CropData } from './types';
import './App.css';

function App() {
  const {
    images,
    activeId,
    activeImage,
    addImages,
    setActiveId,
    saveImage,
    goToNext,
    removeImage,
    resetImage,
    clearAll,
    doneCount,
    pendingCount,
  } = useImageStore();

  const hasNext =
    images.some((img) => img.status !== 'done' && img.id !== activeId) ||
    images.some((img) => img.status !== 'done' && img.id !== activeId);

  const handleSave = (id: string, cropData: CropData, dataUrl: string) => {
    saveImage(id, cropData, dataUrl);
  };

  const handleSaveAndNext = (id: string, cropData: CropData, dataUrl: string) => {
    saveImage(id, cropData, dataUrl);
    goToNext();
  };

  return (
    <div className="app-root">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e1e2e',
            color: '#cdd6f4',
            border: '1px solid #313244',
            borderRadius: '8px',
            fontSize: '13px',
          },
        }}
      />

      {/* Top toolbar */}
      <Toolbar
        images={images}
        onImport={addImages}
        onClearAll={clearAll}
        doneCount={doneCount}
      />

      {/* Main body */}
      <main className="app-body">
        {/* Left queue */}
        <ImageQueue
          images={images}
          activeId={activeId}
          onSelect={setActiveId}
          onRemove={removeImage}
          onReset={resetImage}
          doneCount={doneCount}
          pendingCount={pendingCount}
        />

        {/* Center editor / empty state */}
        <section className="editor-section">
          {activeImage ? (
            <ImageEditor
              key={activeImage.id}
              image={activeImage}
              hasNext={hasNext}
              onSave={handleSave}
              onNext={goToNext}
              onSaveAndNext={handleSaveAndNext}
            />
          ) : (
            <EmptyState hasImages={images.length > 0} onImport={addImages} />
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
