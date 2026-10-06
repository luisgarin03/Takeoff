import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LongTaskLoader from "../src/components/LongTaskLoader.jsx";

type LoaderProps = {
  active: boolean;
  label: string;
  delay?: number;
  variant?: string;
  compact?: boolean;
  className?: string;
};

const render = (props: LoaderProps) => renderToStaticMarkup(
  React.createElement(LongTaskLoader, props),
);

test("LongTaskLoader stays out of the DOM while inactive", () => {
  assert.equal(render({ active: false, label: "Loading plan" }), "");
});

test("LongTaskLoader exposes status text immediately and renders four visual bars", () => {
  const html = render({ active: true, label: "Rendering plan" });

  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-atomic="true"/);
  assert.match(html, />Rendering plan<\/span>/);
  assert.match(html, /long-task-loader--inline/);
  assert.match(html, /--long-task-loader-delay:350ms/);
  assert.equal(html.match(/long-task-loader__bar/g)?.length, 4);
  assert.match(html, /long-task-loader__visual" aria-hidden="true"/);
});

test("LongTaskLoader supports placement, compact sizing, custom classes, and safe delay values", () => {
  const html = render({
    active: true,
    label: "Exporting PDF",
    delay: 700,
    variant: "fixed",
    compact: true,
    className: "export-progress",
  });

  assert.match(html, /long-task-loader--fixed/);
  assert.match(html, /long-task-loader--compact/);
  assert.match(html, /export-progress/);
  assert.match(html, /--long-task-loader-delay:700ms/);
  assert.match(render({ active: true, label: "Working", delay: -25, variant: "unknown" }), /long-task-loader--inline/);
  assert.match(render({ active: true, label: "Working", delay: -25 }), /--long-task-loader-delay:0ms/);
});

test("loader styles delay the visual and include motion and high-contrast fallbacks", () => {
  const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");

  assert.match(css, /animation:\s*long-task-loader-reveal 1ms linear var\(--long-task-loader-delay\) both/);
  assert.match(css, /\.long-task-loader--overlay[\s\S]*?pointer-events:\s*none/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.long-task-loader__bar[\s\S]*?animation:\s*none/);
  assert.match(css, /@media \(forced-colors:\s*active\)[\s\S]*?CanvasText/);
});
