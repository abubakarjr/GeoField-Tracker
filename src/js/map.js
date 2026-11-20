// src/js/map.js
import 'ol/ol.css';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import ScaleLine from 'ol/control/ScaleLine.js';
import { attachOfflineTileLoader } from './offlineTiles.js';

const VIEW_STORAGE_KEY = 'geofield-last-view';

function getSavedView() {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.center) && Number.isFinite(parsed.zoom)) {
      return parsed;
    }
  } catch {
    // Ignore storage error
  }
  return null;
}

export function initializeMap(targetElement) {
  const osmSource = new OSM();
  attachOfflineTileLoader(osmSource);

  const osmLayer = new TileLayer({
    source: osmSource,
    visible: true,
    properties: { name: 'basemap-osm' },
  });

  const satSource = new XYZ({
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    crossOrigin: 'anonymous',
  });
  attachOfflineTileLoader(satSource);

  const satelliteLayer = new TileLayer({
    source: satSource,
    visible: false,
    properties: { name: 'basemap-satellite' },
  });

  const saved = getSavedView();

  const map = new Map({
    target: targetElement,
    layers: [osmLayer, satelliteLayer],
    view: new View({
      center: saved ? saved.center : fromLonLat([7.489064, 9.058505]),
      zoom: saved ? saved.zoom : 12,
    }),
    controls: defaultControls({ zoom: true }).extend([
      new ScaleLine({ units: 'metric' }),
    ]),
  });

  // Persist last viewed coordinates/zoom so offline startup opens in the same area
  map.on('moveend', () => {
    const view = map.getView();
    try {
      localStorage.setItem(
        VIEW_STORAGE_KEY,
        JSON.stringify({
          center: view.getCenter(),
          zoom: view.getZoom(),
        })
      );
    } catch {
      // Ignore quota errors
    }
  });

  // Update bottom-left GPS coordinate readout on pointer move
  const coordEl = document.getElementById('coord-readout');
  if (coordEl) {
    map.on('pointermove', (evt) => {
      if (evt.dragging) return;
      const [lon, lat] = toLonLat(evt.coordinate);
      const latDir = lat >= 0 ? 'N' : 'S';
      const lonDir = lon >= 0 ? 'E' : 'W';
      coordEl.textContent = `${Math.abs(lat).toFixed(5)}° ${latDir}, ${Math.abs(lon).toFixed(5)}° ${lonDir} • EPSG:4326`;
    });
  }

  return map;
}

export function toggleBasemap(map) {
  const layers = map.getLayers().getArray();
  const osmLayer = layers.find((l) => l.get('name') === 'basemap-osm');
  const satLayer = layers.find((l) => l.get('name') === 'basemap-satellite');

  if (osmLayer && satLayer) {
    const isOsmVisible = osmLayer.getVisible();
    osmLayer.setVisible(!isOsmVisible);
    satLayer.setVisible(isOsmVisible);
    return !isOsmVisible ? 'osm' : 'satellite';
  }
}