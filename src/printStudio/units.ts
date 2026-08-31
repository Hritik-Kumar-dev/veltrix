// ─── Page-size presets & unit conversion helpers ─────────────────────────────
// Rule: mm is the ONE canonical unit. All conversions are:
//   mm  → cm:  mm / 10
//   mm  → in:  mm / 25.4
//   cm  → mm:  cm * 10
//   in  → mm:  in * 25.4

import type { DisplayUnit, PageSize, PagePreset } from './types';

// ── Page presets ──────────────────────────────────────────────────────────────

export const PAGE_PRESETS: Record<Exclude<PagePreset, 'Custom'>, PageSize> = {
  A4:    { name: 'A4',    width_mm: 210,  height_mm: 297  },
  A3:    { name: 'A3',    width_mm: 297,  height_mm: 420  },
  Legal: { name: 'Legal', width_mm: 215.9, height_mm: 355.6 },
  B4:    { name: 'B4',    width_mm: 250,  height_mm: 353  },
};

export const PAGE_PRESET_ORDER: Exclude<PagePreset, 'Custom'>[] = ['A4', 'A3', 'Legal', 'B4'];

export function getPageSize(preset: PagePreset, customW?: number, customH?: number): PageSize {
  if (preset === 'Custom') {
    return { name: 'Custom', width_mm: customW ?? 210, height_mm: customH ?? 297 };
  }
  return PAGE_PRESETS[preset];
}

// ── Unit conversions ──────────────────────────────────────────────────────────

/** Convert from mm to the given display unit */
export function mmToDisplay(mm: number, unit: DisplayUnit): number {
  switch (unit) {
    case 'mm': return mm;
    case 'cm': return mm / 10;
    case 'in': return mm / 25.4;
  }
}

/** Convert from the display unit back to mm */
export function displayToMm(value: number, unit: DisplayUnit): number {
  switch (unit) {
    case 'mm': return value;
    case 'cm': return value * 10;
    case 'in': return value * 25.4;
  }
}

/** Format a mm value for display: rounded to 2 decimal places */
export function formatMm(mm: number, unit: DisplayUnit): string {
  const v = mmToDisplay(mm, unit);
  return v.toFixed(unit === 'mm' ? 1 : 2);
}

/** Display unit suffix label */
export const UNIT_LABELS: Record<DisplayUnit, string> = {
  mm: 'mm',
  cm: 'cm',
  in: 'in',
};

// ── Canvas zoom / screen conversion ──────────────────────────────────────────

/** Base px-per-mm at zoom=1 — roughly 3.78 (96 DPI → 1px per 0.2646mm) */
const BASE_PX_PER_MM = 96 / 25.4; // ≈ 3.7795

/**
 * Returns how many CSS pixels represent 1mm at a given zoom level.
 * NOTE: This is purely a rendering concern and must NEVER be written back
 * to any mm-based state.
 */
export function pxPerMm(zoom: number): number {
  return BASE_PX_PER_MM * zoom;
}

/** Convert mm to CSS px at the given zoom level */
export function mmToPx(mm: number, zoom: number): number {
  return mm * pxPerMm(zoom);
}

/** Convert CSS px back to mm at the given zoom level */
export function pxToMm(px: number, zoom: number): number {
  return px / pxPerMm(zoom);
}

// ── DPI-based raster export helpers ──────────────────────────────────────────

const MM_PER_INCH = 25.4;

/** Convert mm to inches */
export function mmToInch(mm: number): number {
  return mm / MM_PER_INCH;
}

/** Compute pixel dimension for raster export: mm / 25.4 * dpi */
export function mmToExportPx(mm: number, dpi: number): number {
  return Math.round(mmToInch(mm) * dpi);
}

// ── ID generation ─────────────────────────────────────────────────────────────

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Default new document factory ──────────────────────────────────────────────

import type { PrintDocument } from './types';

export function createDefaultDocument(name = 'Untitled Layout'): PrintDocument {
  return {
    id: generateId(),
    name,
    page: { ...PAGE_PRESETS.A4 },
    portrait: true,
    elements: [],
    exportSettings: { dpi: 300, format: 'pdf' },
  };
}

// ── Effective page dimensions (respects portrait/landscape) ──────────────────

export function effectivePageSize(doc: PrintDocument): { width_mm: number; height_mm: number } {
  const { width_mm, height_mm } = doc.page;
  if (doc.portrait) return { width_mm, height_mm };
  // Landscape: swap width/height
  return { width_mm: height_mm, height_mm: width_mm };
}
