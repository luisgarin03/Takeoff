import { SHARING_UI_ENABLED } from "../lib/sharingVisibility.js";
import React, { useRef, useState } from "react";
import guide from "../../../docs/USER_GUIDE.md?raw";
import { Icon } from "../brand/icons.jsx";
import googleDriveLogo from "../brand/google-drive.png";
import { MEASURE_TOOLS, CUT_TOOLS, MARKUP_TOOLS } from "../lib/canvasConstants.js";
import "./manual.css";

const images = import.meta.glob("../../../docs/img/*", { eager: true, query: "?url", import: "default" });
const visibleGuide = SHARING_UI_ENABLED ? guide : guide.replace(/### Share a project from your Google Drive[\s\S]*?(?=\n## )/, "");
const chapters = visibleGuide.replace(/\r\n/g, "\n").split(/^## /m).slice(1).map((text, i) => {
  const [title, ...body] = text.split("\n");
  return { id: `manual-chapter-${i}`, title, body: body.join("\n") };
});
function Inline({ text }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <kbd key={i}>{part.slice(1, -1)}</kbd>;
    if (part.startsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return /^https:\/\//.test(link[2]) ? <a key={i} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a> : link[1];
    return part;
  });
}
function References({ title }) {
  let tools = [...MEASURE_TOOLS, ...CUT_TOOLS].filter((t) => title.toLowerCase().startsWith(t.label.toLowerCase()));
  if (/cut out/i.test(title)) tools = CUT_TOOLS;
  if (/markup tools/i.test(title)) tools = MARKUP_TOOLS;
  const extra = /opening plans|sheet gallery/.test(title.toLowerCase()) ? [{ icon: "plus", label: "Open" }, { icon: "sheets", label: "Sheets" }]
    : /scale —|calibrate from|standard scales|adopting/.test(title.toLowerCase()) ? [{ label: "Set scale…" }, { label: "Calibrate two points…" }]
    : /conditions —|creating, editing|takeoffs panel/i.test(title) ? [{ label: "Takeoffs" }, { label: "+ condition" }]
    : /saving,|project details|saving and reopening/i.test(title) ? [{ icon: "document", label: "Project" }, { label: "Save project…" }, { label: "Open Recent" }]
    : /report &|exports$/i.test(title) ? [{ label: "REPORT" }]
    : /import from schedule/i.test(title) ? [{ label: "Schedule" }]
    : /pan & zoom/i.test(title) ? [{ label: "Pan", shortcut: "P" }, { label: "+" }, { label: "−" }, { label: "fit" }]
    : /snap/i.test(title) ? [{ label: "Snap" }]
    : /angle lock/i.test(title) ? [{ label: "45°" }]
    : /whiteboard/i.test(title) ? [{ icon: "rectTool", label: "Whiteboard" }] : [];
  tools = [...tools, ...extra];
  return tools.length ? <div className="manual-buttons" aria-label="App button references">{tools.map((t) => <span className="manual-button" key={t.label}>{t.icon && <Icon name={t.icon} size={17} />}<span>{t.label}</span>{t.shortcut && <kbd>{t.shortcut}</kbd>}</span>)}</div> : null;
}
function Blocks({ text, chapter }) {
  return text.split(/\n\s*\n/).map((block, i) => {
    const heading = block.match(/^### (.+)$/);
    if (heading) return <header className="manual-section-heading" key={i} id={`${chapter}-${i}`}><h3><Inline text={heading[1]} /></h3><References title={heading[1]} /></header>;
    const img = block.match(/<img src="img\/([^"]+)" alt="([^"]*)"[^>]*\/>/);
    if (img) return <figure key={i}><img src={images[`../../../docs/img/${img[1]}`]} alt={img[2]} loading="lazy" /><figcaption>{img[2]} — app documentation reference.</figcaption></figure>;
    if (/^---\s*$/.test(block) || !block.trim()) return null;
    if (/^```/.test(block)) return <pre key={i}>{block.replace(/^```[^\n]*\n/, "").replace(/\n```$/, "")}</pre>;
    const lines = block.split("\n");
    if (lines.every((line) => /^[-*] /.test(line))) return <ul key={i}>{lines.map((line, j) => <li key={j}><Inline text={line.slice(2)} /></li>)}</ul>;
    if (lines.every((line) => /^\d+\. /.test(line))) return <ol key={i}>{lines.map((line, j) => <li key={j}><Inline text={line.replace(/^\d+\. /, "")} /></li>)}</ol>;
    if (lines.length > 1 && lines[0].startsWith("|")) {
      const rows = lines.filter((line) => !/^\|[\s:|-]+\|$/.test(line)).map((line) => line.replace(/^\||\|$/g, "").split("|"));
      return <div className="manual-table" key={i}><table><thead><tr>{rows[0].map((cell, j) => <th key={j}><Inline text={cell.trim()} /></th>)}</tr></thead><tbody>{rows.slice(1).map((row, j) => <tr key={j}>{row.map((cell, k) => <td key={k}><Inline text={cell.trim()} /></td>)}</tr>)}</tbody></table></div>;
    }
    return <p key={i}><Inline text={block} /></p>;
  });
}
export default function ManualContent() {
  const [active, setActive] = useState(0);
  const article = useRef(null);
  const chapter = chapters[active];
  return <div className="manual-layout">
    <nav className="manual-index" aria-label="Manual topics"><strong>CONTENTS</strong>{chapters.map((item, i) => <button key={item.id} aria-current={i === active ? "page" : undefined} onClick={() => { setActive(i); article.current.scrollTop = 0; }}>{item.title.includes("Google Drive Cloud Sync") && <img className="manual-drive-logo" src={googleDriveLogo} alt="" width={18} height={18} />}{item.title.replace(/`/g, "")}</button>)}</nav>
    <article className="manual-article" ref={article} aria-label={chapter.title}>
      <h2>{chapter.title.includes("Google Drive Cloud Sync") && <img className="manual-drive-logo" src={googleDriveLogo} alt="" width={26} height={26} />}{chapter.title}</h2><References title={chapter.title.replace(/^\d+\. /, "")} />
      <p className="manual-hint">Button pictures identify controls in the estimating workspace. Keyboard shortcuts appear beside them.</p>
      <Blocks text={chapter.body} chapter={chapter.id} />
    </article>
  </div>;
}
