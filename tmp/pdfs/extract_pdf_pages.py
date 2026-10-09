import sys
from pathlib import Path

from pypdf import PdfReader


pdf = Path(sys.argv[1])
pages = {int(value) for value in sys.argv[2:]}
reader = PdfReader(str(pdf))
for page_number in sorted(pages):
    print(f"===== PAGE {page_number} =====")
    print(reader.pages[page_number - 1].extract_text() or "")
