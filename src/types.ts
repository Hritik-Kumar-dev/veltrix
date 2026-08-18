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
  /** Original file name */
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

export interface ImageStore {
  images: ImageItem[];
  activeId: string | null;
}
