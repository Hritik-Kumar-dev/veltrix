import { useState, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import { useImageStore } from './hooks/useImageStore';
import { Toolbar }           from './components/Toolbar';
import { ImageQueue }        from './components/ImageQueue';
import { ImageEditor }       from './components/ImageEditor';
import { EmptyState }        from './components/EmptyState';
import { RenamePage }        from './components/RenamePage';
import { UndoDeleteBanner }  from './components/UndoDeleteBanner';
import { PrintStudio }       from './printStudio/PrintStudio';
import { generateFinalName } from './renameUtils';
import type { CropData, ImageItem } from './types';
import './App.css';

type AppView = 'editor' | 'rename' | 'print';

function App() {
  const {
    images, activeId, activeImage,
    renameConfig, editorGlobals,
    pendingDelete,
    addImages, addImageItems, setActiveId, saveImage, goToNext,
    removeImage, undoDelete, resetImage, reorderImages, duplicateImage,
    setRenameConfig, resetRenameConfig,
    setResizeConfig, setEditorGlobals,
    clearAll, doneCount, pendingCount,
  } = useImageStore();

  const [view, setView] = useState<AppView>('editor');
  /** Live thumbnail from the currently-open editor, updated as the user edits. */
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  const hasNext = images.some((img) => img.status !== 'done' && img.id !== activeId);

  const handleSave = useCallback(
    (id: string, cropData: CropData, dataUrl: string) => saveImage(id, cropData, dataUrl),
    [saveImage]
  );

  const handleSaveAndNext = useCallback(
    (id: string, cropData: CropData, dataUrl: string) => { saveImage(id, cropData, dataUrl); goToNext(); },
    [saveImage, goToNext]
  );

  const getFinalName = useCallback(
    (img: ImageItem, index: number) => generateFinalName(img.name, index, renameConfig),
    [renameConfig]
  );

  return (
    <div className="app-root">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e1e2e', color: '#cdd6f4',
            border: '1px solid #313244', borderRadius: '8px', fontSize: '13px',
          },
        }}
      />

      <Toolbar
        images={images}
        onImport={addImages}
        onImportItems={addImageItems}
        onClearAll={clearAll}
        onNavigateRename={() => setView('rename')}
        onNavigateEditor={() => setView('editor')}
        onNavigatePrint={() => setView('print')}
        view={view}
        doneCount={doneCount}
        getFinalName={getFinalName}
        zipFilename={editorGlobals.zipFilename}
        onZipFilenameChange={(name) => setEditorGlobals({ zipFilename: name })}
      />

      {view === 'rename' && (
        <main className="app-body app-body--full">
          <RenamePage
            images={images}
            config={renameConfig}
            onChange={setRenameConfig}
            onReset={resetRenameConfig}
            onReorder={reorderImages}
          />
        </main>
      )}

      {view === 'editor' && (
        <main className="app-body">
          <ImageQueue
            images={images}
            activeId={activeId}
            renameConfig={renameConfig}
            onSelect={setActiveId}
            onRemove={removeImage}
            onReset={resetImage}
            onReorder={reorderImages}
            onDuplicate={duplicateImage}
            doneCount={doneCount}
            pendingCount={pendingCount}
            previewDataUrl={previewDataUrl}
          />

          <section className="editor-section">
            {activeImage ? (
              <ImageEditor
                key={activeImage.id}
                image={activeImage}
                hasNext={hasNext}
                editorGlobals={editorGlobals}
                onSave={handleSave}
                onNext={goToNext}
                onSaveAndNext={handleSaveAndNext}
                onResizeConfigChange={setResizeConfig}
                onGlobalsChange={setEditorGlobals}
                onPreviewChange={setPreviewDataUrl}
              />
            ) : (
              <EmptyState hasImages={images.length > 0} onImport={addImages} />
            )}
          </section>
        </main>
      )}

      {/* Undo-delete banner — rendered outside the main layout so it floats above everything */}
      {pendingDelete && (
        <UndoDeleteBanner
          pendingDelete={pendingDelete}
          onUndo={undoDelete}
        />
      )}

      {/* Print Studio — full-screen view, outside the editor layout */}
      {view === 'print' && (
        <div className="ps-view">
          <PrintStudio galleryImages={images} />
        </div>
      )}
    </div>
  );
}

export default App;
