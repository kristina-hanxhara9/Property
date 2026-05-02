// Map-first property analysis. Click anywhere on the map → reverse-geocode
// to nearest postcode → run a property check → show results in a side drawer.
//
// Uses Leaflet via react-leaflet + free OpenStreetMap tiles. No API key
// required. Constraint overlays use planning.data.gov.uk GeoJSON entity
// endpoints (free) and the Environment Agency flood map service (free WMS).
//
// This is the "Nimbus-style" UX — developers and land sourcers think
// spatially, not by postcode. A pin on a map is the right interaction.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, GeoJSON, LayersControl, WMSTileLayer, CircleMarker, useMap, Polygon, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { streamPostSSE } from '../lib/sseClient.js';
import { apiUrl } from '../lib/api.js';
import RiskBanner from '../components/RiskBanner.jsx';
import { PropertyCards } from '../components/ReportCards.jsx';
import FlagsList from '../components/FlagsList.jsx';
import AISummary from '../components/AISummary.jsx';
import RecommendedSteps from '../components/RecommendedSteps.jsx';
import AgentLog from '../components/AgentLog.jsx';

// Vite/Webpack break Leaflet's default marker icons (the URL gets bundled
// wrong). Override with explicit URLs from the public CDN.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const UK_CENTER = [54.5, -2.5];
const UK_ZOOM = 6;
const LONDON = [51.5074, -0.1278];

export default function MapView() {
  const [marker, setMarker] = useState(null);
  const [postcodeInfo, setPostcodeInfo] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [steps, setSteps] = useState([]);
  const [report, setReport] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState(null);
  const [overlays, setOverlays] = useState({
    conservation: null,
    listed: null,
    flood: false, // toggle, uses WMS so no fetch
    aonb: null,
    greenBelt: null,
  });
  const [overlaysLoading, setOverlaysLoading] = useState(false);
  const [salePins, setSalePins] = useState([]);
  const [salePinsLoading, setSalePinsLoading] = useState(false);
  const [showSalePins, setShowSalePins] = useState(true);
  const [savedSearches, setSavedSearches] = useState(() => loadSavedSearches());
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [recallTarget, setRecallTarget] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePins, setComparePins] = useState([]); // [{id, lat, lng, postcode, report}]
  const [showCompareDrawer, setShowCompareDrawer] = useState(false);
  const [showImdHeatmap, setShowImdHeatmap] = useState(false);
  const [imdPoints, setImdPoints] = useState([]);
  const [imdLoading, setImdLoading] = useState(false);
  const [polygonMode, setPolygonMode] = useState(false);
  const [polygonVertices, setPolygonVertices] = useState([]);
  const [polygonClosed, setPolygonClosed] = useState(false);
  const abortRef = useRef(null);
  const salesAbortRef = useRef(null);
  const imdAbortRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem('propertyiq.savedSearches', JSON.stringify(savedSearches));
    } catch {
      // Quota exceeded or private mode — silently ignore.
    }
  }, [savedSearches]);

  const saveCurrentSearch = useCallback(
    (label) => {
      if (!marker) return;
      setSavedSearches((prev) => {
        const next = [
          {
            id: `${Date.now()}`,
            label: label || postcodeInfo?.postcode || `${marker.lat.toFixed(4)}, ${marker.lng.toFixed(4)}`,
            postcode: postcodeInfo?.postcode || null,
            adminDistrict: postcodeInfo?.admin_district || null,
            latitude: marker.lat,
            longitude: marker.lng,
            savedAt: new Date().toISOString(),
            riskLevel: report?.riskLevel || null,
            riskScore: report?.riskScore || null,
          },
          ...prev.filter(
            (s) =>
              !(Math.abs(s.latitude - marker.lat) < 1e-4 && Math.abs(s.longitude - marker.lng) < 1e-4),
          ),
        ];
        return next.slice(0, 25);
      });
    },
    [marker, postcodeInfo, report],
  );

  const deleteSavedSearch = useCallback((id) => {
    setSavedSearches((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const recallSavedSearch = useCallback((s) => {
    setRecallTarget({ lat: s.latitude, lng: s.longitude });
    setShowSavedPanel(false);
    handleMapClick({ lat: s.latitude, lng: s.longitude });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStep = useCallback((step) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.name === step.name);
      if (idx === -1) return [...prev, step];
      const next = [...prev];
      next[idx] = { ...next[idx], ...step };
      return next;
    });
  }, []);

  async function handleMapClick(latlng) {
    if (polygonMode) {
      if (polygonClosed) return;
      setPolygonVertices((v) => [...v, [latlng.lat, latlng.lng]]);
      return;
    }
    if (compareMode) {
      handleCompareClick(latlng);
      return;
    }
    setMarker(latlng);
    setDrawerOpen(true);
    setSteps([]);
    setReport(null);
    setStreamingText('');
    setError(null);
    setIsStreaming(true);
    setIsComplete(false);

    // Reverse-geocode the click to a real postcode
    let pcInfo = null;
    try {
      const res = await fetch(
        `https://api.postcodes.io/postcodes?lon=${latlng.lng}&lat=${latlng.lat}&limit=1&radius=2000`,
      );
      const body = await res.json();
      pcInfo = body?.result?.[0] || null;
      setPostcodeInfo(pcInfo);
    } catch (err) {
      setError(`Reverse geocode failed: ${err.message}`);
      setIsStreaming(false);
      return;
    }

    if (!pcInfo) {
      setError('No UK postcode within 2km of that point.');
      setIsStreaming(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    let aiBuffer = '';
    try {
      await streamPostSSE(
        apiUrl('/api/property-check'),
        { address: pcInfo.postcode, postcode: pcInfo.postcode },
        {
          step: (data) => updateStep(data),
          'ai-delta': (data) => {
            aiBuffer += data.text || '';
            setStreamingText(aiBuffer);
          },
          report: (data) => {
            setReport(data);
            setIsComplete(true);
            setIsStreaming(false);
          },
          error: (data) => {
            setError(data.message || 'Unknown error');
            setIsStreaming(false);
          },
        },
        controller.signal,
      );
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
      setIsStreaming(false);
    }
  }

  async function handleCompareClick(latlng) {
    if (comparePins.length >= 3) return;
    const id = `cmp-${Date.now()}`;
    const placeholder = {
      id,
      lat: latlng.lat,
      lng: latlng.lng,
      postcode: null,
      adminDistrict: null,
      report: null,
      loading: true,
      error: null,
    };
    setComparePins((prev) => [...prev, placeholder]);
    setShowCompareDrawer(true);

    let pcInfo = null;
    try {
      const r = await fetch(
        `https://api.postcodes.io/postcodes?lon=${latlng.lng}&lat=${latlng.lat}&limit=1&radius=2000`,
      );
      const b = await r.json();
      pcInfo = b?.result?.[0] || null;
    } catch {
      pcInfo = null;
    }
    if (!pcInfo) {
      setComparePins((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, loading: false, error: 'No UK postcode within 2km.' } : p,
        ),
      );
      return;
    }
    setComparePins((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, postcode: pcInfo.postcode, adminDistrict: pcInfo.admin_district }
          : p,
      ),
    );

    try {
      await streamPostSSE(
        apiUrl('/api/property-check'),
        { address: pcInfo.postcode, postcode: pcInfo.postcode },
        {
          report: (data) => {
            setComparePins((prev) =>
              prev.map((p) => (p.id === id ? { ...p, report: data, loading: false } : p)),
            );
          },
          error: (data) => {
            setComparePins((prev) =>
              prev.map((p) =>
                p.id === id
                  ? { ...p, loading: false, error: data?.message || 'Analysis failed' }
                  : p,
              ),
            );
          },
        },
        new AbortController().signal,
      );
    } catch (err) {
      setComparePins((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, loading: false, error: err.message } : p,
        ),
      );
    }
  }

  function clearComparePins() {
    setComparePins([]);
    setShowCompareDrawer(false);
  }

  const polygonSales = useMemo(() => {
    if (!polygonClosed || polygonVertices.length < 3) return [];
    return salePins.filter((s) =>
      pointInPolygon([s.latitude, s.longitude], polygonVertices),
    );
  }, [polygonClosed, polygonVertices, salePins]);

  const polygonStats = useMemo(() => {
    if (polygonSales.length === 0) {
      return { count: 0, areaHa: polygonClosed ? polygonAreaHa(polygonVertices) : null };
    }
    const prices = polygonSales.map((s) => s.price).filter((p) => p > 0).sort((a, b) => a - b);
    const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;
    const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    return {
      count: polygonSales.length,
      areaHa: polygonAreaHa(polygonVertices),
      avg: avg ? Math.round(avg) : null,
      median,
      min: prices[0] || null,
      max: prices[prices.length - 1] || null,
    };
  }, [polygonSales, polygonClosed, polygonVertices]);

  function startPolygon() {
    setPolygonMode(true);
    setPolygonVertices([]);
    setPolygonClosed(false);
    setCompareMode(false);
    setDrawerOpen(false);
  }

  function finishPolygon() {
    if (polygonVertices.length < 3) return;
    setPolygonClosed(true);
  }

  function clearPolygon() {
    setPolygonMode(false);
    setPolygonVertices([]);
    setPolygonClosed(false);
  }

  const fetchImdHeatmap = useCallback(async ({ latitude, longitude, radiusMeters }) => {
    imdAbortRef.current?.abort();
    const controller = new AbortController();
    imdAbortRef.current = controller;
    setImdLoading(true);
    try {
      const res = await fetch(apiUrl('/api/area-imd'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude, radiusMeters, maxPostcodes: 80 }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`IMD API returned ${res.status}`);
      const body = await res.json();
      setImdPoints(body?.points || []);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('IMD heatmap fetch failed:', err.message);
      }
    } finally {
      setImdLoading(false);
    }
  }, []);

  const fetchSalesInArea = useCallback(async ({ latitude, longitude, radiusMeters }) => {
    salesAbortRef.current?.abort();
    const controller = new AbortController();
    salesAbortRef.current = controller;
    setSalePinsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/sales-in-area'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude,
          longitude,
          radiusMeters,
          maxPostcodes: 25,
          limitPerPostcode: 12,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Sales API returned ${res.status}`);
      const body = await res.json();
      setSalePins(body?.sales || []);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Sales-in-area fetch failed:', err.message);
      }
    } finally {
      setSalePinsLoading(false);
    }
  }, []);

  // Fetch a constraint overlay from planning.data.gov.uk (GeoJSON).
  async function loadConstraint(dataset) {
    if (overlays[dataset]) return; // already loaded
    if (!marker) return;
    setOverlaysLoading(true);
    try {
      const url = new URL('https://www.planning.data.gov.uk/entity.geojson');
      url.searchParams.set('dataset', dataset);
      url.searchParams.set('latitude', String(marker.lat));
      url.searchParams.set('longitude', String(marker.lng));
      url.searchParams.set('limit', '50');
      const res = await fetch(url);
      if (res.ok) {
        const geojson = await res.json();
        setOverlays((prev) => ({ ...prev, [dataset]: geojson }));
      }
    } catch (err) {
      console.warn('Constraint overlay fetch failed', err);
    } finally {
      setOverlaysLoading(false);
    }
  }

  useEffect(() => {
    if (!marker) return;
    // Auto-load nearby constraints when a pin drops
    loadConstraint('conservation-area');
    loadConstraint('listed-building-outline');
    loadConstraint('area-of-outstanding-natural-beauty');
    loadConstraint('green-belt');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marker]);

  return (
    <div className="-mx-4 -my-8 flex h-[calc(100vh-72px)] flex-col sm:-mx-6 sm:-my-12">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-200 bg-white px-4 py-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">
            Map view
          </p>
          <h1 className="font-display text-base font-bold text-ink">
            Click anywhere on the map to analyse the property at that point
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {marker && (
            <>
              <button
                type="button"
                onClick={() => saveCurrentSearch()}
                disabled={!marker}
                className="rounded-full bg-claude-50 px-3 py-1.5 text-xs font-semibold text-claude-700 hover:bg-claude-100 disabled:opacity-50"
              >
                ★ Save this location
              </button>
              <span className="text-xs text-slate-600">
                {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
                {postcodeInfo && (
                  <span className="ml-2 font-semibold text-claude-700">
                    · {postcodeInfo.postcode}
                  </span>
                )}
              </span>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setCompareMode((v) => {
                const next = !v;
                if (next) {
                  setShowCompareDrawer(true);
                  setPolygonMode(false);
                  setPolygonClosed(false);
                  setPolygonVertices([]);
                }
                return next;
              });
            }}
            className={
              compareMode
                ? 'rounded-full bg-claude px-3 py-1.5 text-xs font-semibold text-white hover:bg-claude-700'
                : 'rounded-full bg-cream-100 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-cream-200'
            }
          >
            ⚖ Compare ({comparePins.length}/3)
          </button>
          <button
            type="button"
            onClick={() => (polygonMode ? clearPolygon() : startPolygon())}
            className={
              polygonMode
                ? 'rounded-full bg-claude px-3 py-1.5 text-xs font-semibold text-white hover:bg-claude-700'
                : 'rounded-full bg-cream-100 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-cream-200'
            }
          >
            ▱ Draw area
            {polygonVertices.length > 0 && ` (${polygonVertices.length})`}
          </button>
          <button
            type="button"
            onClick={() => setShowSavedPanel((v) => !v)}
            className="rounded-full bg-cream-100 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-cream-200"
          >
            📌 Saved ({savedSearches.length})
          </button>
        </div>
      </div>

      <div className="relative flex-1">
        <MapContainer
          center={LONDON}
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          minZoom={5}
          maxZoom={19}
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="OpenStreetMap">
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
                maxZoom={19}
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="OpenStreetMap (Humanitarian)">
              <TileLayer
                url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap France"
              />
            </LayersControl.BaseLayer>

            <LayersControl.Overlay name="Flood Zone 3 (high risk)">
              <WMSTileLayer
                url="https://environment.data.gov.uk/spatialdata/flood-map-for-planning-rivers-and-sea-flood-zone-3/wms"
                layers="Flood_Map_for_Planning_Rivers_and_Sea_Flood_Zone_3"
                format="image/png"
                transparent
                opacity={0.5}
                attribution="Environment Agency"
              />
            </LayersControl.Overlay>

            <LayersControl.Overlay name="Flood Zone 2 (medium risk)">
              <WMSTileLayer
                url="https://environment.data.gov.uk/spatialdata/flood-map-for-planning-rivers-and-sea-flood-zone-2/wms"
                layers="Flood_Map_for_Planning_Rivers_and_Sea_Flood_Zone_2"
                format="image/png"
                transparent
                opacity={0.4}
                attribution="Environment Agency"
              />
            </LayersControl.Overlay>

            {overlays['conservation-area']?.features?.length > 0 && (
              <LayersControl.Overlay checked name={`Conservation areas (${overlays['conservation-area'].features.length})`}>
                <GeoJSON
                  data={overlays['conservation-area']}
                  style={{ color: '#854F0B', fillColor: '#FAEEDA', weight: 1.5, fillOpacity: 0.4 }}
                />
              </LayersControl.Overlay>
            )}

            {overlays['listed-building-outline']?.features?.length > 0 && (
              <LayersControl.Overlay checked name={`Listed buildings (${overlays['listed-building-outline'].features.length})`}>
                <GeoJSON
                  data={overlays['listed-building-outline']}
                  style={{ color: '#A32D2D', fillColor: '#FCEBEB', weight: 1.5, fillOpacity: 0.5 }}
                />
              </LayersControl.Overlay>
            )}

            {overlays['area-of-outstanding-natural-beauty']?.features?.length > 0 && (
              <LayersControl.Overlay name={`AONB (${overlays['area-of-outstanding-natural-beauty'].features.length})`}>
                <GeoJSON
                  data={overlays['area-of-outstanding-natural-beauty']}
                  style={{ color: '#3B6D11', fillColor: '#EAF3DE', weight: 1.5, fillOpacity: 0.3 }}
                />
              </LayersControl.Overlay>
            )}

            {overlays['green-belt']?.features?.length > 0 && (
              <LayersControl.Overlay name={`Green Belt (${overlays['green-belt'].features.length})`}>
                <GeoJSON
                  data={overlays['green-belt']}
                  style={{ color: '#185FA5', fillColor: '#E6F1FB', weight: 1.5, fillOpacity: 0.3 }}
                />
              </LayersControl.Overlay>
            )}
          </LayersControl>

          <ClickHandler onClick={handleMapClick} />
          {polygonMode && polygonVertices.length > 0 && !polygonClosed && (
            <Polyline
              positions={polygonVertices}
              pathOptions={{ color: '#854f0b', weight: 2, dashArray: '5, 5' }}
            />
          )}
          {polygonMode && polygonVertices.length > 0 && (
            <>
              {polygonVertices.map((v, i) => (
                <CircleMarker
                  key={`vtx-${i}`}
                  center={v}
                  radius={4}
                  pathOptions={{ color: '#854f0b', fillColor: '#854f0b', fillOpacity: 1, weight: 1 }}
                />
              ))}
            </>
          )}
          {polygonClosed && polygonVertices.length >= 3 && (
            <Polygon
              positions={polygonVertices}
              pathOptions={{ color: '#854f0b', fillColor: '#fde68a', weight: 2, fillOpacity: 0.25 }}
            />
          )}
          <SalesViewportLoader enabled={showSalePins && !compareMode} onLoad={fetchSalesInArea} />
          <SalesViewportLoader enabled={showImdHeatmap} onLoad={fetchImdHeatmap} />
          <MapRecaller target={recallTarget} />
          {showImdHeatmap && imdPoints.map((p, i) => (
            <CircleMarker
              key={`imd-${p.postcode}-${i}`}
              center={[p.latitude, p.longitude]}
              radius={14}
              pathOptions={{
                color: imdDecileColour(p.imdDecile),
                fillColor: imdDecileColour(p.imdDecile),
                weight: 0,
                fillOpacity: 0.45,
              }}
            >
              <Popup>
                <strong>{p.postcode}</strong>
                <br />
                IMD decile {p.imdDecile}/10 ({imdDecileLabel(p.imdDecile)})
                {p.adminDistrict && (
                  <>
                    <br />
                    {p.adminDistrict}
                  </>
                )}
              </Popup>
            </CircleMarker>
          ))}
          {comparePins.map((p, i) => (
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              icon={makeNumberedIcon(i + 1, p.report?.riskLevel)}
            >
              <Popup>
                <strong>Pin {i + 1}</strong>
                {p.postcode && <span> · {p.postcode}</span>}
                <br />
                {p.loading && 'Analysing…'}
                {p.error && <span style={{ color: '#a32d2d' }}>{p.error}</span>}
                {p.report && (
                  <>
                    Risk: {p.report.riskLevel} ({p.report.riskScore}/10)
                    <br />
                    Last sale: {p.report.lastSalePrice ? formatGBP(p.report.lastSalePrice) : '—'}
                  </>
                )}
              </Popup>
            </Marker>
          ))}
          {showSalePins && salePins.map((s, i) => (
            <CircleMarker
              key={`${s.postcode}-${s.date}-${s.price}-${i}`}
              center={[s.latitude, s.longitude]}
              radius={6}
              pathOptions={{
                color: pinColourForDate(s.date),
                fillColor: pinColourForDate(s.date),
                weight: 1,
                fillOpacity: 0.75,
              }}
            >
              <Popup>
                <strong>{formatGBP(s.price)}</strong>
                <br />
                {s.date} · {s.propertyType || 'Unknown type'}
                <br />
                <span className="text-xs">{s.address}</span>
              </Popup>
            </CircleMarker>
          ))}
          {marker && (
            <Marker position={marker}>
              <Popup>
                {postcodeInfo ? (
                  <>
                    <strong>{postcodeInfo.postcode}</strong>
                    <br />
                    {postcodeInfo.admin_district}
                    <br />
                    <span className="text-xs">
                      {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
                    </span>
                  </>
                ) : (
                  <>
                    <strong>Pinned location</strong>
                    <br />
                    {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
                  </>
                )}
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {!marker && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-cream-200 bg-white/95 px-6 py-4 text-center shadow-lg">
            <p className="font-display text-lg font-bold text-ink">📍 Click any point</p>
            <p className="mt-1 max-w-xs text-sm text-slate-600">
              Drop a pin anywhere in England, Scotland, Wales or Northern Ireland to run a full
              property due diligence check at that location.
            </p>
          </div>
        )}

        {polygonMode && (
          <div className="absolute right-4 top-16 z-[1000] w-72 rounded-xl border border-cream-200 bg-white/95 p-3 shadow">
            <p className="font-display text-sm font-bold text-ink">Draw an area</p>
            {!polygonClosed ? (
              <p className="mt-1 text-[11px] text-slate-600">
                Click on the map to drop vertices. Add at least 3, then press &ldquo;Finish&rdquo; to
                close the polygon and see all sales inside.
              </p>
            ) : (
              <div className="mt-1 space-y-1 text-[11px] text-slate-700">
                <p>
                  <strong>{polygonStats.count}</strong> sale
                  {polygonStats.count === 1 ? '' : 's'} inside
                  {polygonStats.areaHa != null && (
                    <> · {polygonStats.areaHa.toFixed(2)} ha</>
                  )}
                </p>
                {polygonStats.median != null && (
                  <>
                    <p>Median: {formatGBP(polygonStats.median)}</p>
                    <p>Avg: {formatGBP(polygonStats.avg)}</p>
                    <p>
                      Range: {formatGBP(polygonStats.min)} – {formatGBP(polygonStats.max)}
                    </p>
                  </>
                )}
                {polygonStats.count === 0 && (
                  <p className="italic text-slate-500">
                    No Land Registry sales loaded inside the polygon. Make sure sale pins are on
                    and you&rsquo;re zoomed in (zoom 14+).
                  </p>
                )}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              {!polygonClosed && (
                <button
                  type="button"
                  disabled={polygonVertices.length < 3}
                  onClick={finishPolygon}
                  className="flex-1 rounded-full bg-claude px-3 py-1 text-xs font-semibold text-white hover:bg-claude-700 disabled:opacity-50"
                >
                  Finish ({polygonVertices.length}/3+)
                </button>
              )}
              <button
                type="button"
                onClick={clearPolygon}
                className="flex-1 rounded-full bg-cream-100 px-3 py-1 text-xs font-semibold text-ink hover:bg-cream-200"
              >
                Cancel
              </button>
            </div>
            {polygonClosed && polygonStats.count > 0 && (
              <details className="mt-2 max-h-48 overflow-y-auto rounded bg-cream-50 p-1.5 text-[10px]">
                <summary className="cursor-pointer font-semibold text-claude-700">
                  Show sales list
                </summary>
                <ul className="mt-1 divide-y divide-cream-100">
                  {polygonSales.map((s, i) => (
                    <li key={i} className="py-1">
                      <span className="font-semibold">{formatGBP(s.price)}</span> · {s.date}
                      <br />
                      <span className="text-slate-500">{s.address}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {showSavedPanel && (
          <div className="absolute right-4 top-16 z-[1100] w-80 max-h-[70vh] overflow-y-auto rounded-xl border border-cream-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-cream-200 px-3 py-2">
              <p className="font-display text-sm font-bold text-ink">Saved searches</p>
              <button
                type="button"
                onClick={() => setShowSavedPanel(false)}
                className="text-sm text-slate-500 hover:text-ink"
                aria-label="Close saved searches"
              >
                ✕
              </button>
            </div>
            {savedSearches.length === 0 ? (
              <p className="p-3 text-xs text-slate-500">
                No saved searches yet. Click anywhere on the map then press &ldquo;★ Save this
                location&rdquo; to keep it here. Stored in your browser only.
              </p>
            ) : (
              <ul className="divide-y divide-cream-100">
                {savedSearches.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-cream-50"
                  >
                    <button
                      type="button"
                      onClick={() => recallSavedSearch(s)}
                      className="flex-1 text-left"
                    >
                      <p className="font-semibold text-ink">{s.label}</p>
                      <p className="text-[10px] text-slate-500">
                        {s.adminDistrict || `${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}`}
                        {s.riskLevel && (
                          <span className="ml-1 font-semibold text-claude-700">
                            · {s.riskLevel}
                            {s.riskScore != null ? ` (${s.riskScore}/10)` : ''}
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(s.savedAt).toLocaleDateString('en-GB')}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedSearch(s.id)}
                      aria-label="Delete saved search"
                      className="text-slate-400 hover:text-crit-text"
                    >
                      🗑
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {overlaysLoading && (
          <div className="absolute right-4 top-4 z-[1000] rounded-full bg-white/95 px-3 py-1 text-xs text-claude-700 shadow ring-1 ring-cream-200">
            Loading constraints…
          </div>
        )}

        <div className="absolute left-4 top-4 z-[1000] flex flex-col gap-1.5 rounded-xl border border-cream-200 bg-white/95 p-2 shadow">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink">
            <input
              type="checkbox"
              checked={showSalePins}
              onChange={(e) => setShowSalePins(e.target.checked)}
              className="h-3.5 w-3.5 accent-claude-700"
            />
            Land Registry sale pins
            {salePinsLoading && <span className="text-claude-700">⟳</span>}
            {!salePinsLoading && salePins.length > 0 && (
              <span className="text-claude-700">({salePins.length})</span>
            )}
          </label>
          {showSalePins && salePins.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" /> &lt;1y
              <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> 1-3y
              <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full bg-orange-500" /> 3-7y
              <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full bg-slate-400" /> &gt;7y
            </div>
          )}

          <label className="mt-1 flex cursor-pointer items-center gap-2 border-t border-cream-100 pt-1.5 text-xs font-semibold text-ink">
            <input
              type="checkbox"
              checked={showImdHeatmap}
              onChange={(e) => setShowImdHeatmap(e.target.checked)}
              className="h-3.5 w-3.5 accent-claude-700"
            />
            IMD deprivation heatmap
            {imdLoading && <span className="text-claude-700">⟳</span>}
            {!imdLoading && imdPoints.length > 0 && (
              <span className="text-claude-700">({imdPoints.length})</span>
            )}
          </label>
          {showImdHeatmap && imdPoints.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-600">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#a32d2d' }} /> 1-2 most deprived
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#f59e0b' }} /> 3-4
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#ca8a04' }} /> 5-6
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#65a30d' }} /> 7-8
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#15803d' }} /> 9-10 least deprived
            </div>
          )}

          {(showSalePins || showImdHeatmap) && (
            <p className="max-w-[220px] text-[10px] leading-snug text-slate-500">
              Zoom in to street level (zoom 14+) to load data for the visible area.
            </p>
          )}
        </div>
      </div>

      {drawerOpen && !compareMode && (
        <ResultDrawer
          onClose={() => setDrawerOpen(false)}
          steps={steps}
          report={report}
          streamingText={streamingText}
          isStreaming={isStreaming}
          isComplete={isComplete}
          error={error}
          postcode={postcodeInfo?.postcode}
        />
      )}

      {compareMode && showCompareDrawer && (
        <CompareDrawer
          pins={comparePins}
          onClose={() => setShowCompareDrawer(false)}
          onClear={clearComparePins}
          onRemovePin={(id) => setComparePins((prev) => prev.filter((p) => p.id !== id))}
        />
      )}
    </div>
  );
}

function ClickHandler({ onClick }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng);
    },
  });
  return null;
}

// Load Land Registry sale pins whenever the map view stops moving — but only
// when zoomed in enough to make per-street pins useful (zoom >= 14 ≈ a few
// streets across). Computes a sensible radius from the current viewport so we
// fetch only what's visible.
function SalesViewportLoader({ enabled, onLoad }) {
  const map = useMap();
  const lastFetchRef = useRef({ lat: null, lng: null, zoom: null });

  useEffect(() => {
    if (!enabled) return undefined;
    function maybeLoad() {
      const zoom = map.getZoom();
      if (zoom < 14) return; // too zoomed-out — skip
      const center = map.getCenter();
      const last = lastFetchRef.current;
      // Skip if we're within ~150m of the last fetch at the same zoom.
      if (
        last.zoom === zoom &&
        last.lat != null &&
        haversine(last.lat, last.lng, center.lat, center.lng) < 150
      ) {
        return;
      }
      lastFetchRef.current = { lat: center.lat, lng: center.lng, zoom };
      // Use viewport diagonal as the search radius, clamped to API max.
      const bounds = map.getBounds();
      const diag = haversine(
        bounds.getNorth(),
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
      );
      const radius = Math.min(2000, Math.max(400, Math.round(diag / 2)));
      onLoad({ latitude: center.lat, longitude: center.lng, radiusMeters: radius });
    }
    maybeLoad();
    map.on('moveend', maybeLoad);
    map.on('zoomend', maybeLoad);
    return () => {
      map.off('moveend', maybeLoad);
      map.off('zoomend', maybeLoad);
    };
  }, [map, enabled, onLoad]);
  return null;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Ray-casting point-in-polygon. Polygon is [[lat, lng], ...].
function pointInPolygon([lat, lng], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Spherical excess polygon area, returned in hectares.
// Accurate enough for small areas at UK latitudes.
function polygonAreaHa(latlngs) {
  if (!latlngs || latlngs.length < 3) return null;
  const R = 6378137; // WGS84 mean radius (m)
  let area = 0;
  for (let i = 0; i < latlngs.length; i++) {
    const [lat1, lon1] = latlngs[i];
    const [lat2, lon2] = latlngs[(i + 1) % latlngs.length];
    area += ((lon2 - lon1) * Math.PI) / 180 * (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  area = Math.abs((area * R * R) / 2); // m²
  return area / 10000; // ha
}

function imdDecileColour(decile) {
  if (decile == null) return '#94a3b8';
  if (decile <= 2) return '#a32d2d'; // most deprived
  if (decile <= 4) return '#f59e0b';
  if (decile <= 6) return '#ca8a04';
  if (decile <= 8) return '#65a30d';
  return '#15803d'; // least deprived
}

function imdDecileLabel(decile) {
  if (decile == null) return 'Unknown';
  if (decile <= 2) return 'most deprived 20%';
  if (decile <= 4) return 'below median';
  if (decile <= 6) return 'around median';
  if (decile <= 8) return 'above median';
  return 'least deprived 20%';
}

function pinColourForDate(dateStr) {
  if (!dateStr) return '#94a3b8';
  const ageYears =
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (ageYears < 1) return '#059669'; // emerald-600
  if (ageYears < 3) return '#f59e0b'; // amber-500
  if (ageYears < 7) return '#f97316'; // orange-500
  return '#94a3b8'; // slate-400
}

function formatGBP(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value);
}

function loadSavedSearches() {
  try {
    const raw = localStorage.getItem('propertyiq.savedSearches');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function MapRecaller({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [target, map]);
  return null;
}

function makeNumberedIcon(n, riskLevel) {
  const colour =
    riskLevel === 'critical'
      ? '#a32d2d'
      : riskLevel === 'high'
      ? '#d97706'
      : riskLevel === 'medium'
      ? '#854f0b'
      : riskLevel === 'low'
      ? '#3b6d11'
      : '#185fa5';
  return L.divIcon({
    className: 'compare-pin',
    html: `<div style="background:${colour};color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,0.4);border:2px solid #fff;">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function CompareDrawer({ pins, onClose, onClear, onRemovePin }) {
  return (
    <div className="absolute inset-y-0 right-0 z-[1100] flex w-full flex-col border-l border-cream-200 bg-cream-50 shadow-xl sm:w-[820px]">
      <div className="flex items-center justify-between border-b border-cream-200 bg-white px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">
            Compare mode · click up to 3 points on the map
          </p>
          <h2 className="font-display text-lg font-bold text-ink">
            Side-by-side ({pins.length}/3)
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {pins.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full bg-cream-100 px-3 py-1 text-xs font-semibold text-ink hover:bg-cream-200"
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full bg-cream-100 px-2 py-1 text-sm font-bold text-ink hover:bg-cream-200"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {pins.length === 0 ? (
          <p className="text-sm text-slate-600">
            Click anywhere on the map to drop the first comparison pin. You can add up to three.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {pins.map((p, i) => (
              <ComparePinCard
                key={p.id}
                index={i + 1}
                pin={p}
                onRemove={() => onRemovePin(p.id)}
              />
            ))}
          </div>
        )}

        {pins.length >= 2 && pins.every((p) => p.report) && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-cream-200 bg-white p-3">
            <p className="font-display text-sm font-bold text-ink">Quick comparison</p>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="border-b border-cream-200 text-left">
                  <th className="px-2 py-1 font-semibold text-claude-700">Metric</th>
                  {pins.map((p, i) => (
                    <th key={p.id} className="px-2 py-1 font-semibold text-claude-700">
                      Pin {i + 1} ({p.postcode})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                <CompareRow label="Risk" pins={pins} get={(r) => `${r.riskLevel} (${r.riskScore}/10)`} />
                <CompareRow
                  label="Last sale"
                  pins={pins}
                  get={(r) => (r.lastSalePrice ? `${formatGBP(r.lastSalePrice)} (${r.lastSaleDate})` : '—')}
                />
                <CompareRow label="5yr growth" pins={pins} get={(r) => r.priceGrowth5yr || '—'} />
                <CompareRow label="EPC" pins={pins} get={(r) => r.epcData?.currentRating || '—'} />
                <CompareRow
                  label="Flood (river/sea)"
                  pins={pins}
                  get={(r) => r.floodRisk?.riverAndSea || '—'}
                />
                <CompareRow
                  label="Conservation area"
                  pins={pins}
                  get={(r) => (r.planningConstraints?.conservationArea?.present ? 'Yes' : 'No')}
                />
                <CompareRow
                  label="Listed building"
                  pins={pins}
                  get={(r) => (r.planningConstraints?.listedBuilding?.present ? 'Yes' : 'No')}
                />
                <CompareRow
                  label="Demand (proxy)"
                  pins={pins}
                  get={(r) => r.marketContext?.demandRating || '—'}
                />
                <CompareRow
                  label="IMD decile"
                  pins={pins}
                  get={(r) => (r.marketContext?.deprivationDecile != null ? `${r.marketContext.deprivationDecile}/10` : '—')}
                />
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CompareRow({ label, pins, get }) {
  return (
    <tr>
      <td className="px-2 py-1 font-semibold text-slate-600">{label}</td>
      {pins.map((p) => (
        <td key={p.id} className="px-2 py-1 text-ink">
          {p.report ? get(p.report) : p.error ? <span className="text-crit-text">error</span> : '…'}
        </td>
      ))}
    </tr>
  );
}

function ComparePinCard({ index, pin, onRemove }) {
  const r = pin.report;
  return (
    <div className="rounded-xl border border-cream-200 bg-white p-3 text-xs">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-bold text-ink">
          Pin {index}
          {pin.postcode && <span className="ml-2 text-claude-700">{pin.postcode}</span>}
        </p>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove pin"
          className="text-slate-400 hover:text-crit-text"
        >
          ✕
        </button>
      </div>
      {pin.adminDistrict && <p className="mt-0.5 text-[11px] text-slate-500">{pin.adminDistrict}</p>}
      {pin.loading && <p className="mt-2 text-claude-700">Analysing…</p>}
      {pin.error && <p className="mt-2 text-crit-text">{pin.error}</p>}
      {r && (
        <dl className="mt-2 space-y-1.5">
          <DRow label="Risk" value={`${r.riskLevel} (${r.riskScore}/10)`} />
          <DRow label="Last sale" value={r.lastSalePrice ? formatGBP(r.lastSalePrice) : '—'} />
          <DRow label="5yr growth" value={r.priceGrowth5yr || '—'} />
          <DRow label="EPC" value={r.epcData?.currentRating || '—'} />
          <DRow label="Flood" value={r.floodRisk?.riverAndSea || '—'} />
          <DRow label="Demand" value={r.marketContext?.demandRating || '—'} />
        </dl>
      )}
    </div>
  );
}

function DRow({ label, value }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-ink">{value}</dd>
    </div>
  );
}

function ResultDrawer({ onClose, steps, report, streamingText, isStreaming, isComplete, error, postcode }) {
  return (
    <div className="absolute inset-y-0 right-0 z-[1000] flex w-full flex-col border-l border-cream-200 bg-cream-50 shadow-xl sm:w-[600px]">
      <div className="flex items-center justify-between border-b border-cream-200 bg-white px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">
            Site assessment
          </p>
          <h2 className="font-display text-lg font-bold text-ink">{postcode || 'Loading…'}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full bg-cream-100 px-2 py-1 text-sm font-bold text-ink hover:bg-cream-200"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!isComplete && <AgentLog steps={steps} />}

        {error && (
          <div className="card border-l-4 border-l-crit-text">
            <h3 className="font-display text-lg font-bold text-crit-text">Couldn't analyse</h3>
            <p className="mt-2 text-sm text-slate-700">{error}</p>
          </div>
        )}

        {report && (
          <>
            <RiskBanner report={report} />
            <PropertyCards report={report} />
            <FlagsList flags={report.flags} />
            <AISummary
              report={report}
              streamingText={streamingText}
              isStreaming={isStreaming && !isComplete}
            />
            <RecommendedSteps report={report} />
          </>
        )}
      </div>
    </div>
  );
}
