/**
 * pdfUtils.ts
 *
 * Client-side PDF → image conversion using pdfjs-dist.
 * Each page of the PDF is rasterised to a canvas at 150 DPI (scale=2)
 * and returned as a JPEG data URL.  The resulting objects are shaped to
 * match ImageItem so they can be added to the store via addImageItems().
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { ImageItem, ImageStatus } from './types';
import { DEFAULT_RESIZE_CONFIG } from './types';

// Point pdfjs at its bundled worker.  Vite resolves the ?url suffix to a
// hashed asset path at build time while keeping it fully functional in dev.
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Convert every page of a PDF File into an ImageItem-compatible object.
 *
 * @param file   The PDF File selected by the user.
 * @param scale  Canvas render scale (2 = ~150 dpi on 96-dpi screens). Default 2.
 * @returns      Array of ImageItem objects, one per PDF page, in page order.
 */
export async function pdfToImageItems(
  file: File,
  scale = 2,
): Promise<ImageItem[]> {
  // Read the file as an ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Load the PDF document
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const totalPages = pdf.numPages;
  const baseName   = file.name.replace(/\.pdf$/i, '');

  const items: ImageItem[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page     = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // Create an off-screen canvas sized to this page's viewport
    const canvas  = document.createElement('canvas');
    canvas.width  = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context for PDF canvas');

    // Render the page into the canvas
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Convert to a JPEG data URL (quality 0.92 matches the editor save path)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // Build the page label: "document_p001.jpg", "document_p002.jpg" …
    const paddedPage = String(pageNum).padStart(String(totalPages).length, '0');
    const name       = totalPages === 1
      ? `${baseName}.jpg`
      : `${baseName}_p${paddedPage}.jpg`;

    items.push({
      id:               `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      originalDataUrl:  dataUrl,
      processedDataUrl: null,
      status:           'pending' as ImageStatus,
      cropData:         null,
      resizeConfig:     { ...DEFAULT_RESIZE_CONFIG },
      addedAt:          Date.now(),
      doneAt:           null,
    });
  }

  return items;
}
