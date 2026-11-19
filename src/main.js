// src/main.js
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Overlay from 'ol/Overlay.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Style from 'ol/style/Style.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Text from 'ol/style/Text.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';

import { initializeMap, toggleBasemap } from './js/map.js';
import { setupGeolocation } from './js/geolocation.js';
import { setupDrawing } from './js/draw.js';
import { setupUI } from './js/ui.js';
import { loadLayerFromLocal, saveLayerToLocal } from './js/storage.js';
import { setupExport } from './js/export.js';
import { searchPostcodeOrPlace } from './js/postcode.js';

function showToast(message, variant = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-msg ${variant}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3400);
}

function setupNetworkStatus() {
  const badge = document.getElementById('network-badge');
  const text = document.getElementById('network-text');
  if (!badge || !text) return;

  function sync() {
    if (navigator.onLine) {
      badge.className = 'status-pill online';
      text.textContent = 'Online';
    } else {
      badge.className = 'status-pill offline';
      text.textContent = 'Offline Mode';
    }
  }

  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}

function setupPostcodeMapSearch(map, getVectorSource, uiManager) {
  const searchInput = document.getElementById('map-search-input');
  const searchBtn = document.getElementById('btn-map-search');
  const clearBtn = document.getElementById('btn-clear-search');
  const dropdown = document.getElementById('search-results-dropdown');

  const popupEl = document.getElementById('map-popup');
  const popupClose = document.getElementById('popup-close');
  const popupPostcode = document.getElementById('popup-postcode');
  const popupAdmin = document.getElementById('popup-admin');
  const popupCoords = document.getElementById('popup-coords');
  const popupSaveBtn = document.getElementById('popup-save-feature');

  // Dedicated marker layer for searched postcodes
  const searchPinSource = new VectorSource();
  const searchPinLayer = new VectorLayer({
    source: searchPinSource,
    zIndex: 500,
    style: (feature) =>
      new Style({
        image: new CircleStyle({
          radius: 10,
          fill: new Fill({ color: '#f59e0b' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 }),
        }),
        text: new Text({
          text: feature.get('label') || '',
          font: '800 12px system-ui, -apple-system, sans-serif',
          fill: new Fill({ color: '#0f172a' }),
          backgroundFill: new Fill({ color: '#fef3c7' }),
          backgroundStroke: new Stroke({ color: '#f59e0b', width: 1.5 }),
          padding: [4, 8, 4, 8],
          offsetY: -24,
        }),
      }),
  });
  map.addLayer(searchPinLayer);

  // Floating OpenLayers Overlay Popup
  const popupOverlay = new Overlay({
    element: popupEl,
    positioning: 'bottom-center',
    stopEvent: true,
  });
  map.addOverlay(popupOverlay);

  let activeSearchResult = null;
  let activeMapCoord = null;

  function hidePopup() {
    popupEl.classList.add('hidden');
    popupOverlay.setPosition(undefined);
    searchPinSource.clear();
    activeSearchResult = null;
    activeMapCoord = null;
  }

  popupClose.addEventListener('click', hidePopup);

  function showResultOnMap(item) {
    dropdown.classList.add('hidden');
    activeSearchResult = item;

    let mapCoord;
    let coordNote = '';

    if (item.coords) {
      mapCoord = fromLonLat([item.coords.lng, item.coords.lat]);
      const latDir = item.coords.lat >= 0 ? 'N' : 'S';
      const lonDir = item.coords.lng >= 0 ? 'E' : 'W';
      coordNote = `${Math.abs(item.coords.lat).toFixed(5)}° ${latDir}, ${Math.abs(item.coords.lng).toFixed(5)}° ${lonDir}`;
    } else {
      // Fallback to current map center if sandbox record has no coordinates
      mapCoord = map.getView().getCenter();
      const [lon, lat] = toLonLat(mapCoord);
      coordNote = `${lat.toFixed(5)}°, ${lon.toFixed(5)}° (Map Center)`;
    }

    activeMapCoord = mapCoord;

    // Place highlighted postcode pin on the map
    searchPinSource.clear();
    const pin = new Feature({
      geometry: new Point(mapCoord),
      label: item.formattedPostcode,
    });
    searchPinSource.addFeature(pin);

    // Populate floating map card
    const adminParts = [
      item.admin?.district,
      item.admin?.ward,
      item.admin?.lga,
      item.admin?.state,
    ].filter(Boolean);

    popupPostcode.textContent = item.formattedPostcode;
    popupAdmin.textContent = adminParts.length
      ? adminParts.join(' • ')
      : 'Verified NIPOST Postcode';
    popupCoords.textContent = coordNote;

    popupEl.classList.remove('hidden');
    popupOverlay.setPosition(mapCoord);

    map.getView().animate({
      center: mapCoord,
      zoom: item.coords ? 17 : Math.max(map.getView().getZoom(), 14),
      duration: 850,
    });
  }

  // Convert searched postcode pin directly into a saved GeoField feature
  popupSaveBtn.addEventListener('click', async () => {
    if (!activeSearchResult || !activeMapCoord) return;
    const source = getVectorSource();
    if (!source) return;

    const newFeature = new Feature({
      geometry: new Point(activeMapCoord),
    });

    newFeature.setProperties({
      title: activeSearchResult.admin?.district || `Site ${activeSearchResult.postcode}`,
      type: 'utilities',
      description: `Located via NIPOST Postcode Search (${activeSearchResult.formattedPostcode})`,
      postcode: activeSearchResult.postcode,
      postcodeStatus: 'verified',
      state: activeSearchResult.admin?.state || '',
      lga: activeSearchResult.admin?.lga || '',
      ward: activeSearchResult.admin?.ward || '',
      district: activeSearchResult.admin?.district || '',
      timestamp: new Date().toISOString(),
    });

    source.addFeature(newFeature);
    await saveLayerToLocal(source);
    hidePopup();
    showToast(`Added ${activeSearchResult.formattedPostcode} to field features`, 'success');

    if (uiManager?.openMetadataPanel) {
      uiManager.openMetadataPanel(newFeature);
    }
  });

  async function runSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    searchBtn.disabled = true;
    searchBtn.textContent = '...';
    dropdown.innerHTML = '';

    try {
      const results = await searchPostcodeOrPlace(query);

      if (!results.length) {
        dropdown.innerHTML =
          '<div class="search-result-item"><span class="search-result-sub">No matching NIPOST postcode found. Try FC01A01KP27.</span></div>';
        dropdown.classList.remove('hidden');
        return;
      }

      if (results.length === 1) {
        showResultOnMap(results[0]);
        return;
      }

      results.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'search-result-item';
        const loc = [item.admin?.ward, item.admin?.lga, item.admin?.state]
          .filter(Boolean)
          .join(', ');

        row.innerHTML = `
          <div>
            <div class="search-result-code">${item.formattedPostcode}</div>
            <div class="search-result-sub">${loc || 'NIPOST Verified Postcode'}</div>
          </div>
          <span class="search-result-tag">Show on Map</span>
        `;
        row.addEventListener('click', () => showResultOnMap(item));
        dropdown.appendChild(row);
      });

      dropdown.classList.remove('hidden');
    } catch (err) {
      showToast(err.message || 'Search failed', 'warning');
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = 'Locate';
    }
  }

  searchBtn.addEventListener('click', runSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    }
  });

  searchInput.addEventListener('input', () => {
    clearBtn.classList.toggle('hidden', !searchInput.value);
    if (!searchInput.value) {
      dropdown.classList.add('hidden');
    }
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    dropdown.classList.add('hidden');
    hidePopup();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  setupNetworkStatus();

  // 1. Initialize Map (OSM & Satellite layers)
  const map = initializeMap('map');

  // 2. Wire up the Basemap Toggle Button
  const btnToggleMap = document.getElementById('btn-toggle-basemap');
  if (btnToggleMap) {
    btnToggleMap.addEventListener('click', () => {
      const currentView = toggleBasemap(map);
      btnToggleMap.title =
        currentView === 'satellite' ? 'Switch to Vector Map' : 'Switch to Satellite';
      showToast(
        currentView === 'satellite'
          ? 'Switched to Hybrid Satellite Imagery'
          : 'Switched to OpenStreetMap Vector',
        'success'
      );
    });
  }

  // 3. Setup Live Geolocation
  setupGeolocation(map);

  // 4. Declare vectorSource FIRST so UI and Search can reference it
  let vectorSource;

  // 5. Setup UI Drawer
  const uiManager = setupUI(() => vectorSource, showToast);

  // 6. Setup Drawing & Map Postcode Labels
  vectorSource = setupDrawing(map, uiManager);

  // 7. Setup Interactive Map Postcode Search & Overlay
  setupPostcodeMapSearch(map, () => vectorSource, uiManager);

  // 8. Load Offline Data (IndexedDB)
  await loadLayerFromLocal(vectorSource);

  // 9. Setup Export Engine (GeoJSON & CSV with Postcode columns)
  setupExport(vectorSource, showToast);

  // 10. Register Service Worker (PWA Offline Support)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('Service Worker Registered:', reg.scope))
        .catch((err) => console.error('Service Worker failed:', err));
    });
  }
});