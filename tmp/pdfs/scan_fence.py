from pathlib import Path
import re
from pypdf import PdfReader

root = Path(r"C:\Users\luis\Documents\Codex\OpenTakeoff\tmp\pdfs\strasburg")
for pdf in root.rglob("*.pdf"):
    reader = PdfReader(str(pdf))
    print(f"FILE\t{pdf}\tPAGES\t{len(reader.pages)}", flush=True)
    for page_number, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ""
        hits = [line.strip() for line in text.splitlines() if re.search(r"fenc", line, re.I)]
        if hits:
            print(f"PAGE\t{page_number}\t" + " | ".join(hits)[:4000], flush=True)
