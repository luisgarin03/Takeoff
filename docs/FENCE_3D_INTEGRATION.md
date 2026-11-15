# 3D Fence Generator integration

- `web/src/pages/TakeoffCanvas.jsx` owns committed linear takeoffs, sheet selection, the active project, and rendering. Its normalized vertices are relative to the rotated PDF viewport. The canvas supplies immutable inputs, opens the workspace beside the plan, and uses its existing selection callback to highlight a source run.
- `web/src/lib/panelGeometry.js` defines the baseline calibration in feet per raster pixel. The adapter uses the effective scale and dimensions of the open canvas where available. For other pages it reads the rotated PDF viewport with the existing document loader. PDF screen transforms never enter the adapter.
- `web/src/lib/chainLinkFence.js` supplies closed-loop, maximum spacing, manual marker and shared-post IDs. The adapter keeps geometry scoped to one sheet and connects separate runs only through explicit shared-post IDs.
- `web/src/lib/shapeCommands.js`, the PDF renderer, whiteboard, and estimating modules keep their current entry points. The viewer derives its model from committed shapes, so edits and undo/redo feed the same model.
- `web/src/lib/projectFile.js` serializes the annotation payload. The canvas adds a versioned, optional `fence_3d` field for design and display settings. No copy of PDF coordinates or takeoff quantities is stored.
- The feature owns its specification editor, layout, material report, and Three.js scene. Gate openings and quantity overrides are design inputs to that scene and report. The existing estimate continues to use the saved 2D measurements.
