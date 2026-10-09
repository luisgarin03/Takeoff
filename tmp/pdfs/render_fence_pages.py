from pathlib import Path
import fitz

pdf = Path(r"C:\Users\luis\Documents\Codex\OpenTakeoff\tmp\pdfs\strasburg\Strasburg Police Station\2026.08.26_Strasburg_PD_IFB_-_Drawings.pdf")
out = Path(r"C:\Users\luis\Documents\Codex\OpenTakeoff\tmp\pdfs\fence_pages")
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(pdf)
for page_number in (6, 7, 8, 18):
    page = doc[page_number - 1]
    text = page.get_text("text")
    (out / f"page-{page_number}.txt").write_text(text, encoding="utf-8")
    pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    pix.save(out / f"page-{page_number}.png")
    print(page_number, page.rect, len(text))
