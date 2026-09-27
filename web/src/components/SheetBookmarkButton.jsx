import React from "react";
import { Icon } from "../brand/icons.jsx";

export default function SheetBookmarkButton({ label, bookmarked, onToggle }) {
  const title = `${bookmarked ? "Remove bookmark from" : "Bookmark"} ${label}`;
  return (
    <button type="button" className="sheet-tab-icon sheet-bookmark" title={title}
      aria-label={title} aria-pressed={bookmarked}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}>
      <Icon name={bookmarked ? "starFilled" : "star"} size={15} />
    </button>
  );
}
