/* eslint-disable @typescript-eslint/no-explicit-any */
import * as pdfjsLib from "pdfjs-dist";

export interface LineRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
}

/**
 * Extracts visual line bounding boxes from a rendered PDF page.
 * Groups contiguous words on matching horizontal baselines.
 */
export async function extractLineRects(
  page: pdfjsLib.PDFPageProxy,
  viewport: pdfjsLib.PageViewport
): Promise<LineRect[]> {
  const textContent = await page.getTextContent();
  const lines: LineRect[] = [];

  textContent.items.forEach((item: any, idx: number) => {
    if (!item.str || item.str.trim() === "") return;

    // Transform PDF coordinates into viewport/canvas pixels
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    const x = tx[4];
    const y = tx[5] - fontHeight;
    const width = item.width * (viewport.scale / (viewport.scale / 1.5));
    const height = fontHeight * 1.2;

    // Baseline grouping with a vertical tolerance of 5px
    const existing = lines.find((l) => Math.abs(l.top - y) < 5);
    if (existing) {
      existing.width = Math.max(existing.width, x + width - existing.left);
      existing.text += " " + item.str;
    } else {
      lines.push({
        id: `line-${idx}`,
        left: x,
        top: y,
        width: width,
        height: height,
        text: item.str,
      });
    }
  });

  return lines;
}
