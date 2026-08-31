/**
 * estimatePhotoRegion.ts
 *
 * Expands a face bounding box into an estimated passport/ID-photo crop
 * rectangle using fixed proportion rules.
 *
 * All margin constants live in PASSPORT_CROP_RATIOS — a single object that
 * is easy to find and tune after real-world testing.
 */

import type { FaceBox } from './detectFaces';

// ── Tunable constants — edit these after real-world testing ───────────────────

/**
 * Proportional margins and target aspect ratio for passport-style photos.
 *
 * Every margin is a *multiplier* of the corresponding face dimension:
 *   topMargin    × faceHeight  = pixels added ABOVE the face top
 *   bottomMargin × faceHeight  = pixels added BELOW the face bottom
 *   sideMargin   × faceWidth   = pixels added to EACH horizontal side
 *
 * After applying margins the box is resized (centered) to match
 * targetAspectRatio (width ÷ height).
 *
 * Standard passport photo dimensions:
 *   35 × 45 mm  →  aspect ≈ 0.778  (7/9)
 *   2 × 2 inch  →  aspect = 1.0
 * Adjust targetAspectRatio to match the form you're processing.
 */
export const PASSPORT_CROP_RATIOS = {
  /** Headroom above the detected face (fraction of face height). */
  topMargin: 0.15,
  /** Space below the chin (fraction of face height). */
  bottomMargin: 0.25,
  /** Space on each side of the face (fraction of face width). */
  sideMargin: 0.26,
  /** Final crop width ÷ height. 7/9 ≈ 0.778 for standard 35×45 mm format. */
  targetAspectRatio: 7 / 9,
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Expand `faceBox` into a passport-photo crop region using `ratios`.
 *
 * @param faceBox       Detected face bounding box in original image pixels.
 * @param imageWidth    Full original image width in pixels.
 * @param imageHeight   Full original image height in pixels.
 * @param ratios        Margin + aspect ratio config. Defaults to PASSPORT_CROP_RATIOS.
 * @returns             Crop region in original image pixels, clamped to image bounds.
 */
export function estimatePhotoRegion(
  faceBox: FaceBox,
  imageWidth: number,
  imageHeight: number,
  ratios: typeof PASSPORT_CROP_RATIOS = PASSPORT_CROP_RATIOS,
): CropRegion {
  const { topMargin, bottomMargin, sideMargin, targetAspectRatio } = ratios;

  // ── 1. Apply margins around the face ──────────────────────────────────────
  const expandTop    = faceBox.height * topMargin;
  const expandBottom = faceBox.height * bottomMargin;
  const expandSide   = faceBox.width  * sideMargin;

  let x = faceBox.x - expandSide;
  let y = faceBox.y - expandTop;
  let w = faceBox.width  + expandSide * 2;
  let h = faceBox.height + expandTop + expandBottom;

  // ── 2. Enforce targetAspectRatio by expanding the shorter axis ────────────
  //    We always expand (never shrink) so we don't lose content.
  const currentAspect = w / h;
  if (currentAspect < targetAspectRatio) {
    // Box is too tall — widen it
    const targetW = h * targetAspectRatio;
    const delta   = targetW - w;
    x -= delta / 2;
    w  = targetW;
  } else if (currentAspect > targetAspectRatio) {
    // Box is too wide — taller it
    const targetH = w / targetAspectRatio;
    const delta   = targetH - h;
    y -= delta / 2;
    h  = targetH;
  }

  // ── 3. Clamp to image bounds ───────────────────────────────────────────────
  //    Strategy: clamp position first, then shrink dimensions if they still
  //    overflow (this can distort the aspect ratio slightly, but it's better
  //    than returning coordinates outside the image).
  x = Math.max(0, x);
  y = Math.max(0, y);
  w = Math.min(w, imageWidth  - x);
  h = Math.min(h, imageHeight - y);

  // Ensure non-zero size
  w = Math.max(1, w);
  h = Math.max(1, h);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width:  Math.round(w),
    height: Math.round(h),
  };
}
