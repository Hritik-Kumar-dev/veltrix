export type ImageStatus = 'pending' | 'editing' | 'done';

export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
  scaleX: number;
  scaleY: number;
}

export interface ImageItem {
  /** Unique identifier */
  id: string;
  /** Original file name (never mutated) */
  name: string;
  /** Base64 data URL of the original image */
  originalDataUrl: string;
  /** Base64 data URL of the processed/exported image (set after Save) */
  processedDataUrl: string | null;
  /** Processing status */
  status: ImageStatus;
  /** Saved crop/rotate state so editing can resume */
  cropData: CropData | null;
  /** Timestamp when added */
  addedAt: number;
  /** Timestamp when marked done */
  doneAt: number | null;
}

/** Configuration for the bulk rename feature */
export interface RenameConfig {
  /** Custom prefix string, e.g. "vacation" */
  prefix: string;
  /** If true, keep the original stem in the generated name */
  keepOriginalName: boolean;
  /** The number to start counting from */
  startNumber: number;
  /** Zero-padding width, e.g. 3 → "001" */
  padding: number;
}

export const DEFAULT_RENAME_CONFIG: RenameConfig = {
  prefix: '',
  keepOriginalName: false,
  startNumber: 1,
  padding: 3,
};

export interface ImageStore {
  images: ImageItem[];
  activeId: string | null;
  renameConfig: RenameConfig;
}
