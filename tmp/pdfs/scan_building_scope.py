import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


root = Path(sys.argv[1])
out = Path(sys.argv[2])
terms = re.compile(
    r"(?:\bbuilding\s*208\b|\bbldg\.?\s*208\b|\blot\s*208\b|"
    r"\bbuilding\s*[abc]\b|\bbldg\.?\s*[abc]\b|\blot\s*20[1-4]\b|"
    r"\bproposed\s+building\b|\bproject\s+(?:consists|scope)\b|"
    r"\bsingle[- ]story\b|\bwarehouse\s+shell\b|\bphase\s*[123]\b)",
    re.IGNORECASE,
)

inventory = []
matches = []
errors = []
for pdf in sorted(root.rglob("*.pdf")):
    try:
        reader = PdfReader(str(pdf))
        inventory.append({"file": str(pdf), "pages": len(reader.pages)})
        for page_no, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
            hits = []
            for idx, line in enumerate(lines):
                if terms.search(line):
                    context = " | ".join(
                        value for value in lines[max(0, idx - 2):min(len(lines), idx + 4)] if value
                    )
                    if context and context not in hits:
                        hits.append(context)
            if hits:
                matches.append({"file": str(pdf), "page": page_no, "hits": hits})
    except Exception as exc:
        errors.append({"file": str(pdf), "error": str(exc)})

out.write_text(
    json.dumps({"inventory": inventory, "matches": matches, "errors": errors}, indent=2),
    encoding="utf-8",
)
print(
    f"files={len(inventory)} pages={sum(item['pages'] for item in inventory)} "
    f"matching_pages={len(matches)} errors={len(errors)} output={out}"
)
