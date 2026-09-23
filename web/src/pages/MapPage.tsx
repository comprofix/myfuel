import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { api, type FuelType, type Locality, type StationDetail, type StationSummary } from '../api';
import { LocalitySearch } from '../components/LocalitySearch';
import { StationPopup } from '../components/StationPopup';
import { brandStyle, teardropSvg } from '../brands';
import { formatPrice, isStale, timeAgo } from '../format';

const MIN_ZOOM_FOR_STATIONS = 11;
const DEFAULT_VIEW = { lat: -33.8688, lng: 151.2093, zoom: 12 };

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`myfuel.${key}`);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function savePref(key: string, value: unknown) {
  try { localStorage.setItem(`myfuel.${key}`, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

type Tier = 'cheap' | 'mid' | 'dear';

/** Split visible stations into thirds by price rank */
function tiers(stations: StationSummary[]): Map<number, Tier> {
  const out = new Map<number, Tier>();
  const n = stations.length;
  stations.forEach((s, i) => out.set(s.id, n < 3 ? 'mid' : i < n / 3 ? 'cheap' : i < (2 * n) / 3 ? 'mid' : 'dear'));
  return out;
}

// Price label (colour = cheap/mid/dear) above a brand teardrop whose tip marks the station
const MARKER_W = 52;
const MARKER_H = 60;

const iconCache = new Map<string, L.DivIcon>();
function stationIcon(price: number, brand: string | null, tier: Tier, selected: boolean, stale: boolean): L.DivIcon {
  const b = brandStyle(brand);
  const key = `${price}|${b.key}|${tier}|${selected}|${stale}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: '',
      html: `<div class="marker${selected ? ' selected' : ''}${stale ? ' stale' : ''}" title="${b.label}">
        <div class="pin ${tier}">${formatPrice(price)}</div>${teardropSvg(b)}</div>`,
      iconSize: [MARKER_W, MARKER_H],
      iconAnchor: [MARKER_W / 2, MARKER_H],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

function ViewportWatcher({ onChange }: { onChange: (bounds: L.LatLngBounds, zoom: number) => void }) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds(), map.getZoom()),
  });
  useEffect(() => onChange(map.getBounds(), map.getZoom()), []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

type FlyTarget = { lat: number; lng: number; zoom: number } | null;

function FlyTo({ target }: { target: FlyTarget }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo([target.lat, target.lng], target.zoom, { duration: 0.8 }); }, [target, map]);
  return null;
}

/** Credit each fuel data provider in the map's attribution control */
function DataAttribution() {
  const map = useMap();
  useEffect(() => {
    let added: string[] = [];
    api<{ text: string; url: string }[]>('/api/attributions').then((list) => {
      const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
      if (!list.length) return;
      added = [`Fuel prices: ${list.map((a) => `<a href="${esc(a.url)}" target="_blank" rel="noreferrer">${esc(a.text)}</a>`).join(', ')}`];
      added.forEach((a) => map.attributionControl.addAttribution(a));
    }, () => {});
    return () => added.forEach((a) => map.attributionControl.removeAttribution(a));
  }, [map]);
  return null;
}

export function MapPage() {
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [fuel, setFuel] = useState<string>(() => loadPref('fuel', 'U91'));
  const [stations, setStations] = useState<StationSummary[]>([]);
  const [zoomedOut, setZoomedOut] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<StationDetail | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');
  const initialView = useMemo(() => loadPref('view', DEFAULT_VIEW), []);
  const viewport = useRef<{ bounds: L.LatLngBounds; zoom: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api<FuelType[]>('/api/fuel-types').then(setFuelTypes, () => {});
  }, []);

  // Load full details (all fuels) for the selected station
  useEffect(() => {
    if (selectedId === null) { setSelected(null); return; }
    const ctrl = new AbortController();
    api<StationDetail>(`/api/stations/${selectedId}`, { signal: ctrl.signal }).then(setSelected, () => {});
    return () => ctrl.abort();
  }, [selectedId]);

  const load = useCallback(() => {
    const vp = viewport.current;
    if (!vp) return;
    abortRef.current?.abort();
    if (vp.zoom < MIN_ZOOM_FOR_STATIONS) {
      setZoomedOut(true);
      setStations([]);
      return;
    }
    setZoomedOut(false);
    const b = vp.bounds;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(5)).join(',');
    api<StationSummary[]>(`/api/stations?bbox=${bbox}&fuel=${encodeURIComponent(fuel)}`, { signal: ctrl.signal })
      .then(setStations, () => {});
  }, [fuel]);

  useEffect(load, [load]);

  const onViewport = useCallback((bounds: L.LatLngBounds, zoom: number) => {
    viewport.current = { bounds, zoom };
    const c = bounds.getCenter();
    savePref('view', { lat: c.lat, lng: c.lng, zoom });
    load();
  }, [load]);

  const tierOf = useMemo(() => tiers(stations), [stations]);

  function select(s: StationSummary, fly: boolean) {
    setSelectedId(s.id);
    setSheetOpen(false);
    if (fly) setFlyTarget({ lat: s.lat, lng: s.lng, zoom: Math.max(viewport.current?.zoom ?? 14, 14) });
  }

  function chooseLocality(l: Locality) {
    setSelectedId(null);
    setFlyTarget({ lat: l.lat, lng: l.lng, zoom: 13 });
  }

  function chooseFuel(code: string) {
    setFuel(code);
    savePref('fuel', code);
  }

  function locate() {
    if (!navigator.geolocation) return setLocateError('Location is not available on this device');
    setLocating(true);
    setLocateError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setMe(p);
        setSelectedId(null);
        setFlyTarget({ lat: p.lat, lng: p.lng, zoom: 14 });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocateError(err.code === err.PERMISSION_DENIED ? 'Location permission denied' : 'Could not find your location');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  const cheapest = stations[0];

  return (
    <div className="map-page">
      <div className="controls">
        <LocalitySearch onSelect={chooseLocality} />
        <select value={fuel} onChange={(e) => chooseFuel(e.target.value)} aria-label="Fuel type">
          {fuelTypes.length === 0 && <option value={fuel}>{fuel}</option>}
          {fuelTypes.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}
        </select>
      </div>

      <aside className={`sidebar${sheetOpen ? ' open' : ''}`}>
        <button className="sheet-handle" onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen}>
          <span className="grip" aria-hidden="true" />
          <span className="list-head">
            {zoomedOut
              ? 'Zoom in to see stations'
              : stations.length === 0
                ? 'No stations in view'
                : <>{stations.length} stations · cheapest <strong>{formatPrice(cheapest.price)}</strong></>}
          </span>
        </button>
        <ol className="station-list">
          {stations.map((s) => (
            <li key={s.id} className={s.id === selectedId ? 'selected' : ''}>
              <button onClick={() => select(s, true)}>
                <span className={`price-chip ${tierOf.get(s.id)}`}>{formatPrice(s.price)}</span>
                <span className="station-text">
                  <strong>{s.name}</strong>
                  <span className="muted">{s.address}</span>
                  <span className={isStale(s.sourceUpdatedAt) ? 'stale' : 'muted'}>Updated {timeAgo(s.sourceUpdatedAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <div className="map-wrap">
        <MapContainer center={[initialView.lat, initialView.lng]} zoom={initialView.zoom} className="map" zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Postcodes &copy; <a href="https://www.geonames.org/">GeoNames</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomControl position="bottomright" />
          <ViewportWatcher onChange={onViewport} />
          <DataAttribution />
          <FlyTo target={flyTarget} />
          {me && (
            <CircleMarker center={[me.lat, me.lng]} radius={8} interactive={false}
                          pathOptions={{ color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }} />
          )}
          {stations.map((s) => (
            <Marker
              key={s.id}
              position={[s.lat, s.lng]}
              icon={stationIcon(s.price, s.brand, tierOf.get(s.id) ?? 'mid', s.id === selectedId, isStale(s.sourceUpdatedAt))}
              zIndexOffset={s.id === selectedId ? 1000 : 0}
              title={`${s.name} — ${formatPrice(s.price)}`}
              eventHandlers={{ click: () => select(s, false) }}
            />
          ))}
          {selected && selected.id === selectedId && (
            <Popup
              key={selected.id}
              position={[selected.lat, selected.lng]}
              offset={[0, -MARKER_H + 2]}
              closeButton={false}
              minWidth={240}
              maxWidth={300}
              autoPanPaddingTopLeft={[16, 130]}
              autoPanPaddingBottomRight={[16, 90]}
              className="station-popup"
              eventHandlers={{ remove: () => setSelectedId((id) => (id === selected.id ? null : id)) }}
            >
              <StationPopup station={selected} fuel={fuel} fuelTypes={fuelTypes} onClose={() => setSelectedId(null)} />
            </Popup>
          )}
        </MapContainer>

        <div className="map-buttons">
          <button className="map-btn" onClick={locate} disabled={locating} aria-label="Show my location" title="Show my location">
            {locating ? '…' : '◎'}
          </button>
        </div>
        {locateError && <div className="map-toast" role="status" onClick={() => setLocateError('')}>{locateError}</div>}
      </div>
    </div>
  );
}
