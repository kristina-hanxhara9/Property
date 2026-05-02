// Map-first property analysis. Click anywhere on the map → reverse-geocode
// to nearest postcode → run a property check → show results in a side drawer.
//
// Uses Leaflet via react-leaflet + free OpenStreetMap tiles. No API key
// required. Constraint overlays use planning.data.gov.uk GeoJSON entity
// endpoints (free) and the Environment Agency flood map service (free WMS).
//
// This is the "Nimbus-style" UX — developers and land sourcers think
// spatially, not by postcode. A pin on a map is the right interaction.

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, GeoJSON, LayersControl, WMSTileLayer } from 'react-leaflet';
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
  const abortRef = useRef(null);

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
        {marker && (
          <div className="text-xs text-slate-600">
            {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
            {postcodeInfo && (
              <span className="ml-2 font-semibold text-claude-700">
                · {postcodeInfo.postcode}
              </span>
            )}
          </div>
        )}
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

        {overlaysLoading && (
          <div className="absolute right-4 top-4 z-[1000] rounded-full bg-white/95 px-3 py-1 text-xs text-claude-700 shadow ring-1 ring-cream-200">
            Loading constraints…
          </div>
        )}
      </div>

      {drawerOpen && (
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
