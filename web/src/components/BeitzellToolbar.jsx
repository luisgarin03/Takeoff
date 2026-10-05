import React, { createContext, useEffect, useId, useRef, useState } from "react";
import "../styles/toolbarTabs.css";

// Menus use a portal in scrollable toolbar panels and close when their tab hides.
export const ToolbarPanelContext = createContext(null);
const TABS = ["Project", "Sheets", "Takeoff"];

export default function BeitzellToolbar({ logo, account, project, sheets, takeoff }) {
  const [active, setActive] = useState("Takeoff");
  const id = useId();
  const tabsRef = useRef(null);
  useEffect(() => {
    const tabs = tabsRef.current;
    const reveal = () => {
      const selected = tabs?.querySelector('[aria-selected="true"]');
      if (!selected) return;
      const bounds = tabs.getBoundingClientRect(), button = selected.getBoundingClientRect();
      if (button.right > bounds.right) tabs.scrollLeft += button.right - bounds.right + 4;
      else if (button.left < bounds.left) tabs.scrollLeft -= bounds.left - button.left + 4;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(tabs);
    return () => observer.disconnect();
  }, [active]);
  const panels = { Project: project, Sheets: sheets, Takeoff: takeoff };
  function onKeyDown(event) {
    const index = Math.max(0, TABS.indexOf(event.target.textContent));
    const next = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1
      : event.key === "ArrowRight" ? (index + 1) % TABS.length
        : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length : null;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    setActive(TABS[next]);
    document.getElementById(`${id}-${TABS[next]}`)?.focus();
  }
  return <div className="estimating-toolbar">
    <div className="estimating-toolbar-header">
      <div className="estimating-toolbar-logo">{logo}</div>
      <div ref={tabsRef} className="estimating-toolbar-tabs" role="tablist" aria-label="Estimating toolbar" onKeyDown={onKeyDown}>
        {TABS.map((tab) => <button key={tab} type="button" role="tab" id={`${id}-${tab}`}
          aria-selected={active === tab} aria-expanded={active === tab} aria-controls={`${id}-${tab}-panel`} tabIndex={active === tab || (active === null && tab === TABS[0]) ? 0 : -1}
          onClick={() => setActive((current) => current === tab ? null : tab)}>{tab}</button>)}
      </div>
      <ToolbarPanelContext.Provider value={true}><div className="estimating-toolbar-account">{account}</div></ToolbarPanelContext.Provider>
    </div>
    {TABS.map((tab) => <ToolbarPanelContext.Provider key={tab} value={active === tab}>
      <div className="estimating-toolbar-panel" role="tabpanel" id={`${id}-${tab}-panel`}
        aria-labelledby={`${id}-${tab}`} hidden={active !== tab} tabIndex={0}>
        {panels[tab]}
      </div>
    </ToolbarPanelContext.Provider>)}
  </div>;
}
