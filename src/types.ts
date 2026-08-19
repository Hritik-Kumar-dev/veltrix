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

/**
 * Resize & Compress settings stored per image.
 * null means "use original dimensions / no size limit".
 */
export interface ResizeCompressConfig {
  /** Target max width in pixels. null = no constraint. */
  maxWidth: number | null;
  /** Target max height in pixels. null = no constraint. */
  maxHeight: number | null;
  /** Whether to lock the output aspect ratio when only one dimension is set. */
  maintainAspectRatio: boolean;
  /** Target max file size in bytes. null = no constraint. */
  maxSizeBytes: number | null;
}

export const DEFAULT_RESIZE_CONFIG: ResizeCompressConfig = {
  maxWidth: null,
  maxHeight: null,
  maintainAspectRatio: true,
  maxSizeBytes: null,
};

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
  /** Resize & Compress settings for this image */
  resizeConfig: ResizeCompressConfig;
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
