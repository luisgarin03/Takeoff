import React from "react";
import { Icon } from "../brand/icons.jsx";

export default function SheetBookmarkButton({ label, bookmarked, onToggle, favorite = false, markedUp = false }) {
  if (markedUp && !favorite) {
    const title = `${label} has saved markups`;
    return (
      <span className="sheet-tab-icon sheet-bookmark sheet-markup-indicator" title={title} role="img" aria-label={title}>
        <Icon name="pencil" size={15} />
      </span>
    );
  }
  const title = favorite
    ? (bookmarked ? `Remove ${label} from favorite files` : `Add ${label} to favorite files`)
    : `${bookmarked ? "Remove bookmark from" : "Bookmark"} ${label}`;
  return (
    <button type="button" className="sheet-tab-icon sheet-bookmark" title={title}
      aria-label={title} aria-pressed={bookmarked}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}>
      <Icon name={bookmarked ? "starFilled" : "star"} size={15} />
    </button>
  );
}
