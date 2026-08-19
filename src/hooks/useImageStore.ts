import { useState, useEffect, useCallback } from 'react';
import type { ImageItem, CropData, ImageStatus, RenameConfig, ResizeCompressConfig, EditorGlobals } from '../types';
import { DEFAULT_RENAME_CONFIG, DEFAULT_RESIZE_CONFIG, DEFAULT_EDITOR_GLOBALS } from '../types';

const STORAGE_KEY   = 'narayan_image_store';
const RENAME_KEY    = 'narayan_rename_config';
const GLOBALS_KEY   = 'narayan_editor_globals';
const MAX_STORAGE_IMAGES = 200;

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
  addImages: (files: File[]) => Promise<void>;
  setActiveId: (id: string | null) => void;
  saveImage: (id: string, cropData: CropData, processedDataUrl: string) => void;
  goToNext: () => void;
  removeImage: (id: string) => void;
  resetImage: (id: string) => void;
  reorderImages: (fromIndex: number, toIndex: number) => void;
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

  useEffect(() => { saveImages(images); },               [images]);
  useEffect(() => { saveRenameConfig(renameConfig); },   [renameConfig]);
  useEffect(() => { saveEditorGlobals(editorGlobals); }, [editorGlobals]);

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

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
    setActiveIdState((prev) => (prev === id ? null : prev));
  }, []);

  const resetImage = useCallback((id: string) => {
    setImages((prev) =>
      prev.map((img) =>
        img.id === id
          ? { ...img, status: 'pending', processedDataUrl: null, cropData: null, doneAt: null }
          : img
      )
    );
  }, []);

  const reorderImages = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
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
    setImages([]);
    setActiveIdState(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const activeImage  = images.find((img) => img.id === activeId) ?? null;
  const doneCount    = images.filter((img) => img.status === 'done').length;
  const pendingCount = images.filter((img) => img.status !== 'done').length;

  return {
    images, activeId, activeImage, renameConfig, editorGlobals,
    addImages, setActiveId, saveImage, goToNext,
    removeImage, resetImage, reorderImages,
    setRenameConfig, resetRenameConfig, setResizeConfig,
    setEditorGlobals, clearAll, doneCount, pendingCount,
  };
}
