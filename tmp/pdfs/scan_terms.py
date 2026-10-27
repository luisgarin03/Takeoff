from pathlib import Path
import re
from pypdf import PdfReader

root = Path(r"C:\Users\luis\Documents\Codex\OpenTakeoff\tmp\pdfs\strasburg\Strasburg Police Station")
terms = re.compile(r"fenc|security gate|323113|32 31 13", re.I)
for pdf in sorted(root.glob("*.pdf")):
    reader = PdfReader(str(pdf))
    print(f"FILE\t{pdf.name}\tPAGES\t{len(reader.pages)}", flush=True)
    for page_number, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ""
        if terms.search(text):
            lines = [line.strip() for line in text.splitlines() if terms.search(line)]
            print(f"PAGE\t{page_number}\t" + " | ".join(lines)[:3000], flush=True)
