// ─── Print Studio Data Model ──────────────────────────────────────────────────
// Canonical unit: millimeters. Everything is stored in mm.
// Screen pixels are computed at render time: px = mm * pxPerMm(zoom).
// Zoom NEVER modifies stored mm values.

export type PagePreset = 'A4' | 'A3' | 'Legal' | 'B4' | 'Custom';
export type DisplayUnit = 'mm' | 'cm' | 'in';
export type ExportFormat = 'pdf' | 'png' | 'jpeg';

export interface PageSize {
  name: PagePreset;
  /** Page width in mm */
  width_mm: number;
  /** Page height in mm (portrait) */
  height_mm: number;
}

export interface PrintElement {
  id: string;
  /** ID of the source ImageItem in the gallery store */
  sourceImageId: string;
  /** X position of top-left corner in mm from page left */
  x_mm: number;
  /** Y position of top-left corner in mm from page top */
  y_mm: number;
  /** Element width in mm */
  width_mm: number;
  /** Element height in mm */
  height_mm: number;
  /** Rotation in degrees (counter-clockwise positive) */
  rotation_deg: number;
  /** Lock width/height aspect ratio when resizing */
  lockAspect: boolean;
  /** Stack order – higher = on top */
  zIndex: number;
}

export interface PrintDocument {
  id: string;
  name: string;
  page: PageSize;
  /** Whether page is in portrait orientation */
  portrait: boolean;
  elements: PrintElement[];
  /** Optional page margins in mm */
  margins_mm?: { top: number; right: number; bottom: number; left: number };
  exportSettings: {
    dpi: number;
    format: ExportFormat;
  };
}

export interface PrintStudioState {
  documents: PrintDocument[];
  activeDocId: string | null;
  /** Unit shown in UI panels */
  displayUnit: DisplayUnit;
  /** Canvas zoom level (1 = fit, 2 = 2×, etc.). Does NOT change mm values. */
  zoom: number;
  /** ID of the currently selected element on the canvas */
  selectedElementId: string | null;
  /** Whether the Print Preview overlay is open */
  previewOpen: boolean;
}
