import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { createFenceScene, disposeFenceScene } from "./scene.js";
import { createOrnamentalScene } from "./ornamentalScene.js";
import { createGuardrailScene } from "./guardrailScene.js";
import { FITTINGS, METERS_PER_FOOT as FT } from "./settings.js";
import { createOtk3dArchive, createStandaloneViewer, fenceExportName } from "./export.js";
import { FENCE_COMPONENT_COLORS } from "./colorMap.js";

const DIRECTIONS = { Iso: [1, .8, 1], Top: [0, 1, .0001], Front: [0, 0, 1], Side: [1, 0, 0] };
const fittingKinds = new Set(FITTINGS.map(([id]) => id));
const formatLength = (meters, units) => `${(units === "metric" ? meters : meters / FT).toFixed(2)} ${units === "metric" ? "m" : "ft"}`;
const runtimeSize = (host) => [Math.max(1, host.clientWidth), Math.max(1, host.clientHeight)];
const CLOSE_VIEW_METERS = .004;
const CLOSE_DOLLY_METERS = .25;
const WHEEL_METERS_PER_100PX = 1;
const PAN_METERS_PER_PIXEL = .01;
const CAMERA_LOOK_RADIANS_PER_PIXEL = .003;

function createControls(camera, canvas) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enableRotate = false;
  controls.zoomToCursor = true;
  controls.minDistance = CLOSE_DOLLY_METERS;
  return controls;
}

function syncCameraLookTarget(runtime) {
  const forward = runtime.camera.getWorldDirection(new T.Vector3());
  const distance = Math.max(CLOSE_DOLLY_METERS, runtime.cameraTargetDistance || runtime.controls.getDistance() || 1);
  runtime.controls.target.copy(runtime.camera.position).addScaledVector(forward, distance);
  runtime.controls.update();
}

function turnCamera(runtime, deltaX, deltaY) {
  const rotation = new T.Euler().setFromQuaternion(runtime.camera.quaternion, "YXZ");
  rotation.y -= deltaX * CAMERA_LOOK_RADIANS_PER_PIXEL;
  rotation.x = T.MathUtils.clamp(rotation.x - deltaY * CAMERA_LOOK_RADIANS_PER_PIXEL, -Math.PI / 2 + .01, Math.PI / 2 - .01);
  runtime.camera.rotation.order = "YXZ";
  runtime.camera.rotation.set(rotation.x, rotation.y, rotation.z, "YXZ");
  syncCameraLookTarget(runtime);
}

function updateControlSpeeds(runtime) {
  const { controls, orthoHeight, camera, renderer } = runtime;
  controls.maxZoom = orthoHeight / CLOSE_VIEW_METERS;
  controls.minZoom = .001;
  controls.zoomSpeed = 1;
  const viewportHeight = Math.max(1, renderer.domElement.clientHeight);
  const viewHeight = camera.isPerspectiveCamera
    ? 2 * Math.max(controls.getDistance(), controls.minDistance) * Math.tan(T.MathUtils.degToRad(camera.fov / 2))
    : (camera.top - camera.bottom) / camera.zoom;
  controls.panSpeed = PAN_METERS_PER_PIXEL * viewportHeight / Math.max(viewHeight, CLOSE_VIEW_METERS);
  controls.rotateSpeed = 1;
}

function moveCameraWithWheel(runtime, event) {
  const { camera, controls, renderer } = runtime;
  if (!event.deltaY) return;
  const deltaPixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? renderer.domElement.clientHeight : 1);
  event.preventDefault();
  event.stopImmediatePropagation();
  const movement = T.MathUtils.clamp(-deltaPixels * WHEEL_METERS_PER_100PX / 100, -2, 2);
  if (camera.isPerspectiveCamera) {
    const forward = camera.getWorldDirection(new T.Vector3()).multiplyScalar(movement);
    camera.position.add(forward);
    controls.target.add(forward);
  } else {
    const currentHeight = runtime.orthoHeight / camera.zoom;
    const nextHeight = T.MathUtils.clamp(currentHeight - movement, CLOSE_VIEW_METERS, runtime.orthoHeight * 1000);
    camera.zoom = runtime.orthoHeight / nextHeight;
    camera.updateProjectionMatrix();
  }
  controls.update();
  updateControlSpeeds(runtime);
}

function frameBounds(runtime, bounds, direction = "Iso") {
  const { camera, controls, host } = runtime;
  const size = bounds.getSize(new T.Vector3());
  const center = bounds.getCenter(new T.Vector3());
  const radius = Math.max(size.length() / 2, .5);
  const [width, height] = runtimeSize(host);
  const aspect = width / height;
  const distance = radius / Math.sin(Math.atan(Math.tan(T.MathUtils.degToRad(20)) * Math.min(aspect, 1)));
  controls.target.copy(center);
  const viewDirection = direction?.isVector3 ? direction.clone().normalize() : new T.Vector3(...DIRECTIONS[direction]).normalize();
  camera.position.copy(center).addScaledVector(viewDirection, distance);
  camera.near = .002;
  camera.far = Math.max(200, distance * 12);
  const rotation = new T.Matrix4().lookAt(camera.position, center, camera.up);
  const inverse = rotation.invert();
  const viewBounds = new T.Box3();
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) viewBounds.expandByPoint(new T.Vector3(x, y, z).applyMatrix4(inverse));
    }
  }
  const projected = viewBounds.getSize(new T.Vector3());
  runtime.orthoHeight = Math.max(projected.y, projected.x / aspect, 1) * 1.32;
  runtime.cameraTargetDistance = distance;
  camera.zoom = 1;
  resize(runtime);
  controls.update();
  updateControlSpeeds(runtime);
}

function frame(runtime, direction = "Iso") {
  if (runtime.flyMode) finishFly(runtime);
  const bounds = !runtime.model?.children.length && runtime.plan
    ? new T.Box3().setFromObject(runtime.plan) : runtime.bounds;
  frameBounds(runtime, bounds, direction);
}

function focusSelection(runtime) {
  if (runtime.flyMode) finishFly(runtime);
  const markupPoints = runtime.selectedMarkup?.points;
  const bounds = markupPoints?.length
    ? new T.Box3().setFromPoints(markupPoints)
    : runtime.selectionBounds;
  if (!bounds || bounds.isEmpty()) { frame(runtime); return; }
  const viewDirection = runtime.camera.position.clone().sub(runtime.controls.target);
  if (viewDirection.lengthSq() < 1e-8) viewDirection.set(...DIRECTIONS.Iso);
  frameBounds(runtime, bounds, viewDirection.normalize());
}

function resize(runtime) {
  const [w, h] = runtimeSize(runtime.host);
  const { camera, orthoHeight } = runtime;
  if (camera.isOrthographicCamera) {
    camera.left = -orthoHeight * w / h / 2; camera.right = -camera.left;
    camera.top = orthoHeight / 2; camera.bottom = -camera.top;
  } else camera.aspect = w / h;
  camera.updateProjectionMatrix();
  runtime.renderer.setSize(w, h);
  runtime.labelsRenderer.setSize(w, h);
}

function finishFly(runtime) {
  if (!runtime.flyMode) return;
  runtime.flyMode = false;
  runtime.flyKeys.clear();
  runtime.pointerLockAcquired = false;
  runtime.flyPointerDragging = false;
  window.clearTimeout(runtime.flyLockTimer);
  runtime.renderer.domElement.style.cursor = "";
  runtime.controls.enabled = true;
  const forward = runtime.camera.getWorldDirection(new T.Vector3());
  runtime.cameraTargetDistance = runtime.flyOrbitDistance || runtime.cameraTargetDistance;
  runtime.controls.target.copy(runtime.camera.position).addScaledVector(forward, runtime.flyOrbitDistance || 1);
  runtime.controls.update();
  runtime.onFlyChange?.(false);
  runtime.onFlyError?.("");
  if (document.pointerLockElement === runtime.renderer.domElement) document.exitPointerLock();
}

function enableDragLook(runtime) {
  if (!runtime.flyMode) return;
  runtime.flyMouseLookFallback = true;
  runtime.renderer.domElement.style.cursor = "grab";
  runtime.onFlyError?.("Pointer lock is blocked here. Drag inside the 3D view to look; WASD movement still works.");
}

function turnFlyCamera(runtime, deltaX, deltaY) {
  runtime.flyYaw -= deltaX * .0025;
  runtime.flyPitch = T.MathUtils.clamp(runtime.flyPitch - deltaY * .0025, -Math.PI / 2 + .01, Math.PI / 2 - .01);
  runtime.camera.rotation.set(runtime.flyPitch, runtime.flyYaw, 0, "YXZ");
}

function startFly(runtime) {
  if (runtime.flyMode) return;
  if (runtime.camera.isOrthographicCamera) setCamera(runtime, "perspective");
  const canvas = runtime.renderer.domElement;
  runtime.flyOrbitDistance = Math.max(1, runtime.controls.getDistance());
  const rotation = new T.Euler().setFromQuaternion(runtime.camera.quaternion, "YXZ");
  runtime.flyYaw = rotation.y;
  runtime.flyPitch = rotation.x;
  runtime.camera.rotation.order = "YXZ";
  runtime.camera.zoom = 1;
  runtime.camera.updateProjectionMatrix();
  runtime.flyMode = true;
  runtime.pointerLockAcquired = false;
  runtime.flyMouseLookFallback = false;
  runtime.flyKeys.clear();
  runtime.controls.enabled = false;
  canvas.tabIndex = 0;
  canvas.focus({ preventScroll: true });
  runtime.onFlyChange?.(true);
  if (!canvas.requestPointerLock) { enableDragLook(runtime); return; }
  try {
    const request = canvas.requestPointerLock();
    request?.catch?.(() => {
      enableDragLook(runtime);
    });
    runtime.flyLockTimer = window.setTimeout(() => {
      if (!runtime.flyMode || document.pointerLockElement === canvas) return;
      enableDragLook(runtime);
    }, 1200);
  } catch {
    enableDragLook(runtime);
  }
}

function moveFly(runtime, seconds) {
  if (!runtime.flyMode || seconds <= 0) return;
  const keys = runtime.flyKeys;
  const forward = runtime.camera.getWorldDirection(runtime.flyForward);
  const right = runtime.flyRight.set(1, 0, 0).applyQuaternion(runtime.camera.quaternion);
  const movement = runtime.flyMovement.set(0, 0, 0);
  if (keys.has("KeyW")) movement.add(forward);
  if (keys.has("KeyS")) movement.sub(forward);
  if (keys.has("KeyD")) movement.add(right);
  if (keys.has("KeyA")) movement.sub(right);
  if (keys.has("Space")) movement.y += 1;
  if (keys.has("ControlLeft") || keys.has("ControlRight") || keys.has("KeyC")) movement.y -= 1;
  if (movement.lengthSq() === 0) return;
  const speed = Math.max(1.5, runtime.bounds.getSize(runtime.flyBoundsSize).length() * .04) * runtime.flySpeedMultiplier *
    (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 3 : 1);
  movement.normalize().multiplyScalar(speed * seconds);
  runtime.camera.position.add(movement);
  runtime.camera.getWorldDirection(runtime.flyForward);
  runtime.controls.target.copy(runtime.camera.position).addScaledVector(runtime.flyForward, runtime.flyOrbitDistance);
}

function setCamera(runtime, mode) {
  if (runtime.flyMode) finishFly(runtime);
  if (runtime.camera.isOrthographicCamera === (mode === "orthographic")) return;
  const previous = runtime.camera;
  const camera = mode === "orthographic" ? new T.OrthographicCamera() : new T.PerspectiveCamera(40);
  camera.position.copy(previous.position);
  camera.quaternion.copy(previous.quaternion);
  camera.near = previous.near; camera.far = previous.far;
  const target = runtime.controls.target.clone();
  runtime.cameraTargetDistance = runtime.camera.position.distanceTo(target);
  runtime.controls.dispose();
  runtime.camera = camera;
  runtime.controls = createControls(camera, runtime.renderer.domElement);
  runtime.controls.target.copy(target);
  runtime.controls.addEventListener("change", runtime.updateZoom);
  resize(runtime);
  runtime.controls.update();
  updateControlSpeeds(runtime);
}

function setMarkupTargetSelected(target, selected) {
  if (!target) return;
  for (const object of target.objects || []) {
    if (!object.material?.color) continue;
    if (selected) {
      object.userData.markupBaseColor ||= object.material.color.clone();
      object.material.color.set("#b03a26");
    } else if (object.userData.markupBaseColor) object.material.color.copy(object.userData.markupBaseColor);
  }
  for (const element of target.elements || []) element.classList.toggle("is-selected", selected);
}

function clearMarkupSelection(runtime) {
  setMarkupTargetSelected(runtime.selectedMarkup, false);
  runtime.selectedMarkup = null;
  if (runtime.selectedMarkupControl) {
    runtime.selectedMarkupControl.element.remove();
    runtime.selectedMarkupControl.removeFromParent();
    runtime.selectedMarkupControl = null;
  }
}

function selectMarkup(runtime, target, anchor) {
  clearMarkupSelection(runtime);
  runtime.selectedMarkup = target;
  setMarkupTargetSelected(target, true);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "fence3d-markup-delete";
  button.textContent = "×";
  button.title = `Delete selected ${target.kind}`;
  button.setAttribute("aria-label", `Delete selected ${target.kind}`);
  button.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const selected = runtime.selectedMarkup;
    if (!selected) return;
    clearMarkupSelection(runtime);
    if (selected.kind === "measure") {
      runtime.measurePending = null;
      clearMeasurement(runtime);
      runtime.onMarkupDelete?.("measure", selected.id);
    } else runtime.onMarkupDelete?.(selected.kind === "drawing" ? "drawings" : "notes", selected.id);
  });
  const control = new CSS2DObject(button);
  control.position.copy(anchor).add(new T.Vector3(0, .22, 0));
  runtime.scene.add(control);
  runtime.selectedMarkupControl = control;
}

function clearMeasurement(runtime) {
  if (runtime.selectedMarkup?.kind === "measure") clearMarkupSelection(runtime);
  runtime.measureTarget = null;
  if (!runtime.measureGroup) return;
  runtime.measureGroup.traverse((object) => { if (object instanceof CSS2DObject) object.element.remove(); });
  runtime.measureGroup.removeFromParent();
  disposeFenceScene(runtime.measureGroup);
  runtime.measureGroup = null;
  runtime.measureDistance = null;
  runtime.measureResultElement = null;
}

function clearAnnotations(runtime) {
  if (["drawing", "note"].includes(runtime.selectedMarkup?.kind)) clearMarkupSelection(runtime);
  if (!runtime.annotationGroup) return;
  runtime.annotationGroup.traverse((object) => { if (object instanceof CSS2DObject) object.element.remove(); });
  runtime.annotationGroup.removeFromParent();
  disposeFenceScene(runtime.annotationGroup);
  runtime.annotationGroup = null;
  runtime.annotationTargets = [];
}

function updateAnnotations(runtime, annotations) {
  clearAnnotations(runtime);
  runtime.annotations = annotations;
  const group = runtime.annotationGroup = new T.Group();
  group.name = "Ground drawings and notes";
  for (const drawing of annotations.drawings || []) {
    if (drawing.points.length < 2) continue;
    const points = drawing.points.map(([x, z]) => new T.Vector3(x, .025, z));
    const line = new T.Line(new T.BufferGeometry().setFromPoints(points),
      new T.LineBasicMaterial({ color: "#e15d2a", depthTest: false, depthWrite: false }));
    line.renderOrder = 1000;
    group.add(line);
    runtime.annotationTargets.push({ kind: "drawing", id: drawing.id, points, anchor: points[Math.floor(points.length / 2)].clone(), objects: [line], elements: [] });
  }
  for (const note of annotations.notes || []) {
    const [x, z] = note.point;
    const marker = new T.Mesh(new T.SphereGeometry(.045, 10, 6), new T.MeshBasicMaterial({ color: "#d04b22", depthTest: false }));
    marker.position.set(x, .035, z);
    marker.renderOrder = 1001;
    group.add(marker);
    const element = document.createElement("span");
    element.className = "fence3d-note-label";
    element.textContent = note.text;
    const label = new CSS2DObject(element);
    label.position.set(x, .16, z);
    group.add(label);
    runtime.annotationTargets.push({ kind: "note", id: note.id, points: [new T.Vector3(x, .16, z)], anchor: new T.Vector3(x, .16, z), objects: [marker], elements: [element] });
  }
  runtime.scene.add(group);
}

function groundPointAt(runtime, clientX, clientY) {
  const bounds = runtime.renderer.domElement.getBoundingClientRect();
  const ray = new T.Raycaster();
  ray.setFromCamera(new T.Vector2((clientX - bounds.left) / bounds.width * 2 - 1,
    1 - (clientY - bounds.top) / bounds.height * 2), runtime.camera);
  const point = ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), new T.Vector3());
  if (!point) return null;
  return nearestMeasureSnap(runtime, point, clientX, clientY, bounds) || point;
}

function clearDrawPreview(runtime) {
  if (runtime.drawPreview) {
    runtime.drawPreview.removeFromParent();
    runtime.drawPreview.geometry.dispose();
    runtime.drawPreview.material.dispose();
    runtime.drawPreview = null;
  }
  runtime.drawingPoints = null;
}

function updateDrawPreview(runtime) {
  const points = runtime.drawingPoints || [];
  if (points.length < 2) return;
  if (!runtime.drawPreview) {
    runtime.drawPreview = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: "#e15d2a", depthTest: false, depthWrite: false }));
    runtime.drawPreview.renderOrder = 1001;
    runtime.scene.add(runtime.drawPreview);
  }
  runtime.drawPreview.geometry.dispose();
  runtime.drawPreview.geometry = new T.BufferGeometry().setFromPoints(points.map((point) => new T.Vector3(point.x, .04, point.z)));
}

function nearestMeasureSnap(runtime, point, clientX, clientY, bounds) {
  let nearest = null;
  let nearestPixels = 12;
  for (const candidate of runtime.measureSnapPoints) {
    const projected = candidate.screen.clone().project(runtime.camera);
    if (projected.z < -1 || projected.z > 1) continue;
    const x = bounds.left + (projected.x + 1) * bounds.width / 2;
    const y = bounds.top + (1 - projected.y) * bounds.height / 2;
    const pixels = Math.hypot(x - clientX, y - clientY);
    if (pixels < nearestPixels) { nearest = candidate; nearestPixels = pixels; }
  }
  return nearest?.ground.clone() || null;
}

function groundMeasureText(distance, units) {
  return `${(units === "metric" ? distance : distance / FT).toFixed(2)} ${units === "metric" ? "m" : "ft"}`;
}

function addMeasurePoint(runtime, point, units) {
  clearMarkupSelection(runtime);
  const addLabel = (text, position) => {
    const element = document.createElement("span");
    element.className = "fence3d-measure-label";
    element.textContent = text;
    const object = new CSS2DObject(element);
    object.position.copy(position);
    runtime.measureGroup.add(object);
    return element;
  };
  const addMarker = (location, name) => {
    const marker = new T.Mesh(new T.SphereGeometry(.055, 12, 8), new T.MeshBasicMaterial({ color: "#7047b8", depthTest: false }));
    marker.position.set(location.x, .035, location.z);
    marker.renderOrder = 1001;
    runtime.measureGroup.add(marker);
    const element = addLabel(name, new T.Vector3(location.x, .16, location.z));
    return { marker, element };
  };
  const selected = point.clone();
  selected.y = 0;
  if (!runtime.measurePending) {
    clearMeasurement(runtime);
    runtime.measureGroup = new T.Group();
    runtime.measureGroup.name = "Ground measurement";
    runtime.scene.add(runtime.measureGroup);
    runtime.measurePending = selected;
    addMarker(selected, "A");
    runtime.onMeasureChange?.("Point A set. Click the second ground point.");
    return;
  }
  const start = runtime.measurePending;
  runtime.measurePending = null;
  const markerA = [...runtime.measureGroup.children].find((object) => object.isMesh);
  const labelA = [...runtime.measureGroup.children].find((object) => object instanceof CSS2DObject)?.element;
  const markerB = addMarker(selected, "B");
  const a = new T.Vector3(start.x, .035, start.z);
  const b = new T.Vector3(selected.x, .035, selected.z);
  const line = new T.Line(new T.BufferGeometry().setFromPoints([a, b]),
    new T.LineBasicMaterial({ color: "#7047b8", depthTest: false, depthWrite: false }));
  line.renderOrder = 1000;
  runtime.measureGroup.add(line);
  const distance = Math.hypot(selected.x - start.x, selected.z - start.z);
  runtime.measureDistance = distance;
  runtime.measureResultElement = addLabel(groundMeasureText(distance, units), a.clone().add(b).multiplyScalar(.5).add(new T.Vector3(0, .2, 0)));
  runtime.measureTarget = {
    kind: "measure", id: "ground-measurement", points: [a, b], anchor: a.clone().add(b).multiplyScalar(.5),
    objects: [markerA, markerB.marker, line].filter(Boolean), elements: [labelA, markerB.element, runtime.measureResultElement].filter(Boolean),
  };
  runtime.onMeasureChange?.(`Ground distance: ${groundMeasureText(distance, units)}. Turn Measure off, then click the line to select and delete it.`);
}

function projectMarkupPoint(runtime, point, bounds) {
  const projected = point.clone().project(runtime.camera);
  if (projected.z < -1 || projected.z > 1) return null;
  return { x: bounds.left + (projected.x + 1) * bounds.width / 2, y: bounds.top + (1 - projected.y) * bounds.height / 2 };
}

function distanceToScreenSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared ? T.MathUtils.clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1) : 0;
  return { distance: Math.hypot(point.x - (start.x + dx * fraction), point.y - (start.y + dy * fraction)), fraction };
}

function pickMarkupAt(runtime, clientX, clientY, bounds) {
  const cursor = { x: clientX, y: clientY };
  let nearest = null;
  let nearestDistance = 13;
  const targets = [...runtime.annotationTargets, ...(runtime.measureTarget ? [runtime.measureTarget] : [])];
  for (const target of targets) {
    if ((target.elements || []).some((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    })) return { target, anchor: target.anchor.clone() };
    if (target.points.length === 1) {
      const screen = projectMarkupPoint(runtime, target.points[0], bounds);
      if (!screen) continue;
      const distance = Math.hypot(cursor.x - screen.x, cursor.y - screen.y);
      if (distance < nearestDistance) { nearest = { target, anchor: target.anchor.clone() }; nearestDistance = distance; }
      continue;
    }
    for (let index = 1; index < target.points.length; index++) {
      const start = projectMarkupPoint(runtime, target.points[index - 1], bounds);
      const end = projectMarkupPoint(runtime, target.points[index], bounds);
      if (!start || !end) continue;
      const hit = distanceToScreenSegment(cursor, start, end);
      if (hit.distance < nearestDistance) {
        nearestDistance = hit.distance;
        nearest = { target, anchor: target.points[index - 1].clone().lerp(target.points[index], hit.fraction) };
      }
    }
  }
  return nearest;
}

function createRuntime(host, pick, onFlyChange, onFlyError, onFlySpeedChange, onMeasureChange,
  onAnnotationModeChange, onAnnotationStatusChange, onDrawComplete, onNotePoint, onMarkupDelete, flySpeed) {
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  const scene = new T.Scene();
  scene.background = new T.Color("#dce5ec");
  const pmrem = new T.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();
  const labelsRenderer = new CSS2DRenderer();
  labelsRenderer.domElement.className = "fence3d-labels";
  host.append(renderer.domElement, labelsRenderer.domElement);
  const light = new T.DirectionalLight("#fff4df", 2.6);
  light.position.set(17, 30, 11);
  scene.add(new T.HemisphereLight("#eaf5ff", "#747d81", 1.2), light);
  const camera = new T.PerspectiveCamera(40);
  const controls = createControls(camera, renderer.domElement);
  const runtime = { host, renderer, scene, camera, controls, light, labelsRenderer, orthoHeight: 10,
    bounds: new T.Box3(new T.Vector3(-4, 0, -4), new T.Vector3(4, 3, 4)), settings: {},
    model: null, grid: null, labels: null, mapLabels: null, baseMaterialColors: new WeakMap(), focus: null,
    detail: [],
    flyMode: false, flyKeys: new Set(), flyForward: new T.Vector3(), flyRight: new T.Vector3(),
    flyMovement: new T.Vector3(), flyBoundsSize: new T.Vector3(), flySpeedMultiplier: flySpeed,
    onFlyChange, onFlyError, onFlySpeedChange, onMeasureChange, onMarkupDelete, measureMode: false, measureSnapPoints: [],
    measurePending: null, measureGroup: null, measureTarget: null, annotationMode: "", annotationGroup: null,
    annotationTargets: [], selectedMarkup: null, selectedMarkupControl: null,
    onAnnotationModeChange, onAnnotationStatusChange, onDrawComplete, onNotePoint, drawingPoints: null, drawPreview: null };
  runtime.updateZoom = () => updateControlSpeeds(runtime);
  controls.addEventListener("change", runtime.updateZoom);
  const flyCodes = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyC", "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight"]);
  const keyDown = (event) => {
    if (!runtime.flyMode && event.code === "Escape" && runtime.annotationMode) {
      event.preventDefault();
      event.stopPropagation();
      clearDrawPreview(runtime);
      runtime.annotationMode = "";
      runtime.controls.enabled = true;
      renderer.domElement.style.cursor = "";
      runtime.onAnnotationModeChange?.("");
      runtime.onAnnotationStatusChange?.("");
      return;
    }
    if (event.code === "KeyF" && !event.repeat
      && !event.target?.closest?.("input, textarea, select, [contenteditable]")) {
      event.preventDefault();
      event.stopPropagation();
      focusSelection(runtime);
      return;
    }
    if (!runtime.flyMode) return;
    if (event.code === "Escape" && !runtime.pointerLockAcquired) {
      event.preventDefault();
      event.stopPropagation();
      finishFly(runtime);
      return;
    }
    if (["Equal", "NumpadAdd", "Minus", "NumpadSubtract"].includes(event.code)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      const adjustment = event.code === "Equal" || event.code === "NumpadAdd" ? 1 : -1;
      const nextSpeed = T.MathUtils.clamp(runtime.flySpeedMultiplier + adjustment, 1, 50);
      if (nextSpeed !== runtime.flySpeedMultiplier) {
        runtime.flySpeedMultiplier = nextSpeed;
        runtime.onFlySpeedChange?.(nextSpeed);
      }
      return;
    }
    if (!flyCodes.has(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    runtime.flyKeys.add(event.code);
  };
  const keyUp = (event) => {
    if (!flyCodes.has(event.code)) return;
    runtime.flyKeys.delete(event.code);
    if (runtime.flyMode) { event.preventDefault(); event.stopPropagation(); }
  };
  const pointerLockChange = () => {
    if (document.pointerLockElement === renderer.domElement) {
      runtime.pointerLockAcquired = true;
      runtime.flyMouseLookFallback = false;
      runtime.flyPointerDragging = false;
      renderer.domElement.style.cursor = "";
      window.clearTimeout(runtime.flyLockTimer);
      return;
    }
    if (runtime.flyMode && runtime.pointerLockAcquired) finishFly(runtime);
  };
  const mouseMove = (event) => {
    if (!runtime.flyMode || document.pointerLockElement !== renderer.domElement) return;
    runtime.pointerLockAcquired = true;
    turnFlyCamera(runtime, event.movementX, event.movementY);
  };
  const dragLook = (event) => {
    if (runtime.annotationMode === "draw" && runtime.drawingPoints) {
      const point = groundPointAt(runtime, event.clientX, event.clientY);
      const last = runtime.drawingPoints.at(-1);
      if (point && last.distanceTo(point) > .025) {
        runtime.drawingPoints.push(point);
        updateDrawPreview(runtime);
      }
      return;
    }
    if (!runtime.flyMode && runtime.lookPointer?.pointerId === event.pointerId) {
      const pointer = runtime.lookPointer;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (!pointer.active && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 5) {
        pointer.active = true;
        press = null;
        renderer.domElement.style.cursor = "grabbing";
      }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (pointer.active) {
        event.preventDefault();
        turnCamera(runtime, dx, dy);
      }
      return;
    }
    if (!runtime.flyMode || !runtime.flyMouseLookFallback || !runtime.flyPointerDragging ||
      event.pointerId !== runtime.flyPointerId) return;
    turnFlyCamera(runtime, event.clientX - runtime.flyPointerX, event.clientY - runtime.flyPointerY);
    runtime.flyPointerX = event.clientX;
    runtime.flyPointerY = event.clientY;
  };
  const hoverMarkup = (event) => {
    if (runtime.flyMode || runtime.measureMode || runtime.annotationMode || event.buttons !== 0) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    renderer.domElement.style.cursor = pickMarkupAt(runtime, event.clientX, event.clientY, bounds) ? "pointer" : "";
  };
  const clearFlyKeys = () => runtime.flyKeys.clear();
  document.addEventListener("keydown", keyDown, true);
  document.addEventListener("keyup", keyUp, true);
  document.addEventListener("pointerlockchange", pointerLockChange);
  document.addEventListener("visibilitychange", clearFlyKeys);
  window.addEventListener("blur", clearFlyKeys);
  renderer.domElement.addEventListener("mousemove", mouseMove);
  renderer.domElement.addEventListener("pointermove", dragLook);
  renderer.domElement.addEventListener("pointermove", hoverMarkup);
  let press;
  const down = (event) => {
    if (runtime.flyMode) {
      press = null;
      if (runtime.flyMouseLookFallback && event.button === 0) {
        runtime.flyPointerDragging = true;
        runtime.flyPointerId = event.pointerId;
        runtime.flyPointerX = event.clientX;
        runtime.flyPointerY = event.clientY;
        renderer.domElement.style.cursor = "grabbing";
        try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* drag continues inside the canvas */ }
      }
      return;
    }
    if (runtime.annotationMode === "draw" && event.button === 0) {
      press = null;
      const point = groundPointAt(runtime, event.clientX, event.clientY);
      if (!point) { runtime.onAnnotationStatusChange?.("Click and drag on the visible ground to draw."); return; }
      runtime.drawingPoints = [point];
      try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* drawing continues while the pointer remains over the canvas */ }
      event.preventDefault();
      return;
    }
    press = event.button === 0 ? [event.clientX, event.clientY] : null;
    if (event.button === 0 && !runtime.measureMode && !runtime.annotationMode) {
      runtime.lookPointer = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
        x: event.clientX, y: event.clientY, active: false };
      try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* keep looking while the pointer remains over the canvas */ }
    }
  };
  const up = (event) => {
    if (runtime.flyMode) {
      if (runtime.flyPointerDragging && event.pointerId === runtime.flyPointerId) {
        runtime.flyPointerDragging = false;
        renderer.domElement.style.cursor = "grab";
        if (renderer.domElement.hasPointerCapture?.(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      }
      press = null;
      return;
    }
    if (runtime.lookPointer?.pointerId === event.pointerId) {
      const didLook = runtime.lookPointer.active;
      runtime.lookPointer = null;
      if (didLook) {
        press = null;
        renderer.domElement.style.cursor = "";
        return;
      }
    }
    if (runtime.annotationMode === "draw" && runtime.drawingPoints) {
      const points = runtime.drawingPoints.map((point) => [point.x, point.z]);
      const valid = points.length >= 2;
      clearDrawPreview(runtime);
      if (renderer.domElement.hasPointerCapture?.(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      if (valid) {
        runtime.onDrawComplete?.(points);
        runtime.onAnnotationStatusChange?.("Ground drawing added.");
      }
      press = null;
      return;
    }
    const hasGroundTool = runtime.measureMode || runtime.annotationMode === "note";
    if (!press || (!runtime.model && !hasGroundTool && !runtime.annotationTargets.length && !runtime.measureTarget) || Math.hypot(event.clientX - press[0], event.clientY - press[1]) > 5) { press = null; return; }
    press = null;
    const bounds = renderer.domElement.getBoundingClientRect();
    if (runtime.annotationMode === "note") {
      const point = groundPointAt(runtime, event.clientX, event.clientY);
      if (!point) { runtime.onAnnotationStatusChange?.("Click a visible point on the ground to place the note."); return; }
      runtime.onNotePoint?.([point.x, point.z]);
      runtime.onAnnotationStatusChange?.("");
      return;
    }
    if (runtime.measureMode) {
      const point = groundPointAt(runtime, event.clientX, event.clientY);
      if (!point) { runtime.onMeasureChange?.("Click a visible point on the ground."); return; }
      addMeasurePoint(runtime, point, runtime.measureUnits || "imperial");
      return;
    }
    const markup = pickMarkupAt(runtime, event.clientX, event.clientY, bounds);
    if (markup) {
      selectMarkup(runtime, markup.target, markup.anchor);
      return;
    }
    clearMarkupSelection(runtime);
    if (!runtime.model) return;
    const ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2), runtime.camera);
    const pools = [];
    runtime.model.traverseVisible((node) => { if (node.isMesh && node.userData.kind !== "wireDetail") pools.push(node); });
    for (const detail of runtime.detail) if (detail.visible) pools.push(detail.flatFabric);
    const hit = ray.intersectObjects(pools, false).find(({ object }) => object.userData.shapeId);
    if (hit) pick(hit.object.userData.shapeId);
  };
  renderer.domElement.addEventListener("pointerdown", down);
  renderer.domElement.addEventListener("pointerup", up);
  const cancelDraw = (event) => {
    if (runtime.lookPointer?.pointerId === event.pointerId) {
      runtime.lookPointer = null;
      press = null;
      renderer.domElement.style.cursor = "";
      return;
    }
    if (runtime.annotationMode !== "draw" || !runtime.drawingPoints) return;
    clearDrawPreview(runtime);
    if (renderer.domElement.hasPointerCapture?.(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
  };
  renderer.domElement.addEventListener("pointercancel", cancelDraw);
  const wheel = (event) => moveCameraWithWheel(runtime, event);
  renderer.domElement.addEventListener("wheel", wheel, { capture: true, passive: false });
  const observer = new ResizeObserver(() => { resize(runtime); updateControlSpeeds(runtime); });
  observer.observe(host);
  frame(runtime);
  renderer.setAnimationLoop(() => {
    if (host.clientWidth === 0 || host.clientHeight === 0) return;
    const now = performance.now();
    const delta = runtime.lastFrame == null ? 0 : Math.min((now - runtime.lastFrame) / 1000, .05);
    runtime.lastFrame = now;
    if (runtime.flyMode) moveFly(runtime, delta);
    else runtime.controls.update();
    for (const detail of runtime.detail) {
      const { a, b, spec } = detail.userData;
      const position = runtime.camera.isOrthographicCamera ? runtime.controls.target : runtime.camera.position;
      const closest = tmpSegment.set(a, b).closestPointToPoint(position, true, tmpPoint);
      const close = position.distanceTo(closest) < 4.5 &&
        (!runtime.camera.isOrthographicCamera || runtime.orthoHeight / runtime.camera.zoom < 8);
      const fabricVisible = runtime.settings.fabric !== false && runtime.settings.componentVisibility?.fabric !== false;
      detail.visible = fabricVisible && (spec.detail === "wire" || close);
      detail.flatFabric.visible = fabricVisible && !detail.visible;
    }
    renderer.render(scene, runtime.camera);
    labelsRenderer.render(scene, runtime.camera);
  });
  runtime.dispose = () => {
    observer.disconnect();
    renderer.setAnimationLoop(null);
    renderer.domElement.removeEventListener("pointerdown", down);
    renderer.domElement.removeEventListener("pointerup", up);
    renderer.domElement.removeEventListener("pointercancel", cancelDraw);
    renderer.domElement.removeEventListener("pointermove", dragLook);
    renderer.domElement.removeEventListener("pointermove", hoverMarkup);
    renderer.domElement.removeEventListener("wheel", wheel, true);
    renderer.domElement.removeEventListener("mousemove", mouseMove);
    document.removeEventListener("keydown", keyDown, true);
    document.removeEventListener("keyup", keyUp, true);
    document.removeEventListener("pointerlockchange", pointerLockChange);
    document.removeEventListener("visibilitychange", clearFlyKeys);
    window.removeEventListener("blur", clearFlyKeys);
    window.clearTimeout(runtime.flyLockTimer);
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    runtime.controls.dispose();
    for (const object of [runtime.model, runtime.grid, runtime.focus]) if (object) disposeFenceScene(object);
    clearMeasurement(runtime);
    clearAnnotations(runtime);
    clearDrawPreview(runtime);
    clearColorMapLabels(runtime);
    runtime.labels?.clear();
    environment.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    labelsRenderer.domElement.remove();
  };
  return runtime;
}
const tmpSegment = new T.Line3();
const tmpPoint = new T.Vector3();

function updateLabels(runtime, layout, ornamentalLayout, guardrailLayout, units) {
  if (runtime.labels) {
    for (const item of [...runtime.labels.children]) item.removeFromParent();
    runtime.labels.removeFromParent();
  }
  const labels = runtime.labels = new T.Group();
  runtime.scene.add(labels);
  const add = (point, height, text, kind) => {
    if (labels.children.length >= 280) return;
    const tag = document.createElement("span");
    tag.textContent = text;
    tag.className = `fence3d-label ${kind}`;
    const object = new CSS2DObject(tag);
    object.position.set(point[0], height, point[1]);
    labels.add(object);
  };
  for (const run of layout.runs) {
    if (!conditionVisible(run.conditionScopeId, runtime.settings)) continue;
    const top = (run.spec.elevation + run.spec.height) * FT + .25;
    if (runtime.settings.edgeLabels) for (const [index, segment] of run.segments.entries()) {
      const end = segment.start + segment.length;
      const length = run.spans.reduce((sum, span) => sum + Math.max(0, Math.min(span.end, end) - Math.max(span.start, segment.start)), 0);
      if (length < .1) continue;
      const lastSegment = index === run.segments.length - 1;
      const linePosts = run.posts.filter((post) => post.type === "line" && !post.supportOnly
        && post.at >= segment.start - 1e-6 && (post.at < end - 1e-6 || (lastSegment && post.at <= end + 1e-6))).length;
      add([(segment.a[0] + segment.b[0]) / 2, (segment.a[1] + segment.b[1]) / 2], top + .22,
        `${formatLength(length, units)}${linePosts > 0 ? ` · ${linePosts} LINE` : ""}`, "edge");
    }
    if (runtime.settings.lengths) {
      for (const span of run.segments) {
        if (span.length < .1) continue;
        add([(span.a[0] + span.b[0]) / 2, (span.a[1] + span.b[1]) / 2], top + (runtime.settings.edgeLabels ? 1.15 : .22), formatLength(span.length, units), "run");
      }
    }
    if (runtime.settings.corners || runtime.settings.angles) for (const item of run.corners) {
      add(item.point, top, runtime.settings.angles ? `${item.angle.toFixed(1)}°` : "◆", "corner");
    }
    if (runtime.settings.spacing) for (const bay of run.spacingLabels) add(bay.point, run.spec.elevation * FT + .12, formatLength(bay.length, units), "post");
  }
  for (const run of ornamentalLayout.runs) {
    if (!conditionVisible(run.conditionScopeId, runtime.settings)) continue;
    const top = run.spec.elevation_ft * FT + (run.spec.height_ft + run.spec.bottom_clearance_in / 12) * FT + .25;
    for (const segment of run.segments) {
      const fixedPanels = ornamentalLayout.panels.filter((panel) => panel.runId === run.id && panel.segmentId === segment.id);
      const fixedLength = fixedPanels.reduce((sum, panel) => sum + panel.length, 0);
      if (runtime.settings.edgeLabels && fixedLength > .1) {
        add([(segment.a[0] + segment.b[0]) / 2, (segment.a[1] + segment.b[1]) / 2], top,
          `${formatLength(fixedLength, units)} · ${fixedPanels.length} PANEL${fixedPanels.length === 1 ? "" : "S"}`, "edge");
      }
      if (runtime.settings.lengths && segment.length > .1) {
        add([(segment.a[0] + segment.b[0]) / 2, (segment.a[1] + segment.b[1]) / 2], top + (runtime.settings.edgeLabels ? 1.15 : .22),
          formatLength(segment.length, units), "run");
      }
    }
  }
  if (runtime.settings.edgeLabels) for (const route of guardrailLayout.routes) {
    if (!conditionVisible(route.conditionScopeId, runtime.settings)) continue;
    if (route.length <= .1 || !route.anchor) continue;
    add([route.anchor[0], route.anchor[2]], route.anchor[1] + .35, formatLength(route.length, units), "edge");
  }
}

function clearColorMapLabels(runtime) {
  const labels = runtime.mapLabels;
  if (!labels) return;
  labels.traverse((object) => { if (object instanceof CSS2DObject) object.element.remove(); });
  labels.removeFromParent();
  disposeFenceScene(labels);
  runtime.mapLabels = null;
}

function componentVisible(category, display) {
  if (display.componentVisibility?.[category] === false) return false;
  if (category === "fabric" || category === "gateArea") return display.fabric;
  if (category.startsWith("post:")) return display.posts;
  if (category === "foundations") return display.posts;
  if (category === "rails" || category === "wire" || category === "barbedWire" || category === "gateFrame" || category === "guardrail") return display.rails;
  if (category === "pickets") return display.fabric;
  if (fittingKinds.has(category) || ["flatBrackets", "swivelBrackets", "ornamentalHinges", "ornamentalLatches",
    "ornamentalKeepers", "ornamentalDropRods", "ornamentalCaps"].includes(category)) return display.fittings;
  return true;
}

function conditionVisible(scopeId, display) {
  return !scopeId || display.conditionVisibility?.[scopeId] !== false;
}

function updateColorMapLabels(runtime, rows, enabled, display) {
  clearColorMapLabels(runtime);
  if (!enabled) return;
  const group = runtime.mapLabels = new T.Group();
  group.name = "Fence component quantity callouts";
  const span = runtime.bounds.getSize(new T.Vector3()).length();
  const spacing = Math.max(.45, Math.min(8, span * .04));
  const active = rows.filter((row) => row.anchor && Number(row.count) > 0 && componentVisible(row.category, display)
    && conditionVisible(row.conditionScopeId, display));
  active.forEach((row, index) => {
    const angle = index * 2.399963229728653;
    const radius = spacing * (1 + (index % 4) * .38);
    const anchor = new T.Vector3(...row.anchor);
    const end = anchor.clone().add(new T.Vector3(Math.cos(angle) * radius,
      spacing * (.55 + (index % 3) * .3), Math.sin(angle) * radius));
    const leader = new T.Line(new T.BufferGeometry().setFromPoints([anchor, end]),
      new T.LineBasicMaterial({ color: row.color, depthTest: false, depthWrite: false }));
    leader.renderOrder = 1000;
    group.add(leader);
    const tag = document.createElement("span");
    tag.className = "fence3d-map-label";
    tag.style.setProperty("--fence-map-color", row.color);
    tag.textContent = `${row.conditionName ? `${row.conditionName} · ` : ""}${row.title} · ${row.quantity}`;
    const label = new CSS2DObject(tag);
    label.position.copy(end);
    group.add(label);
  });
  runtime.scene.add(group);
}

function applyDisplay(runtime, display, colorMap) {
  runtime.settings = display;
  setCamera(runtime, display.camera);
  runtime.light.intensity = display.light;
  if (runtime.grid) runtime.grid.visible = display.grid && !runtime.plan;
  const apply = (object, inheritedScope) => {
    const scopeId = object.userData.conditionScopeId || inheritedScope;
    const { kind, mapCategory } = object.userData;
    const category = mapCategory || (kind === "fabricEdge" || kind === "wireDetail" ? "fabric" : kind);
    if (kind === "condition") object.visible = conditionVisible(scopeId, display);
    else if (category && category !== "gateLeaf") object.visible = componentVisible(category, display) && conditionVisible(scopeId, display);
    const mapColor = FENCE_COMPONENT_COLORS[category];
    if (mapColor && object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!runtime.baseMaterialColors.has(material) && material.color) runtime.baseMaterialColors.set(material, material.color.clone());
        const original = runtime.baseMaterialColors.get(material);
        if (colorMap) material.color?.set(mapColor);
        else if (original) material.color?.copy(original);
      }
    }
    for (const child of object.children) apply(child, scopeId);
  };
  if (runtime.model) apply(runtime.model, null);
}

export const download = (bytes, filename, type) => {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
};

async function canvasPngBytes(canvas) {
  if (!canvas) return null;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The ground plan image could not be exported.");
  return new Uint8Array(await blob.arrayBuffer());
}

function exportMarkupLabel(text, color) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  const font = "24px Arial, sans-serif";
  context.font = font;
  const maxWidth = 440;
  const lines = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > maxWidth) { lines.push(line); line = word; }
      else line = next;
    }
    lines.push(line);
  }
  const lineHeight = 32;
  const padding = 14;
  canvas.width = Math.min(maxWidth + padding * 2, Math.max(130, Math.ceil(Math.max(...lines.map((line) => context.measureText(line).width)) + padding * 2)));
  canvas.height = Math.max(46, lines.length * lineHeight + padding * 2);
  context.font = font;
  context.fillStyle = "rgba(255,250,236,.96)";
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.fillRect(1, 1, canvas.width - 2, canvas.height - 2);
  context.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
  context.fillStyle = "#252a31";
  context.textBaseline = "top";
  lines.forEach((line, index) => context.fillText(line, padding, padding + index * lineHeight, canvas.width - padding * 2));
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const label = new T.Mesh(new T.PlaneGeometry(canvas.width / 140, canvas.height / 140),
    new T.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, side: T.DoubleSide }));
  label.rotation.x = -Math.PI / 2;
  label.renderOrder = 1002;
  return label;
}

function createExportMarkupGroup(current) {
  const group = new T.Group();
  group.name = "OpenTakeoff markups";
  for (const drawing of current.annotations?.drawings || []) {
    if (drawing.points.length < 2) continue;
    const points = drawing.points.map(([x, z]) => new T.Vector3(x, .035, z));
    const line = new T.Line(new T.BufferGeometry().setFromPoints(points),
      new T.LineBasicMaterial({ color: "#e15d2a", depthTest: false, depthWrite: false }));
    line.renderOrder = 1000;
    group.add(line);
  }
  for (const note of current.annotations?.notes || []) {
    const [x, z] = note.point;
    const marker = new T.Mesh(new T.SphereGeometry(.045, 10, 6), new T.MeshBasicMaterial({ color: "#d04b22", depthTest: false }));
    marker.position.set(x, .04, z);
    marker.renderOrder = 1001;
    group.add(marker);
    const label = exportMarkupLabel(note.text, "#d88855");
    if (label) { label.position.set(x, .28, z); group.add(label); }
  }
  const measurement = current.measureTarget;
  if (measurement?.points?.length === 2) {
    const [a, b] = measurement.points.map((point) => new T.Vector3(point.x, .04, point.z));
    const line = new T.Line(new T.BufferGeometry().setFromPoints([a, b]),
      new T.LineBasicMaterial({ color: "#7047b8", depthTest: false, depthWrite: false }));
    line.renderOrder = 1000;
    group.add(line);
    for (const point of [a, b]) {
      const marker = new T.Mesh(new T.SphereGeometry(.055, 12, 8), new T.MeshBasicMaterial({ color: "#7047b8", depthTest: false }));
      marker.position.copy(point);
      marker.renderOrder = 1001;
      group.add(marker);
    }
    const value = groundMeasureText(current.measureDistance || 0, current.measureUnits || "imperial");
    const label = exportMarkupLabel(value, "#8062b8");
    if (label) { label.position.copy(a).add(b).multiplyScalar(.5).add(new T.Vector3(0, .2, 0)); group.add(label); }
  }
  return group;
}

function drawQuantitySummary(canvas, rows, units) {
  if (!rows?.length) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const fontSize = Math.max(12, Math.min(18, Math.round(canvas.height / 65)));
  const rowHeight = fontSize * 1.55;
  const rowsPerColumn = Math.max(8, Math.floor((canvas.height - 90) / rowHeight));
  const columnCount = Math.ceil(rows.length / rowsPerColumn);
  const columnWidth = Math.min(350, Math.floor((canvas.width - 36) / columnCount));
  const panelWidth = columnWidth * columnCount;
  const panelHeight = Math.min(canvas.height - 24, (Math.min(rows.length, rowsPerColumn) + 1.7) * rowHeight + 14);
  const panelX = Math.max(12, canvas.width - panelWidth - 18);
  const panelY = 18;
  context.save();
  context.fillStyle = "rgba(255,255,255,.94)";
  context.strokeStyle = "#293647";
  context.lineWidth = 2;
  context.fillRect(panelX, panelY, panelWidth, panelHeight);
  context.strokeRect(panelX, panelY, panelWidth, panelHeight);
  context.fillStyle = "#172234";
  context.font = `700 ${fontSize + 2}px Arial, sans-serif`;
  context.fillText(`Fence quantities (${units === "metric" ? "metric" : "imperial"})`, panelX + 10, panelY + rowHeight, panelWidth - 20);
  context.font = `${fontSize}px Arial, sans-serif`;
  rows.forEach((row, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const rowIndex = index % rowsPerColumn;
    const x = panelX + column * columnWidth + 10;
    const y = panelY + rowHeight * (rowIndex + 2);
    const value = row.manual == null ? row.generated : `${row.generated} (override ${row.manual})`;
    const text = `${row.title}: ${value}`;
    context.fillStyle = "#233246";
    context.fillText(text, x, y, columnWidth - 20);
  });
  context.restore();
}

function exportRoot(current, { includeMarkups = true, includeQuantities = true, quantities = [], units = "imperial" } = {}) {
  if (!current?.model?.children.length) throw new Error("Generate a fence before exporting.");
  if (current.settings.plan && !current.plan) throw new Error("Wait for the ground plan to finish loading before exporting.");
  const root = new T.Group();
  root.name = "OpenTakeoff fence model";
  const model = current.model.clone(true);
  model.traverse((object) => {
    if (object.material) {
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      const exportMaterials = sourceMaterials.map((material) => {
        const clone = material.clone();
        const original = current.baseMaterialColors.get(material);
        if (original) clone.color?.copy(original);
        return clone;
      });
      object.material = Array.isArray(object.material) ? exportMaterials : exportMaterials[0];
    }
    if (object.userData.kind === "detail") object.visible = false;
    else if (object.userData.kind === "fabric") object.visible = current.settings.fabric;
  });
  root.add(model);
  if (current.settings.plan && current.plan) root.add(current.plan.clone(true));
  if (includeMarkups) root.add(createExportMarkupGroup(current));
  if (includeQuantities) root.userData.openTakeoff = { units, quantities };
  return root;
}

async function createGlb(current, options) {
  const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
  return new GLTFExporter().parseAsync(exportRoot(current, options), {
    binary: true, onlyVisible: true, maxTextureSize: options.maxTextureSize ?? 4096, trs: true,
  });
}

export default forwardRef(function FenceViewer({ layout, ornamentalLayout = { runs: [], panels: [], posts: [], gates: [] }, guardrailLayout = { routes: [], totals: { length: 0 } }, display, units, selectedId, onPick, sheetId, calibration, renderPlan,
  onFlyChange, onFlyError, onFlySpeedChange, flySpeed, colorMap = false, colorMapRows = [], measureMode = false, onMeasureChange,
  annotationMode = "", annotations = { drawings: [], notes: [] }, onAnnotationModeChange, onAnnotationStatusChange, onDrawComplete, onNotePoint, onMarkupDelete }, ref) {
  const host = useRef(null);
  const runtime = useRef(null);
  const pick = useRef(onPick);
  const flyChange = useRef(onFlyChange);
  const flyError = useRef(onFlyError);
  const flySpeedChange = useRef(onFlySpeedChange);
  const flySpeedValue = useRef(flySpeed);
  const measureChange = useRef(onMeasureChange);
  const markupDelete = useRef(onMarkupDelete);
  const annotationModeChange = useRef(onAnnotationModeChange);
  const annotationStatusChange = useRef(onAnnotationStatusChange);
  const drawComplete = useRef(onDrawComplete);
  const notePoint = useRef(onNotePoint);
  const [error, setError] = useState("");
  const [planStatus, setPlanStatus] = useState("");
  pick.current = onPick;
  flyChange.current = onFlyChange;
  flyError.current = onFlyError;
  flySpeedChange.current = onFlySpeedChange;
  flySpeedValue.current = flySpeed;
  measureChange.current = onMeasureChange;
  markupDelete.current = onMarkupDelete;
  annotationModeChange.current = onAnnotationModeChange;
  annotationStatusChange.current = onAnnotationStatusChange;
  drawComplete.current = onDrawComplete;
  notePoint.current = onNotePoint;

  useImperativeHandle(ref, () => ({
    view: (direction) => {
      if (!runtime.current) return;
      finishFly(runtime.current);
      frame(runtime.current, direction);
    },
    focusSelected: () => {
      if (runtime.current) focusSelection(runtime.current);
    },
    fly: (enabled) => {
      if (!runtime.current) return;
      if (enabled) startFly(runtime.current);
      else finishFly(runtime.current);
    },
    setFlySpeed: (speed) => {
      if (!runtime.current) return;
      runtime.current.flySpeedMultiplier = T.MathUtils.clamp(Number(speed) || 1, 1, 50);
    },
    png: async (options = {}) => {
      const current = runtime.current;
      if (!current) throw new Error("The 3D renderer is unavailable.");
      const annotationVisible = current.annotationGroup?.visible;
      const measurementVisible = current.measureGroup?.visible;
      const markupGroup = options.includeMarkups ? createExportMarkupGroup(current) : null;
      try {
        if (current.annotationGroup) current.annotationGroup.visible = false;
        if (current.measureGroup) current.measureGroup.visible = false;
        if (markupGroup) current.scene.add(markupGroup);
        current.renderer.render(current.scene, current.camera);
        const canvas = document.createElement("canvas");
        canvas.width = current.renderer.domElement.width;
        canvas.height = current.renderer.domElement.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("The screenshot could not be captured.");
        context.drawImage(current.renderer.domElement, 0, 0);
        if (options.includeQuantities) drawQuantitySummary(canvas, options.quantities, options.units);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("The screenshot could not be captured.");
        download(blob, "opentakeoff-fence.png", "image/png");
      } finally {
        if (markupGroup) { current.scene.remove(markupGroup); disposeFenceScene(markupGroup); }
        if (current.annotationGroup) current.annotationGroup.visible = annotationVisible;
        if (current.measureGroup) current.measureGroup.visible = measurementVisible;
        current.renderer.render(current.scene, current.camera);
      }
    },
    gltf: async (binary, options = {}) => {
      const current = runtime.current;
      const root = exportRoot(current, options);
      if (binary) {
        const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
        const result = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 4096, trs: true });
        download(result, "opentakeoff-fence.glb", "model/gltf-binary");
      } else {
        const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
        const result = await new GLTFExporter().parseAsync(root, { binary: false, onlyVisible: true, maxTextureSize: 4096, trs: true });
        download(JSON.stringify(result), "opentakeoff-fence.gltf", "model/gltf+json");
      }
    },
    html: async (title, options = {}) => {
      const current = runtime.current;
      // Phone-class GPUs have much tighter texture and memory budgets. Keep
      // the plan legible while avoiding the 4K texture that can blank a tab.
      const result = await createGlb(current, { ...options, maxTextureSize: Math.min(options.maxTextureSize ?? 2048, 2048) });
      const html = createStandaloneViewer(result, title, options.includeQuantities ? options.quantities : []);
      download(html, fenceExportName(title) + ".html", "text/html;charset=utf-8");
    },
    otk3d: async ({ title, design, metadata, options = {} }) => {
      const current = runtime.current;
      const result = await createGlb(current, options);
      const planImage = current.settings.plan ? current.plan?.material?.map?.image : null;
      const planPng = await canvasPngBytes(planImage);
      const archive = await createOtk3dArchive({ glb: result, planPng, design, metadata });
      download(archive, fenceExportName(title) + ".otk3d", "application/vnd.opentakeoff.3d+zip");
    },
  }), []);

  useEffect(() => {
    let current;
    try {
      current = createRuntime(host.current, (id) => pick.current(id),
        (active) => flyChange.current?.(active), (message) => flyError.current?.(message),
        (speed) => flySpeedChange.current?.(speed), (message) => measureChange.current?.(message),
        (mode) => annotationModeChange.current?.(mode), (message) => annotationStatusChange.current?.(message),
        (points) => drawComplete.current?.(points), (point) => notePoint.current?.(point),
        (kind, id) => markupDelete.current?.(kind, id), flySpeedValue.current);
      runtime.current = current;
      const lost = (event) => {
        event.preventDefault();
        current.renderer.setAnimationLoop(null);
        setError("The graphics context was lost. Close and reopen the 3D view to restore the preview.");
      };
      current.renderer.domElement.addEventListener("webglcontextlost", lost, { once: true });
      return () => {
        current.renderer.domElement.removeEventListener("webglcontextlost", lost);
        current.dispose();
        runtime.current = null;
      };
    } catch {
      setError("3D preview requires WebGL 2. The layout and quantities remain available.");
      return undefined;
    }
  }, []);

  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    current.measureMode = measureMode;
    current.measureUnits = units;
    current.controls.enabled = !measureMode && !current.annotationMode;
    current.renderer.domElement.style.cursor = measureMode ? "crosshair" : "";
    if (current.measureDistance != null && current.measureResultElement) {
      current.measureResultElement.textContent = groundMeasureText(current.measureDistance, units);
    }
    if (measureMode) current.onMeasureChange?.("Click the first ground point. Fence vertices snap within 12 pixels.");
    else {
      if (current.measurePending) { current.measurePending = null; clearMeasurement(current); }
      current.onMeasureChange?.("");
    }
  }, [measureMode, units]);

  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    if (current.annotationMode === "draw" && annotationMode !== "draw") clearDrawPreview(current);
    current.annotationMode = annotationMode;
    current.controls.enabled = !current.measureMode && !annotationMode;
    current.renderer.domElement.style.cursor = annotationMode ? "crosshair" : current.measureMode ? "crosshair" : "";
    current.onAnnotationStatusChange?.(annotationMode === "draw" ? "Drag on the ground to draw. Nearby fence vertices snap." :
      annotationMode === "note" ? "Click a ground point to place a note. Nearby fence vertices snap." : "");
  }, [annotationMode]);

  // Rasterize only when the overlay is enabled. The paper uses the same
  // centered sheet dimensions as the normalized takeoff-to-meters mapping.
  useEffect(() => {
    const current = runtime.current;
    if (!current || !display.plan) { setPlanStatus(""); return; }
    if (!calibration) { setPlanStatus("A calibrated sheet is required for the 3D plan."); return; }
    if (!renderPlan) { setPlanStatus("The PDF page is unavailable."); return; }
    const controller = new AbortController();
    setPlanStatus("Loading plan…");
    const maxSize = Math.min(4096, current.renderer.capabilities.maxTextureSize);
    renderPlan(sheetId, maxSize, controller.signal).then((canvas) => {
      if (controller.signal.aborted) return;
      const metersPerPixel = calibration.feetPerPixel * FT;
      const texture = new T.CanvasTexture(canvas);
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = Math.min(8, current.renderer.capabilities.getMaxAnisotropy());
      const geometry = new T.PlaneGeometry(calibration.width * metersPerPixel, calibration.height * metersPerPixel);
      const material = new T.MeshBasicMaterial({ map: texture, toneMapped: false });
      const plan = new T.Mesh(geometry, material);
      plan.rotation.x = -Math.PI / 2;
      plan.position.y = -.004;
      current.scene.add(plan);
      current.plan = plan;
      if (current.grid) current.grid.visible = false;
      if (!current.model?.children.length) frame(current, "Top");
      setPlanStatus("");
    }).catch(() => {
      if (!controller.signal.aborted) setPlanStatus("This PDF page could not be rendered.");
    });
    return () => {
      controller.abort();
      if (current.plan) {
        current.plan.removeFromParent();
        disposeFenceScene(current.plan);
        current.plan = null;
        if (current.grid) current.grid.visible = current.settings.grid;
      }
    };
  }, [display.plan, sheetId, calibration, renderPlan]);

  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    const hadModel = current.model?.children.length;
    if (current.model) { current.scene.remove(current.model); disposeFenceScene(current.model); }
    if (current.grid) { current.scene.remove(current.grid); disposeFenceScene(current.grid); }
    current.model = new T.Group();
    current.model.name = "OpenTakeoff fence conditions";
    if (layout.runs.length) current.model.add(createFenceScene(layout));
    if (ornamentalLayout.runs.length) current.model.add(createOrnamentalScene(ornamentalLayout));
    if (guardrailLayout.routes.length) current.model.add(createGuardrailScene(guardrailLayout));
    const snapPoints = new Map();
    for (const run of layout.runs) for (const [x, z] of run.points) {
      const point = new T.Vector3(x, 0, z);
      snapPoints.set(`${x.toFixed(6)}:${z.toFixed(6)}`, { ground: point, screen: point.clone() });
    }
    for (const post of layout.posts) {
      const [x, z] = post.point;
      snapPoints.set(`${x.toFixed(6)}:${z.toFixed(6)}`, {
        ground: new T.Vector3(x, 0, z), screen: new T.Vector3(x, post.base + post.height / 2, z),
      });
    }
    for (const run of ornamentalLayout.runs) for (const [x, z] of run.points) {
      const point = new T.Vector3(x, 0, z);
      snapPoints.set(`${x.toFixed(6)}:${z.toFixed(6)}`, { ground: point, screen: point.clone() });
    }
    for (const post of ornamentalLayout.posts) {
      const [x, z] = post.point;
      snapPoints.set(`${x.toFixed(6)}:${z.toFixed(6)}`, {
        ground: new T.Vector3(x, 0, z), screen: new T.Vector3(x, post.base + (post.top - post.base) / 2, z),
      });
    }
    for (const route of guardrailLayout.routes) for (const point of route.points) {
      const [x, z] = point.point;
      snapPoints.set(`${x.toFixed(6)}:${z.toFixed(6)}`, {
        ground: new T.Vector3(x, 0, z), screen: new T.Vector3(x, point.elevationM + .66, z),
      });
    }
    current.measureSnapPoints = [...snapPoints.values()];
    updateControlSpeeds(current);
    current.detail = [];
    current.model.traverse((object) => { if (object.userData.kind === "detail") current.detail.push(object); });
    current.scene.add(current.model);
    if (layout.runs.length || ornamentalLayout.runs.length || guardrailLayout.routes.length) current.bounds.setFromObject(current.model);
    const size = current.bounds.getSize(new T.Vector3());
    const step = units === "metric" ? 1 : 5 * FT;
    const divisions = Math.min(150, Math.max(10, Math.ceil(size.length() * 1.5 / step)));
    const gridStep = Math.max(step, Math.ceil(size.length() * 1.5 / step / divisions) * step);
    current.grid = new T.GridHelper(divisions * gridStep, divisions, "#abb7c1", "#cbd5dd");
    const center = current.bounds.getCenter(new T.Vector3());
    current.grid.position.set(center.x, Math.min(0, current.bounds.min.y) - .008, center.z);
    current.scene.add(current.grid);
    if (!hadModel && (layout.runs.length || ornamentalLayout.runs.length || guardrailLayout.routes.length)) frame(current);
  }, [layout, ornamentalLayout, guardrailLayout, units]);

  useEffect(() => {
    if (runtime.current) updateAnnotations(runtime.current, annotations);
  }, [annotations]);

  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    applyDisplay(current, display, colorMap);
    updateLabels(current, layout, ornamentalLayout, guardrailLayout, units);
  }, [display, layout, ornamentalLayout, guardrailLayout, units, colorMap]);

  useEffect(() => {
    if (runtime.current) updateColorMapLabels(runtime.current, colorMapRows, colorMap, display);
  }, [colorMap, colorMapRows, display]);

  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    if (current.focus) { current.focus.removeFromParent(); disposeFenceScene(current.focus); current.focus = null; }
    current.selectionBounds = null;
    const run = layout.runs.find((item) => item.id === selectedId);
    const ornamentalRun = ornamentalLayout.runs.find((item) => item.id === selectedId);
    const guardrailRoute = guardrailLayout.routes.find((item) => item.sourceRunIds.includes(selectedId));
    const points = run?.points || ornamentalRun?.points || guardrailRoute?.points.map((point) => point.point);
    if (!points) return;
    const focusBounds = new T.Box3();
    if (guardrailRoute) {
      for (const point of guardrailRoute.points) {
        focusBounds.expandByPoint(new T.Vector3(point.point[0], point.elevationM - .08, point.point[1]));
        focusBounds.expandByPoint(new T.Vector3(point.point[0], point.elevationM + .84, point.point[1]));
      }
    } else {
      const bottom = run ? run.spec.elevation * FT : ornamentalRun.spec.elevation_ft * FT;
      const top = run ? (run.spec.elevation + run.spec.height) * FT
        : (ornamentalRun.spec.elevation_ft + ornamentalRun.spec.height_ft + ornamentalRun.spec.bottom_clearance_in / 12) * FT;
      for (const [x, z] of points) {
        focusBounds.expandByPoint(new T.Vector3(x, bottom, z));
        focusBounds.expandByPoint(new T.Vector3(x, top, z));
      }
    }
    if (!focusBounds.isEmpty()) {
      focusBounds.expandByScalar(.16);
      current.selectionBounds = focusBounds;
    }
    const top = run ? (run.spec.elevation + run.spec.height) * FT + .12
      : ornamentalRun ? (ornamentalRun.spec.elevation_ft + ornamentalRun.spec.height_ft + ornamentalRun.spec.bottom_clearance_in / 12) * FT + .12
        : (guardrailRoute?.points[0]?.elevationM || 0) + .78;
    current.focus = new T.Line(new T.BufferGeometry().setFromPoints(points.map(([x, z]) => new T.Vector3(x, top, z))),
      new T.LineBasicMaterial({ color: "#2451d4", depthTest: false }));
    current.scene.add(current.focus);
  }, [layout, ornamentalLayout, guardrailLayout, selectedId]);

  return <div className="fence3d-renderer" ref={host} aria-label="Interactive 3D fence preview">
    {error && <p className="fence3d-empty" role="alert">{error}</p>}
    {display.plan && planStatus && <p className="fence3d-plan-status" role="status">{planStatus}</p>}
  </div>;
});
