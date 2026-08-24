import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ImageItem, CropData, ImageStatus, RenameConfig,
  ResizeCompressConfig, EditorGlobals, PendingDelete,
} from '../types';
import { DEFAULT_RENAME_CONFIG, DEFAULT_RESIZE_CONFIG, DEFAULT_EDITOR_GLOBALS } from '../types';

const STORAGE_KEY        = 'narayan_image_store';
const RENAME_KEY         = 'narayan_rename_config';
const GLOBALS_KEY        = 'narayan_editor_globals';
const MAX_STORAGE_IMAGES = 200;

/** How long (ms) the undo banner stays visible before the delete is permanent. */
export const UNDO_DELAY_MS = 5000;

// ── persistence ─────────────────────────────────────────────────────

function loadImages(): ImageItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ImageItem[];
    return parsed.map((img) => ({
      ...img,
      resizeConfig: img.resizeConfig ?? { ...DEFAULT_RESIZE_CONFIG },
    }));
  } catch { return []; }
}

function saveImages(images: ImageItem[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(images)); }
  catch (e) { console.warn('LocalStorage quota exceeded', e); }
}

function loadRenameConfig(): RenameConfig {
  try {
    const raw = localStorage.getItem(RENAME_KEY);
    return raw ? { ...DEFAULT_RENAME_CONFIG, ...(JSON.parse(raw) as RenameConfig) } : DEFAULT_RENAME_CONFIG;
  } catch { return DEFAULT_RENAME_CONFIG; }
}

function saveRenameConfig(cfg: RenameConfig): void {
  try { localStorage.setItem(RENAME_KEY, JSON.stringify(cfg)); } catch { /* swallow */ }
}

function loadEditorGlobals(): EditorGlobals {
  try {
    const raw = localStorage.getItem(GLOBALS_KEY);
    return raw ? { ...DEFAULT_EDITOR_GLOBALS, ...(JSON.parse(raw) as EditorGlobals) } : DEFAULT_EDITOR_GLOBALS;
  } catch { return DEFAULT_EDITOR_GLOBALS; }
}

function saveEditorGlobals(g: EditorGlobals): void {
  try { localStorage.setItem(GLOBALS_KEY, JSON.stringify(g)); } catch { /* swallow */ }
}

// ── hook interface ──────────────────────────────────────────────────

export interface UseImageStore {
  images: ImageItem[];
  activeId: string | null;
  activeImage: ImageItem | null;
  renameConfig: RenameConfig;
  editorGlobals: EditorGlobals;
  /** The most recently deleted item, while the undo window is open. null = no pending undo. */
  pendingDelete: PendingDelete | null;
  addImages: (files: File[]) => Promise<void>;
  /** Add pre-built ImageItems directly (used by PDF import). */
  addImageItems: (items: ImageItem[]) => void;
  setActiveId: (id: string | null) => void;
  saveImage: (id: string, cropData: CropData, processedDataUrl: string) => void;
  goToNext: () => void;
  removeImage: (id: string) => void;
  /** Restore the most recently deleted image to its original position. */
  undoDelete: () => void;
  resetImage: (id: string) => void;
  reorderImages: (fromIndex: number, toIndex: number) => void;
  /** Duplicate an image, inserting the copy immediately after the original. */
  duplicateImage: (id: string) => void;
  setRenameConfig: (cfg: RenameConfig) => void;
  resetRenameConfig: () => void;
  setResizeConfig: (id: string, cfg: ResizeCompressConfig) => void;
  setEditorGlobals: (g: Partial<EditorGlobals>) => void;
  clearAll: () => void;
  doneCount: number;
  pendingCount: number;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── hook ────────────────────────────────────────────────────────────

export function useImageStore(): UseImageStore {
  const [images, setImages]           = useState<ImageItem[]>(() => loadImages());
  const [activeId, setActiveIdState]  = useState<string | null>(() => {
    const saved = loadImages();
    return saved.find((img) => img.status !== 'done')?.id ?? saved[0]?.id ?? null;
  });
  const [renameConfig, setRenameConfigState]     = useState<RenameConfig>(() => loadRenameConfig());
  const [editorGlobals, setEditorGlobalsState]   = useState<EditorGlobals>(() => loadEditorGlobals());

  // ── Undo-delete state (kept inside the store, not in App) ─────────
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  /** Ref to the auto-dismiss timer so we can cancel it on undo or on a new delete. */
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { saveImages(images); },               [images]);
  useEffect(() => { saveRenameConfig(renameConfig); },   [renameConfig]);
  useEffect(() => { saveEditorGlobals(editorGlobals); }, [editorGlobals]);

  // ── addImages ──────────────────────────────────────────────────────
  const addImages = useCallback(async (files: File[]) => {
    const sliced = files.slice(0, MAX_STORAGE_IMAGES);
    const newItems: ImageItem[] = await Promise.all(
      sliced.map(async (file) => {
        const dataUrl = await fileToDataUrl(file);
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          originalDataUrl: dataUrl,
          processedDataUrl: null,
          status: 'pending' as ImageStatus,
          cropData: null,
          resizeConfig: { ...DEFAULT_RESIZE_CONFIG },
          addedAt: Date.now(),
          doneAt: null,
        };
      })
    );
    setImages((prev) => [...prev, ...newItems].slice(-MAX_STORAGE_IMAGES));
    setActiveIdState((prev) => prev ?? newItems[0]?.id ?? null);
  }, []);

  // ── addImageItems (for PDF pages already converted to dataUrls) ────
  const addImageItems = useCallback((items: ImageItem[]) => {
    setImages((prev) => [...prev, ...items].slice(-MAX_STORAGE_IMAGES));
    setActiveIdState((prev) => prev ?? items[0]?.id ?? null);
  }, []);

  // ── setActiveId ───────────────────────────────────────────────────
  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    if (id) {
      setImages((prev) =>
        prev.map((img) =>
          img.id === id && img.status === 'pending' ? { ...img, status: 'editing' } : img
        )
      );
    }
  }, []);

  // ── saveImage ─────────────────────────────────────────────────────
  const saveImage = useCallback(
    (id: string, cropData: CropData, processedDataUrl: string) => {
      setImages((prev) =>
        prev.map((img) =>
          img.id === id
            ? { ...img, cropData, processedDataUrl, status: 'done', doneAt: Date.now() }
            : img
        )
      );
    }, []
  );

  // ── goToNext ──────────────────────────────────────────────────────
  const goToNext = useCallback(() => {
    setImages((prev) => {
      const currentIndex = prev.findIndex((img) => img.id === activeId);
      const nextImg =
        prev.slice(currentIndex + 1).find((img) => img.status !== 'done') ??
        prev.find((img) => img.status !== 'done' && img.id !== activeId);
      if (nextImg) {
        setActiveIdState(nextImg.id);
        return prev.map((img) =>
          img.id === nextImg.id && img.status === 'pending' ? { ...img, status: 'editing' } : img
        );
      }
      return prev;
    });
  }, [activeId]);

  // ── removeImage (with undo support) ──────────────────────────────
  const removeImage = useCallback((id: string) => {
    // Cancel any previous undo timer — the previous pending delete is now permanent
    if (undoTimerRef.current !== null) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    setImages((prev) => {
      const index = prev.findIndex((img) => img.id === id);
      if (index === -1) return prev;

      const image = prev[index];

      // Record the deleted item so the user can undo
      setPendingDelete({ image, index, startedAt: Date.now() });

      // Auto-dismiss the undo banner after UNDO_DELAY_MS
      undoTimerRef.current = setTimeout(() => {
        setPendingDelete(null);
        undoTimerRef.current = null;
      }, UNDO_DELAY_MS);

      return prev.filter((img) => img.id !== id);
    });

    // If we deleted the active image, clear activeId
    setActiveIdState((prev) => (prev === id ? null : prev));
  }, []);

  // ── undoDelete ────────────────────────────────────────────────────
  const undoDelete = useCallback(() => {
    if (undoTimerRef.current !== null) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    setPendingDelete((pd) => {
      if (!pd) return null;
      const { image, index } = pd;

      setImages((prev) => {
        const next = [...prev];
        // Clamp index to valid range in case other operations changed the list
        const clampedIndex = Math.min(index, next.length);
        next.splice(clampedIndex, 0, image);
        return next;
      });

      // Re-activate the restored image
      setActiveIdState(image.id);

      return null;
    });
  }, []);

  // ── resetImage ────────────────────────────────────────────────────
  const resetImage = useCallback((id: string) => {
    setImages((prev) =>
      prev.map((img) =>
        img.id === id
          ? { ...img, status: 'pending', processedDataUrl: null, cropData: null, doneAt: null }
          : img
      )
    );
  }, []);

  // ── reorderImages ─────────────────────────────────────────────────
  const reorderImages = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  // ── duplicateImage ────────────────────────────────────────────────
  const duplicateImage = useCallback((id: string) => {
    setImages((prev) => {
      const index = prev.findIndex((img) => img.id === id);
      if (index === -1) return prev;

      const original = prev[index];
      const duplicate: ImageItem = {
        // Deep-copy all fields so editing the duplicate never mutates the original
        ...original,
        // New unique identity
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        // Append "(copy)" so the duplicate is visually distinguishable in the queue
        name: (() => {
          const dot = original.name.lastIndexOf('.');
          const stem = dot !== -1 ? original.name.slice(0, dot) : original.name;
          const ext  = dot !== -1 ? original.name.slice(dot)    : '';
          return `${stem} (copy)${ext}`;
        })(),
        // New timestamp so it doesn't collide
        addedAt: Date.now(),
        // Copies the full processed state but keeps it independent
        cropData:         original.cropData   ? { ...original.cropData }   : null,
        resizeConfig:     { ...original.resizeConfig },
        processedDataUrl: original.processedDataUrl,
        status:           original.status,
        doneAt:           original.doneAt,
      };

      const next = [...prev];
      // Insert immediately after the original
      next.splice(index + 1, 0, duplicate);
      return next;
    });
  }, []);

  const setRenameConfig    = useCallback((cfg: RenameConfig) => setRenameConfigState(cfg), []);
  const resetRenameConfig  = useCallback(() => setRenameConfigState(DEFAULT_RENAME_CONFIG), []);

  const setResizeConfig = useCallback((id: string, cfg: ResizeCompressConfig) => {
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, resizeConfig: cfg } : img)));
  }, []);

  const setEditorGlobals = useCallback((partial: Partial<EditorGlobals>) => {
    setEditorGlobalsState((prev) => ({ ...prev, ...partial }));
  }, []);

  const clearAll = useCallback(() => {
    // Also clear any pending undo on clear-all
    if (undoTimerRef.current !== null) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setPendingDelete(null);
    setImages([]);
    setActiveIdState(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const activeImage  = images.find((img) => img.id === activeId) ?? null;
  const doneCount    = images.filter((img) => img.status === 'done').length;
  const pendingCount = images.filter((img) => img.status !== 'done').length;

  return {
    images, activeId, activeImage, renameConfig, editorGlobals,
    pendingDelete,
    addImages, addImageItems, setActiveId, saveImage, goToNext,
    removeImage, undoDelete, resetImage, reorderImages, duplicateImage,
    setRenameConfig, resetRenameConfig, setResizeConfig,
    setEditorGlobals, clearAll, doneCount, pendingCount,
  };
}
