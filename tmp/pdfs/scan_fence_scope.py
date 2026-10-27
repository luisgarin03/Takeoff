import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


root = Path(sys.argv[1])
out = Path(sys.argv[2])
terms = re.compile(
    r"\b(?:fenc(?:e|ing)|guard\s*rail|guardrail|hand\s*rail|handrail|rail(?:ing)?|"
    r"bollard|gate|chain\s*link|picket|ornamental|privacy|barrier|screen(?:ing)?|enclosure|"
    r"toe\s*board|safety\s*rail)\b",
    re.IGNORECASE,
)

results = []
errors = []
for pdf in sorted(root.rglob("*.pdf")):
    try:
        reader = PdfReader(str(pdf))
        for page_no, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
            hits = []
            for idx, line in enumerate(lines):
                if terms.search(line):
                    start = max(0, idx - 2)
                    end = min(len(lines), idx + 4)
                    context = " | ".join(x for x in lines[start:end] if x)
                    if context and context not in hits:
                        hits.append(context)
            if hits:
                results.append({
                    "file": str(pdf),
                    "page": page_no,
                    "hits": hits,
                })
    except Exception as exc:
        errors.append({"file": str(pdf), "error": str(exc)})

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({"results": results, "errors": errors}, indent=2), encoding="utf-8")
print(f"matches={len(results)} errors={len(errors)} output={out}")
