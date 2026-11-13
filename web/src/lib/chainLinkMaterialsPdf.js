const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
const MARGIN = 34;
const TABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;
const COLUMNS = [138, 116, 66, 66, TABLE_WIDTH - 386];

function safeText(value) {
  return String(value ?? "").replace(/[\u2010-\u2015]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7e]/g, " ");
}

function wrapText(value, font, size, width) {
  const words = safeText(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/**
 * @param {{ values?: Record<string, unknown>, totalFenceLength?: number, rows?: Array<{ material?: string, dimension?: string, quantity?: string | number, unit?: string, note?: string }>, date?: Date | string }} [options]
 */
export async function createChainLinkMaterialsPdf({ values = {}, totalFenceLength = 0, rows = [], date = new Date() } = {}) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${safeText(values.project || "Chain-Link Materials")} - Supplier Material List`);
  pdf.setSubject("Chain-link fence supplier material breakdown");
  pdf.setCreator("OpenTakeoff");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.10, 0.16, 0.27);
  const blue = rgb(0.13, 0.25, 0.78);
  const pale = rgb(0.93, 0.95, 0.98);
  const border = rgb(0.81, 0.84, 0.89);
  const ink = rgb(0.14, 0.17, 0.22);
  const muted = rgb(0.36, 0.40, 0.47);
  const lineHeight = 10;
  let page;
  let y;
  let pageNumber = 0;

  const text = (value, x, top, size, font = regular, color = ink) => page.drawText(safeText(value), { x, y: PAGE_HEIGHT - top - size, size, font, color });
  const rect = (x, top, width, height, color, outline = border) => page.drawRectangle({ x, y: PAGE_HEIGHT - top - height, width, height, color, borderColor: outline, borderWidth: 0.6 });
  const rule = (top) => page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - top }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - top }, thickness: 0.5, color: border });

  function startPage() {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pageNumber += 1;
    if (pageNumber === 1) {
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 104, width: PAGE_WIDTH, height: 104, color: navy });
      text("OPENTAKEOFF  /  WHITEBOARD SUPPLIER ORDER", MARGIN, 19, 8, bold, rgb(0.70, 0.79, 1));
      text("Chain-Link Fence Materials", MARGIN, 37, 22, bold, rgb(1, 1, 1));
      text(values.project || "Project not specified", MARGIN, 69, 11, bold, rgb(1, 1, 1));
      text(`Material: ${values.material || "Chain-link fence"}     Finish: ${values.finish || "Not specified"}`, MARGIN, 86, 9, regular, rgb(0.88, 0.91, 0.97));
      const dateString = date instanceof Date ? date.toLocaleDateString("en-US") : String(date);
      const totalLabel = `${Number(totalFenceLength || 0).toLocaleString("en-US")} linear feet`;
      text(`PREPARED ${dateString}`, PAGE_WIDTH - MARGIN - 180, 27, 8, regular, rgb(0.88, 0.91, 0.97));
      text(`TOTAL FENCE LENGTH  ${totalLabel}`, PAGE_WIDTH - MARGIN - 180, 54, 9, bold, rgb(1, 1, 1));
      text("Review dimensions and quantities with the supplier before ordering.", MARGIN, 115, 8, regular, muted);
      y = 136;
    } else {
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 48, width: PAGE_WIDTH, height: 48, color: navy });
      text("CHAIN-LINK FENCE MATERIALS", MARGIN, 17, 11, bold, rgb(1, 1, 1));
      text(`${safeText(values.project || "Project not specified")}  -  continued`, PAGE_WIDTH - MARGIN - 260, 19, 9, regular, rgb(0.88, 0.91, 0.97));
      y = 64;
    }
    drawTableHeader();
  }

  function drawTableHeader() {
    const headerHeight = 25;
    rect(MARGIN, y, TABLE_WIDTH, headerHeight, blue, blue);
    const labels = ["MATERIAL", "DIMENSIONS", "QUANTITY", "UNIT", "CALCULATION / NOTES"];
    let x = MARGIN;
    labels.forEach((label, index) => {
      text(label, x + 7, y + 8, 7, bold, rgb(1, 1, 1));
      x += COLUMNS[index];
    });
    y += headerHeight;
  }

  function drawFooter() {
    rule(PAGE_HEIGHT - 31);
    text("OpenTakeoff  |  Chain-link supplier material breakdown", MARGIN, PAGE_HEIGHT - 23, 7, regular, muted);
    text(`Page ${pageNumber}`, PAGE_WIDTH - MARGIN - 40, PAGE_HEIGHT - 23, 7, regular, muted);
  }

  startPage();
  for (const row of rows) {
    const cells = [row.material, row.dimension, String(row.quantity ?? ""), row.unit, row.note];
    const sizes = [8.5, 8, 8.5, 8, 7.5];
    const lines = cells.map((cell, index) => wrapText(cell, index === 0 ? bold : regular, sizes[index], COLUMNS[index] - 14));
    const rowHeight = Math.max(27, Math.max(...lines.map((cellLines) => cellLines.length)) * lineHeight + 12);
    if (y + rowHeight > PAGE_HEIGHT - 42) {
      drawFooter();
      startPage();
    }
    page.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - y - rowHeight, width: TABLE_WIDTH, height: rowHeight, color: rows.indexOf(row) % 2 === 0 ? rgb(1, 1, 1) : pale, borderColor: border, borderWidth: 0.45 });
    let x = MARGIN;
    lines.forEach((cellLines, index) => {
      cellLines.slice(0, 6).forEach((line, lineIndex) => text(line, x + 7, y + 7 + lineIndex * lineHeight, sizes[index], index === 0 ? bold : regular, index === 4 ? muted : ink));
      x += COLUMNS[index];
    });
    y += rowHeight;
  }
  drawFooter();
  return pdf.save();
}
