import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Map as MapLibreMap, Marker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Icon } from "../brand/icons.jsx";
import { formatPropertyMeasurement, measurementValue } from "../lib/propertyMapGeometry.js";

const SITE_STORAGE_KEY = "openTakeoff.propertyMap.jobs.v1";
const USGS_TILE_URL = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}";
const EMPTY_SITE = Object.freeze({ address: "", center: [-98.5, 39.8], measurements: [], units: "imperial" });
let geocodeSequence = 0;

function readSavedSites() {
  try {
    const value = JSON.parse(localStorage.getItem(SITE_STORAGE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function normalizeSiteKey(address) {
  return String(address || "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function geocodeUsAddress(address) {
  const callbackName = `__openTakeoffGeocode${Date.now()}${++geocodeSequence}`;
  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "jsonp");
  url.searchParams.set("callback", callbackName);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => finish(new Error("Address lookup timed out. Please try again.")), 15000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
    };
    const finish = (error, result) => {
      cleanup();
      if (error) reject(error); else resolve(result);
    };
    window[callbackName] = (payload) => {
      const match = payload?.result?.addressMatches?.[0];
      const longitude = Number(match?.coordinates?.x), latitude = Number(match?.coordinates?.y);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        finish(new Error("No U.S. address match. Include the street, city, and state."));
        return;
      }
      finish(null, { address: match.matchedAddress || address, longitude, latitude });
    };
    script.onerror = () => finish(new Error("The U.S. Census address service could not be reached."));
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function featureCollection(site, draft, mode, cursor) {
  const features = [];
  for (const measurement of site?.measurements || []) {
    const coordinates = measurement.points.map((point) => [point.lng, point.lat]);
    if (measurement.type === "area" && coordinates.length >= 3) {
      features.push({ type: "Feature", properties: { kind: "area" }, geometry: { type: "Polygon", coordinates: [[...coordinates, coordinates[0]]] } });
    } else if (measurement.type === "line" && coordinates.length >= 2) {
      features.push({ type: "Feature", properties: { kind: "line" }, geometry: { type: "LineString", coordinates } });
    }
    if (measurement.type === "count") {
      for (const point of measurement.points) features.push({ type: "Feature", properties: { kind: "count" }, geometry: { type: "Point", coordinates: [point.lng, point.lat] } });
    }
    for (const point of measurement.type === "count" ? [] : measurement.points) {
      features.push({ type: "Feature", properties: { kind: "vertex" }, geometry: { type: "Point", coordinates: [point.lng, point.lat] } });
    }
  }
  if (mode === "line" || mode === "area") {
    const points = draft.map(({ lng, lat }) => [lng, lat]);
    if (cursor) points.push(cursor);
    if (points.length >= 2) features.push({ type: "Feature", properties: { kind: "draft-line" }, geometry: { type: "LineString", coordinates: points } });
    if (mode === "area" && points.length >= 3) features.push({ type: "Feature", properties: { kind: "draft-area" }, geometry: { type: "Polygon", coordinates: [[...points, points[0]]] } });
    for (const point of draft) features.push({ type: "Feature", properties: { kind: "draft-point" }, geometry: { type: "Point", coordinates: [point.lng, point.lat] } });
  }
  return { type: "FeatureCollection", features };
}

function makeMeasurementId() {
  return globalThis.crypto?.randomUUID?.() || `property-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function csvEscape(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

export default function PropertyMapPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const addressMarkerRef = useRef(null);
  const draftRef = useRef([]);
  const modeRef = useRef("pan");
  const [siteJobs, setSiteJobs] = useState(readSavedSites);
  const [activeSiteKey, setActiveSiteKey] = useState("");
  const activeSiteKeyRef = useRef("");
  const [addressInput, setAddressInput] = useState("");
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [mode, setMode] = useState("pan");
  const [draft, setDraft] = useState([]);
  const [csvMessage, setCsvMessage] = useState("");
  const activeSite = activeSiteKey ? siteJobs[activeSiteKey] || null : null;
  const returnTo = location.state?.returnTo || "/";

  useEffect(() => {
    try {
      const entries = Object.entries(siteJobs).slice(-40);
      localStorage.setItem(SITE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch { /* Map measurements remain usable when browser storage is unavailable. */ }
  }, [siteJobs]);

  const setActiveMode = useCallback((nextMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
    if (nextMode === "pan") {
      draftRef.current = [];
      setDraft([]);
    }
    const map = mapRef.current;
    if (map) {
      if (nextMode === "pan") { map.dragPan.enable(); map.doubleClickZoom.enable(); }
      else { map.dragPan.disable(); map.doubleClickZoom.disable(); }
    }
  }, []);

  const appendDraftPoint = useCallback((point) => {
    const next = [...draftRef.current, point];
    draftRef.current = next;
    setDraft(next);
  }, []);

  const updateSite = useCallback((updater) => {
    if (!activeSiteKey) return;
    setSiteJobs((previous) => {
      const current = previous[activeSiteKey] || EMPTY_SITE;
      return { ...previous, [activeSiteKey]: updater(current) };
    });
  }, [activeSiteKey]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return undefined;
    const map = new MapLibreMap({
      container,
      style: {
        version: 8,
        sources: {
          usgs: {
            type: "raster",
            tiles: [USGS_TILE_URL],
            tileSize: 256,
            attribution: 'Map services and data available from <a href="https://www.usgs.gov/" target="_blank" rel="noopener noreferrer">U.S. Geological Survey, National Geospatial Program</a>. Aerial imagery: USDA NAIP / USGS The National Map.',
          },
        },
        layers: [{ id: "usgs-imagery", type: "raster", source: "usgs", paint: { "raster-fade-duration": 150 } }],
      },
      center: activeSite?.center || EMPTY_SITE.center,
      zoom: activeSite ? 18 : 4,
      maxZoom: 19,
      minZoom: 3,
      attributionControl: true,
      cooperativeGestures: true,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: true }), "top-right");
    map.on("load", () => {
      map.addSource("takeoff-measurements", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "measure-fill", type: "fill", source: "takeoff-measurements", filter: ["==", ["get", "kind"], "area"], paint: { "fill-color": "#1f3fc7", "fill-opacity": 0.2 } });
      map.addLayer({ id: "measure-lines", type: "line", source: "takeoff-measurements", filter: ["in", ["get", "kind"], ["literal", ["area", "line", "vertex"]]], paint: { "line-color": "#1f3fc7", "line-width": 3, "line-dasharray": [1.5, 1] } });
      map.addLayer({ id: "measure-points", type: "circle", source: "takeoff-measurements", filter: ["in", ["get", "kind"], ["literal", ["count", "vertex"]]], paint: { "circle-radius": ["case", ["==", ["get", "kind"], "count"], 7, 4], "circle-color": ["case", ["==", ["get", "kind"], "count"], "#1f3fc7", "#fff"], "circle-stroke-color": "#1f3fc7", "circle-stroke-width": 2 } });
      map.addSource("takeoff-draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "draft-fill", type: "fill", source: "takeoff-draft", filter: ["==", ["get", "kind"], "draft-area"], paint: { "fill-color": "#1f3fc7", "fill-opacity": 0.14 } });
      map.addLayer({ id: "draft-line", type: "line", source: "takeoff-draft", paint: { "line-color": "#1f3fc7", "line-width": 2.5, "line-dasharray": [2, 1.5] } });
      map.addLayer({ id: "draft-points", type: "circle", source: "takeoff-draft", filter: ["==", ["get", "kind"], "draft-point"], paint: { "circle-radius": 5, "circle-color": "#fff", "circle-stroke-color": "#1f3fc7", "circle-stroke-width": 2 } });
      setMapReady(true);
    });
    map.on("click", (event) => {
      const activeMode = modeRef.current;
      const point = { lng: event.lngLat.lng, lat: event.lngLat.lat };
      if (activeMode === "count") {
        const currentSiteKey = activeSiteKeyRef.current;
        if (!currentSiteKey) return;
        setSiteJobs((previous) => {
          const site = previous[currentSiteKey] || EMPTY_SITE;
          return { ...previous, [currentSiteKey]: { ...site, measurements: [...site.measurements, { id: makeMeasurementId(), type: "count", points: [point] }] } };
        });
      } else if (activeMode === "line" || activeMode === "area") appendDraftPoint(point);
    });
    map.on("mousemove", (event) => {
      if (modeRef.current !== "line" && modeRef.current !== "area") return;
      const source = map.getSource("takeoff-draft");
      if (source) source.setData(featureCollection(activeSite, draftRef.current, modeRef.current, [event.lngLat.lng, event.lngLat.lat]));
    });
    map.on("mouseenter", () => { if (modeRef.current !== "pan") map.getCanvas().style.cursor = "crosshair"; });
    map.on("mouseleave", () => { map.getCanvas().style.cursor = ""; });
    return () => {
      addressMarkerRef.current?.remove();
      addressMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // The map is created once. Click handlers read the current site key from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { activeSiteKeyRef.current = activeSiteKey; }, [activeSiteKey]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    map?.getSource("takeoff-measurements")?.setData(featureCollection(activeSite, [], "pan", null));
    map?.getSource("takeoff-draft")?.setData(featureCollection(activeSite, draft, mode, null));
  }, [activeSite, draft, mapReady, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mode === "pan") { map.dragPan.enable(); map.doubleClickZoom.enable(); }
    else { map.dragPan.disable(); map.doubleClickZoom.disable(); }
    map.getCanvas().style.cursor = mode === "pan" ? "grab" : "crosshair";
  }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeSite?.center) return;
    map.easeTo({ center: activeSite.center, zoom: activeSite.address ? 18 : 4, duration: 0 });
  }, [activeSite?.center, activeSite?.address]);

  const searchAddress = async (event) => {
    event.preventDefault();
    const query = addressInput.trim();
    if (!query) return;
    setAddressBusy(true);
    setAddressError("");
    try {
      const result = await geocodeUsAddress(query);
      const siteKey = normalizeSiteKey(result.address);
      setSiteJobs((previous) => {
        const existing = previous[siteKey];
        return { ...previous, [siteKey]: { ...EMPTY_SITE, ...existing, address: result.address, center: [result.longitude, result.latitude] } };
      });
      setActiveSiteKey(siteKey);
      setAddressInput(result.address);
      draftRef.current = [];
      setDraft([]);
      setActiveMode("pan");
      if (mapRef.current) {
        mapRef.current.flyTo({ center: [result.longitude, result.latitude], zoom: 18, duration: 1200 });
        addressMarkerRef.current?.remove();
        addressMarkerRef.current = new Marker({ color: "#1f3fc7" }).setLngLat([result.longitude, result.latitude]).addTo(mapRef.current);
      }
    } catch (error) {
      setAddressError(error?.message || "Could not find that address.");
    } finally { setAddressBusy(false); }
  };

  const finishMeasurement = () => {
    if (!activeSiteKey || (mode !== "line" && mode !== "area")) return;
    const required = mode === "line" ? 2 : 3;
    if (draftRef.current.length < required) return;
    const measurement = { id: makeMeasurementId(), type: mode, points: draftRef.current };
    updateSite((site) => ({ ...site, measurements: [...site.measurements, measurement] }));
    draftRef.current = [];
    setDraft([]);
    setActiveMode("pan");
  };

  const undo = () => {
    if (draftRef.current.length) {
      const next = draftRef.current.slice(0, -1);
      draftRef.current = next;
      setDraft(next);
      return;
    }
    updateSite((site) => ({ ...site, measurements: site.measurements.slice(0, -1) }));
  };

  const clearMeasurements = () => {
    draftRef.current = [];
    setDraft([]);
    updateSite((site) => ({ ...site, measurements: [] }));
    setActiveMode("pan");
  };

  const downloadCsv = () => {
    if (!activeSite?.measurements.length) return;
    const rows = [["Address", "Type", "Measurement", "Points"]];
    for (const measurement of activeSite.measurements) {
      rows.push([activeSite.address, measurement.type, formatPropertyMeasurement(measurement, activeSite.units), measurement.points.map(({ lng, lat }) => `${lat.toFixed(7)} ${lng.toFixed(7)}`).join("; ")]);
    }
    const blob = new Blob([rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${(activeSite.address || "property-map").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 70)}-measurements.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
    setCsvMessage("Measurements downloaded.");
    window.setTimeout(() => setCsvMessage(""), 3000);
  };

  const activateTool = (nextMode) => {
    if (!activeSiteKey) return;
    draftRef.current = [];
    setDraft([]);
    setActiveMode(nextMode);
  };

  const measurements = activeSite?.measurements || [];
  const googleMapsUrl = activeSite?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeSite.address)}`
    : "";
  const lineTotalMeters = measurements.filter((item) => item.type === "line").reduce((sum, item) => sum + measurementValue(item), 0);
  const areaTotalMeters2 = measurements.filter((item) => item.type === "area").reduce((sum, item) => sum + measurementValue(item), 0);
  const countTotal = measurements.filter((item) => item.type === "count").length;

  return (
    <main className="property-map-page">
      <header className="property-map-header">
        <button type="button" className="property-map-back" onClick={() => navigate(returnTo)}><Icon name="chevronLeft" size={16} />Back to Takeoff</button>
        <div className="property-map-brand"><span className="property-map-brand-mark">OT</span><span>ESTIMATING</span></div>
        <div className="property-map-title"><span>PROPERTY WORKSPACE</span><h1>Property Map Takeoff</h1></div>
          <div className="property-map-header-actions">
            {googleMapsUrl && <a className="property-map-google-link" href={googleMapsUrl} target="_blank" rel="noopener noreferrer">View in Google Maps ↗</a>}
            <a className="property-map-help-link" href="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer" target="_blank" rel="noopener noreferrer">Imagery details</a>
          </div>
      </header>

      <form className="property-map-search" onSubmit={searchAddress}>
        <label htmlFor="property-address">Property address</label>
        <div className="property-map-search-entry">
          <Icon name="pin" size={17} />
          <input id="property-address" name="property-address" value={addressInput} onChange={(event) => setAddressInput(event.target.value)} placeholder="Street address, city, state, ZIP" autoComplete="street-address" />
          <button type="submit" disabled={addressBusy || !addressInput.trim()}>{addressBusy ? "Finding…" : "Find property"}</button>
        </div>
        <p>U.S. addresses · measurements use USGS aerial imagery · Google Maps opens as a separate reference view</p>
        {addressError && <div className="property-map-error" role="alert">{addressError}</div>}
      </form>

      <div className="property-map-workspace">
        <section className={`property-map-canvas${mode !== "pan" ? " is-drawing" : ""}`} aria-label="USGS aerial map">
          <div ref={mapContainerRef} className="property-map-canvas-inner" />
          {!mapReady && <div className="property-map-loading">Loading aerial imagery…</div>}
          {!activeSite && mapReady && <div className="property-map-empty"><Icon name="pin" size={24} /><strong>Search an address to begin</strong><span>Find a U.S. property, then measure distances, areas, or counts.</span></div>}
          {mode !== "pan" && <div className="property-map-draw-status" role="status">{mode === "line" ? "DISTANCE" : mode === "area" ? "AREA" : "COUNT"} · click the aerial map to place {mode === "area" ? "corners" : mode === "line" ? "points" : "a count"}{draft.length ? ` · ${draft.length} point${draft.length === 1 ? "" : "s"}` : ""}</div>}
          {mode !== "pan" && (mode === "count" || draft.length >= (mode === "line" ? 2 : 3)) && <button type="button" className="property-map-finish" onClick={mode === "count" ? () => setActiveMode("pan") : finishMeasurement}>{mode === "count" ? "Done" : "Finish measurement"}</button>}
        </section>

        <aside className="property-map-side-panel">
          <div className="property-map-panel-heading"><div><span>TAKEOFF TOOLS</span><h2>{activeSite?.address ? "Measurements" : "Tools"}</h2></div><button type="button" onClick={undo} disabled={!draft.length && !measurements.length} title="Undo last point or measurement">Undo</button></div>
          <div className="property-map-tools" role="group" aria-label="Property measurement tools">
            <button type="button" className={mode === "pan" ? "is-active" : ""} aria-pressed={mode === "pan"} disabled={!activeSite} onClick={() => setActiveMode("pan")}><Icon name="pan" size={16} />Pan</button>
            <button type="button" className={mode === "line" ? "is-active" : ""} aria-pressed={mode === "line"} disabled={!activeSite} onClick={() => activateTool("line")}><Icon name="linear" size={16} />Distance</button>
            <button type="button" className={mode === "area" ? "is-active" : ""} aria-pressed={mode === "area"} disabled={!activeSite} onClick={() => activateTool("area")}><Icon name="area" size={16} />Area</button>
            <button type="button" className={mode === "count" ? "is-active" : ""} aria-pressed={mode === "count"} disabled={!activeSite} onClick={() => activateTool("count")}><Icon name="count" size={16} />Count</button>
          </div>

          <div className="property-map-unit-row"><span>Units</span><div role="group" aria-label="Measurement units"><button type="button" aria-pressed={activeSite?.units !== "metric"} className={activeSite?.units !== "metric" ? "is-active" : ""} disabled={!activeSite} onClick={() => updateSite((site) => ({ ...site, units: "imperial" }))}>US</button><button type="button" aria-pressed={activeSite?.units === "metric"} className={activeSite?.units === "metric" ? "is-active" : ""} disabled={!activeSite} onClick={() => updateSite((site) => ({ ...site, units: "metric" }))}>Metric</button></div></div>

          <div className="property-map-totals" aria-label="Property measurement totals">
            <div><span>Distance</span><strong>{activeSite ? `${(lineTotalMeters * (activeSite.units === "imperial" ? 3.280839895 : 1)).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${activeSite.units === "imperial" ? "LF" : "m"}` : "—"}</strong></div>
            <div><span>Area</span><strong>{activeSite ? `${(areaTotalMeters2 * (activeSite.units === "imperial" ? 10.7639104167 : 1)).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${activeSite.units === "imperial" ? "SF" : "m²"}` : "—"}</strong></div>
            <div><span>Count</span><strong>{activeSite ? `${countTotal} EA` : "—"}</strong></div>
          </div>

          <div className="property-map-list-heading"><strong>Measurements</strong><span>{measurements.length}</span></div>
          <div className="property-map-measurement-list">
            {!measurements.length && <div className="property-map-list-empty">Choose a tool, then click the map to place points.</div>}
            {measurements.map((measurement, index) => (
              <article className="property-map-measurement" key={measurement.id}>
                <div><span>{String(index + 1).padStart(2, "0")} · {measurement.type === "line" ? "DISTANCE" : measurement.type.toUpperCase()}</span><strong>{formatPropertyMeasurement(measurement, activeSite?.units)}</strong></div>
                <button type="button" onClick={() => updateSite((site) => ({ ...site, measurements: site.measurements.filter((item) => item.id !== measurement.id) }))} aria-label={`Remove measurement ${index + 1}`} title="Remove measurement">×</button>
              </article>
            ))}
          </div>

          <div className="property-map-panel-actions">
            <button type="button" onClick={downloadCsv} disabled={!measurements.length}><Icon name="download" size={14} />Export CSV</button>
            <button type="button" onClick={clearMeasurements} disabled={!measurements.length}>Clear all</button>
          </div>
          {csvMessage && <div className="property-map-success" role="status">{csvMessage}</div>}
          {activeSite && <p className="property-map-save-note">Measurements for this address save in this browser automatically.</p>}
          <p className="property-map-accuracy-note">Planning estimates only. USGS aerial imagery dates and resolution vary by location; verify important dimensions with current plans or field measurements.</p>
        </aside>
      </div>
    </main>
  );
}
