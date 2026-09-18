# OpenTakeoff

A browser-based construction takeoff canvas. See [the project brief](AGENT_BRIEF.md), [feature map](FEATURES.md), and [user guide](docs/USER_GUIDE.md).

## Features

Measure construction plans with existing canvas tools, snapping, and reports. The optional **Trackpad** control adds relative touch or mouse aiming and tap-to-place without covering the target with your finger. At overview zoom, each finished sheet also has a local preview raster; its Diagnostics control is adjustable from 10–100% of the base raster (50% default), while the full-resolution sheet remains available for normal and detailed viewing.

## What's in the box

The React app is in `web/`. Its virtual trackpad reuses canvas coordinates, snapping, and measurement handlers. Trackpad Settings provides a session-only Show toggle plus live width (50–100vw), height (40–150px), and opacity (35–100%) controls; it defaults to 75vw × 60px at 90% opacity. No extra dependency or persistence is required.

Run `npm install` and `npm run dev` in `web/` with Node 24; validate with `npm run check`.
