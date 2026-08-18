import { useState, useEffect, useCallback } from 'react';
import type { ImageItem, CropData, ImageStatus } from '../types';

const STORAGE_KEY = 'narayan_image_store';
const MAX_STORAGE_IMAGES = 200; // guard against quota errors

// ------------------------------------------------------------------
// Persistence helpers
// ------------------------------------------------------------------

function loadFromStorage(): ImageItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ImageItem[];
  } catch {
    return [];
  }
}

function saveToStorage(images: ImageItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
  } catch (e) {
    // Quota exceeded – silently swallow; data will be in-memory only
    console.warn('LocalStorage quota exceeded', e);
  }
}

// ------------------------------------------------------------------
// Hook
// ------------------------------------------------------------------

export interface UseImageStore {
  images: ImageItem[];
  activeId: string | null;
  activeImage: ImageItem | null;
  /** Add many images at once (accepts File objects) */
  addImages: (files: File[]) => Promise<void>;
  /** Select which image is being edited */
  setActiveId: (id: string | null) => void;
  /** Persist crop/rotate state and mark image as done; optionally advance to next */
  saveImage: (id: string, cropData: CropData, processedDataUrl: string) => void;
  /** Move active selection to the next pending/editing image */
  goToNext: () => void;
  /** Hard-delete an image from the list */
  removeImage: (id: string) => void;
  /** Reset status of a done image back to pending */
  resetImage: (id: string) => void;
  /** Clear all images */
  clearAll: () => void;
  /** Count helpers */
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

export function useImageStore(): UseImageStore {
  const [images, setImages] = useState<ImageItem[]>(() => loadFromStorage());
  const [activeId, setActiveIdState] = useState<string | null>(() => {
    // Restore to the first non-done image
    const saved = loadFromStorage();
    return saved.find((img) => img.status !== 'done')?.id ?? saved[0]?.id ?? null;
  });

  // Persist whenever images change
  useEffect(() => {
    saveToStorage(images);
  }, [images]);

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

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
          addedAt: Date.now(),
          doneAt: null,
        };
      })
    );

    setImages((prev) => {
      // Deduplicate by name+size is not reliable for images, so just append
      const next = [...prev, ...newItems].slice(-MAX_STORAGE_IMAGES);
      return next;
    });

    // Auto-select first new image if nothing is selected
    setActiveIdState((prev) => {
      if (prev) return prev;
      return newItems[0]?.id ?? null;
    });
  }, []);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    if (id) {
      setImages((prev) =>
        prev.map((img) =>
          img.id === id && img.status === 'pending'
            ? { ...img, status: 'editing' }
            : img
        )
      );
    }
  }, []);

  const saveImage = useCallback(
    (id: string, cropData: CropData, processedDataUrl: string) => {
      setImages((prev) =>
        prev.map((img) =>
          img.id === id
            ? {
                ...img,
                cropData,
                processedDataUrl,
                status: 'done',
                doneAt: Date.now(),
              }
            : img
        )
      );
    },
    []
  );

  const goToNext = useCallback(() => {
    setImages((prev) => {
      const currentIndex = prev.findIndex((img) => img.id === activeId);
      // Find next non-done image after current
      const nextImg =
        prev
          .slice(currentIndex + 1)
          .find((img) => img.status !== 'done') ??
        prev.find((img) => img.status !== 'done' && img.id !== activeId);

      if (nextImg) {
        setActiveIdState(nextImg.id);
        // Mark as editing
        return prev.map((img) =>
          img.id === nextImg.id && img.status === 'pending'
            ? { ...img, status: 'editing' }
            : img
        );
      }
      return prev;
    });
  }, [activeId]);

  const removeImage = useCallback(
    (id: string) => {
      setImages((prev) => {
        const next = prev.filter((img) => img.id !== id);
        return next;
      });
      if (activeId === id) {
        setActiveIdState((prev) => {
          if (prev !== id) return prev;
          return null;
        });
      }
    },
    [activeId]
  );

  const resetImage = useCallback((id: string) => {
    setImages((prev) =>
      prev.map((img) =>
        img.id === id
          ? {
              ...img,
              status: 'pending',
              processedDataUrl: null,
              cropData: null,
              doneAt: null,
            }
          : img
      )
    );
  }, []);

  const clearAll = useCallback(() => {
    setImages([]);
    setActiveIdState(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // ------------------------------------------------------------------
  // Derived values
  // ------------------------------------------------------------------

  const activeImage = images.find((img) => img.id === activeId) ?? null;
  const doneCount = images.filter((img) => img.status === 'done').length;
  const pendingCount = images.filter((img) => img.status !== 'done').length;

  return {
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
  };
}
