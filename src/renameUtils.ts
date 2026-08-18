import type { RenameConfig } from './types';

/**
 * Given an ImageItem's original name, its 0-based position index,
 * and the active RenameConfig, return the generated final filename.
 *
 * Examples:
 *   prefix="vacation", keepOriginal=false, start=1, padding=3, index=0
 *   → "vacation_001.jpg"
 *
 *   prefix="product", keepOriginal=true, start=5, padding=2, index=0
 *   → "product_my-photo_05.jpg"
 *
 *   prefix="", keepOriginal=false, start=1, padding=1, index=2
 *   → "3.jpg"
 */
export function generateFinalName(
  originalName: string,
  index: number,
  config: RenameConfig
): string {
  const { prefix, keepOriginalName, startNumber, padding } = config;

  // Extract extension (with dot), e.g. ".jpg"
  const dotIdx = originalName.lastIndexOf('.');
  const ext = dotIdx !== -1 ? originalName.slice(dotIdx) : '';
  const stem = dotIdx !== -1 ? originalName.slice(0, dotIdx) : originalName;

  // Build padded number
  const num = startNumber + index;
  const padded = String(num).padStart(padding, '0');

  // Assemble parts
  const parts: string[] = [];

  if (prefix.trim()) parts.push(prefix.trim());
  if (keepOriginalName) parts.push(stem);
  parts.push(padded);

  return parts.join('_') + ext;
}

/**
 * Generate final names for a full ordered list of images.
 * Returns a Map<id, finalName> for O(1) lookups.
 */
export function generateAllFinalNames(
  images: { id: string; name: string }[],
  config: RenameConfig
): Map<string, string> {
  const map = new Map<string, string>();
  images.forEach((img, idx) => {
    map.set(img.id, generateFinalName(img.name, idx, config));
  });
  return map;
}
