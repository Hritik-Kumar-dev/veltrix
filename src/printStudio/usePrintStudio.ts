// ─── usePrintStudio hook ──────────────────────────────────────────────────────
// Manages all Print Studio state. Stored separately from image editor state.
// localStorage key: narayan_print_studio

import { useState, useCallback, useEffect } from 'react';
import type { PrintDocument, PrintElement, PrintStudioState, DisplayUnit, ExportFormat } from './types';
import type { PagePreset } from './types';
import {
  createDefaultDocument, generateId, getPageSize, effectivePageSize,
} from './units';

const STORAGE_KEY = 'narayan_print_studio';

// ── Persistence ───────────────────────────────────────────────────────────────

function loadState(): Partial<PrintStudioState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PrintStudioState>;
  } catch { return {}; }
}

function persistDocs(docs: PrintDocument[]): void {
  try {
    const state = loadState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, documents: docs }));
  } catch (e) { console.warn('Print Studio storage error', e); }
}

function persistMeta(meta: Partial<PrintStudioState>): void {
  try {
    const state = loadState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, ...meta }));
  } catch (e) { console.warn('Print Studio storage error', e); }
}

// ── Initial state factory ─────────────────────────────────────────────────────

function makeInitialState(): PrintStudioState {
  const saved = loadState();
  const docs = (saved.documents ?? []) as PrintDocument[];
  const activeDocId = saved.activeDocId ?? (docs[0]?.id ?? null);
  return {
    documents: docs,
    activeDocId,
    displayUnit: (saved.displayUnit as DisplayUnit) ?? 'mm',
    zoom: 1,
    selectedElementId: null,
    previewOpen: false,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePrintStudio() {
  const [state, setState] = useState<PrintStudioState>(makeInitialState);

  // Persist documents whenever they change
  useEffect(() => { persistDocs(state.documents); }, [state.documents]);
  useEffect(() => {
    persistMeta({
      activeDocId: state.activeDocId,
      displayUnit: state.displayUnit,
    });
  }, [state.activeDocId, state.displayUnit]);

  // ── Computed helpers ────────────────────────────────────────────────────────
  const activeDoc = state.documents.find((d) => d.id === state.activeDocId) ?? null;
  const activeElement =
    activeDoc?.elements.find((e) => e.id === state.selectedElementId) ?? null;

  // ── Document operations ─────────────────────────────────────────────────────

  const newDocument = useCallback(() => {
    const doc = createDefaultDocument();
    setState((prev) => ({
      ...prev,
      documents: [...prev.documents, doc],
      activeDocId: doc.id,
      selectedElementId: null,
      zoom: 1,
    }));
  }, []);

  const setActiveDoc = useCallback((id: string) => {
    setState((prev) => ({ ...prev, activeDocId: id, selectedElementId: null, zoom: 1 }));
  }, []);

  const renameDocument = useCallback((id: string, name: string) => {
    setState((prev) => ({
      ...prev,
      documents: prev.documents.map((d) => (d.id === id ? { ...d, name } : d)),
    }));
  }, []);

  const deleteDocument = useCallback((id: string) => {
    setState((prev) => {
      const docs = prev.documents.filter((d) => d.id !== id);
      const activeDocId =
        prev.activeDocId === id ? (docs[0]?.id ?? null) : prev.activeDocId;
      return { ...prev, documents: docs, activeDocId, selectedElementId: null };
    });
  }, []);

  // ── Page setup ──────────────────────────────────────────────────────────────

  const setPagePreset = useCallback(
    (preset: PagePreset, customW?: number, customH?: number) => {
      setState((prev) => ({
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === prev.activeDocId
            ? { ...d, page: getPageSize(preset, customW, customH) }
            : d
        ),
      }));
    },
    []
  );

  const setPortrait = useCallback((portrait: boolean) => {
    setState((prev) => ({
      ...prev,
      documents: prev.documents.map((d) =>
        d.id === prev.activeDocId ? { ...d, portrait } : d
      ),
    }));
  }, []);

  const setExportSettings = useCallback(
    (settings: Partial<{ dpi: number; format: ExportFormat }>) => {
      setState((prev) => ({
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === prev.activeDocId
            ? { ...d, exportSettings: { ...d.exportSettings, ...settings } }
            : d
        ),
      }));
    },
    []
  );

  // ── Element operations ──────────────────────────────────────────────────────

  /** Add a new element from a gallery image, centered on the page */
  const addElement = useCallback(
    (
      sourceImageId: string,
      initialWidth_mm: number,
      initialHeight_mm: number,
      atX_mm?: number,
      atY_mm?: number
    ) => {
      setState((prev) => {
        const doc = prev.documents.find((d) => d.id === prev.activeDocId);
        if (!doc) return prev;
        const { width_mm, height_mm } = effectivePageSize(doc);
        const x_mm = atX_mm ?? (width_mm - initialWidth_mm) / 2;
        const y_mm = atY_mm ?? (height_mm - initialHeight_mm) / 2;
        const maxZ = doc.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
        const el: PrintElement = {
          id: generateId(),
          sourceImageId,
          x_mm,
          y_mm,
          width_mm: initialWidth_mm,
          height_mm: initialHeight_mm,
          rotation_deg: 0,
          lockAspect: true,
          zIndex: maxZ + 1,
        };
        return {
          ...prev,
          documents: prev.documents.map((d) =>
            d.id === prev.activeDocId
              ? { ...d, elements: [...d.elements, el] }
              : d
          ),
          selectedElementId: el.id,
        };
      });
    },
    []
  );

  /** Update any fields of an element by id */
  const updateElement = useCallback(
    (id: string, patch: Partial<Omit<PrintElement, 'id'>>) => {
      setState((prev) => ({
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === prev.activeDocId
            ? {
                ...d,
                elements: d.elements.map((e) =>
                  e.id === id ? { ...e, ...patch } : e
                ),
              }
            : d
        ),
      }));
    },
    []
  );

  const deleteElement = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      documents: prev.documents.map((d) =>
        d.id === prev.activeDocId
          ? { ...d, elements: d.elements.filter((e) => e.id !== id) }
          : d
      ),
      selectedElementId: prev.selectedElementId === id ? null : prev.selectedElementId,
    }));
  }, []);

  const duplicateElement = useCallback((id: string) => {
    setState((prev) => {
      const doc = prev.documents.find((d) => d.id === prev.activeDocId);
      if (!doc) return prev;
      const el = doc.elements.find((e) => e.id === id);
      if (!el) return prev;
      const maxZ = doc.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
      const copy: PrintElement = {
        ...el,
        id: generateId(),
        x_mm: el.x_mm + 5,
        y_mm: el.y_mm + 5,
        zIndex: maxZ + 1,
      };
      return {
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === prev.activeDocId
            ? { ...d, elements: [...d.elements, copy] }
            : d
        ),
        selectedElementId: copy.id,
      };
    });
  }, []);

  /** Raise element one step in z-order */
  const raiseElement = useCallback((id: string) => {
    setState((prev) => {
      const doc = prev.documents.find((d) => d.id === prev.activeDocId);
      if (!doc) return prev;
      const el = doc.elements.find((e) => e.id === id);
      if (!el) return prev;
      // Find the element with the next-higher zIndex
      const above = doc.elements
        .filter((e) => e.id !== id && e.zIndex > el.zIndex)
        .sort((a, b) => a.zIndex - b.zIndex)[0];
      if (!above) return prev; // already on top
      return {
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === prev.activeDocId
            ? {
                ...d,
                elements: d.elements.map((e) => {
                  if (e.id === id) return { ...e, zIndex: above.zIndex };
                  if (e.id === above.id) return { ...e, zIndex: el.zIndex };
                  return e;
                }),
              }
            : d
        ),
      };
    });
  }, []);

  /** Lower element one step in z-order */
  const lowerElement = useCallback((id: string) => {
    setState((prev) => {
      const doc = prev.documents.find((d) => d.id === prev.activeDocId);
      if (!doc) return prev;
      const el = doc.elements.find((e) => e.id === id);
      if (!el) return prev;
      const below = doc.elements
        .filter((e) => e.id !== id && e.zIndex < el.zIndex)
        .sort((a, b) => b.zIndex - a.zIndex)[0];
      if (!below) return prev; // already on bottom
      return {
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === prev.activeDocId
            ? {
                ...d,
                elements: d.elements.map((e) => {
                  if (e.id === id) return { ...e, zIndex: below.zIndex };
                  if (e.id === below.id) return { ...e, zIndex: el.zIndex };
                  return e;
                }),
              }
            : d
        ),
      };
    });
  }, []);

  // ── Selection / zoom / UI ───────────────────────────────────────────────────

  const selectElement = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, selectedElementId: id }));
  }, []);

  const setZoom = useCallback((zoom: number) => {
    setState((prev) => ({ ...prev, zoom: Math.max(0.2, Math.min(4, zoom)) }));
  }, []);

  const setDisplayUnit = useCallback((unit: DisplayUnit) => {
    setState((prev) => ({ ...prev, displayUnit: unit }));
  }, []);

  const setPreviewOpen = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, previewOpen: open }));
  }, []);

  return {
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
  };
}
