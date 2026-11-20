// src/main.js
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import CircleGeom from 'ol/geom/Circle.js';
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

function setupThemeToggle() {
  const btn = document.getElementById('btn-toggle-theme');
  const iconMoon = btn?.querySelector('.icon-moon');
  const iconSun = btn?.querySelector('.icon-sun');
  const metaTheme = document.getElementById('meta-theme-color');
  if (!btn) return;

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('geofield-theme', theme);

    const isDark = theme === 'dark';
    iconMoon?.classList.toggle('hidden', isDark);
    iconSun?.classList.toggle('hidden', !isDark);
    btn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#0f172a' : '#0f4c5c');
    }
  }

  const saved = localStorage.getItem('geofield-theme');
  const prefersDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    showToast(`Switched to ${next === 'dark' ? 'Dark' : 'Light'} Mode`, 'success');
  });
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

function setupPostcodeMapSearch(mainMap, getVectorSource, uiManager) {
  const searchInput = document.getElementById('map-search-input');
  const searchBtn = document.getElementById('btn-map-search');
  const clearBtn = document.getElementById('btn-clear-search');
  const dropdown = document.getElementById('search-results-dropdown');

  // "Here is the postcode" Modal Card Elements
  const modalBackdrop = document.getElementById('postcode-result-modal');
  const popupClose = document.getElementById('popup-close');
  const popupPostcode = document.getElementById('popup-postcode');
  const popupAdmin = document.getElementById('popup-admin');
  const popupCoords = document.getElementById('popup-coords');
  const copyBtn = document.getElementById('btn-copy-postcode');
  const directionsBtn = document.getElementById('btn-postcode-directions');
  const shareBtn = document.getElementById('btn-postcode-share');
  const popupSaveBtn = document.getElementById('popup-save-feature');
  const miniMapLayerBtn = document.getElementById('btn-minimap-layer');

  // Pin Layer on Main Map
  const searchPinSource = new VectorSource();
  const searchPinLayer = new VectorLayer({
    source: searchPinSource,
    zIndex: 500,
    style: (feature) =>
      new Style({
        image: new CircleStyle({
          radius: 10,
          fill: new Fill({ color: '#eab308' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 }),
        }),
        text: new Text({
          text: feature.get('label') || '',
          font: '800 12px system-ui, -apple-system, sans-serif',
          fill: new Fill({ color: '#0f172a' }),
          backgroundFill: new Fill({ color: '#fef08a' }),
          backgroundStroke: new Stroke({ color: '#eab308', width: 1.5 }),
          padding: [4, 8, 4, 8],
          offsetY: -24,
        }),
      }),
  });
  mainMap.addLayer(searchPinLayer);

  // Embedded Mini-Map inside the "Here is the postcode" Popup Card
  const miniSatLayer = new TileLayer({
    source: new XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      crossOrigin: 'anonymous',
    }),
    visible: true,
  });

  const miniOsmLayer = new TileLayer({
    source: new OSM(),
    visible: false,
  });

  const miniMarkerSource = new VectorSource();
  const miniMarkerLayer = new VectorLayer({
    source: miniMarkerSource,
    style: (feature) => {
      const kind = feature.get('kind');

      if (kind === 'radius') {
        return new Style({
          stroke: new Stroke({
            color: 'rgba(45, 212, 191, 0.85)',
            width: 1.5,
            lineDash: [6, 6],
          }),
          fill: new Fill({
            color: 'rgba(45, 212, 191, 0.06)',
          }),
        });
      }

      if (kind === 'primary') {
        return new Style({
          text: new Text({
            text: feature.get('shortCode') || '',
            font: '800 11.5px system-ui, -apple-system, sans-serif',
            fill: new Fill({ color: '#0f172a' }),
            backgroundFill: new Fill({ color: '#facc15' }),
            backgroundStroke: new Stroke({ color: '#ffffff', width: 1.5 }),
            padding: [4, 8, 4, 8],
          }),
        });
      }

      // Nearby white building pills (BY01, BY06, etc.)
      return new Style({
        text: new Text({
          text: feature.get('shortCode') || '',
          font: '700 10.5px system-ui, -apple-system, sans-serif',
          fill: new Fill({ color: '#0f172a' }),
          backgroundFill: new Fill({ color: 'rgba(255, 255, 255, 0.94)' }),
          backgroundStroke: new Stroke({ color: 'rgba(15, 23, 42, 0.15)', width: 1 }),
          padding: [3, 6, 3, 6],
        }),
      });
    },
  });

  const miniMap = new Map({
    target: 'popup-mini-map',
    layers: [miniSatLayer, miniOsmLayer, miniMarkerLayer],
    view: new View({
      center: fromLonLat([7.489064, 9.058505]),
      zoom: 17,
    }),
  });

  // Yellow "Map" / "Satellite" toggle button inside the mini-map
  miniMapLayerBtn.addEventListener('click', () => {
    const showOsm = miniSatLayer.getVisible();
    miniSatLayer.setVisible(!showOsm);
    miniOsmLayer.setVisible(showOsm);
    miniMapLayerBtn.textContent = showOsm ? 'Satellite' : 'Map';
  });

  let activeSearchResult = null;
  let activeMapCoord = null;
  let activeLatLng = null;

  function closeModal() {
    modalBackdrop.classList.add('hidden');
  }

  popupClose.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  function showResultCard(item) {
    dropdown.classList.add('hidden');
    activeSearchResult = item;

    let mapCoord;
    let lat;
    let lng;
    let coordNote = '';

    if (item.coords) {
      lat = item.coords.lat;
      lng = item.coords.lng;
      mapCoord = fromLonLat([lng, lat]);
      const latDir = lat >= 0 ? 'N' : 'S';
      const lonDir = lng >= 0 ? 'E' : 'W';
      coordNote = `${Math.abs(lat).toFixed(5)}° ${latDir}, ${Math.abs(lng).toFixed(5)}° ${lonDir}`;
    } else {
      mapCoord = mainMap.getView().getCenter();
      const [cLon, cLat] = toLonLat(mapCoord);
      lat = cLat;
      lng = cLon;
      coordNote = `${lat.toFixed(5)}°, ${lng.toFixed(5)}° (Map Center)`;
    }

    activeMapCoord = mapCoord;
    activeLatLng = { lat, lng };

    // 1. Place pin on main map
    searchPinSource.clear();
    searchPinSource.addFeature(
      new Feature({
        geometry: new Point(mapCoord),
        label: item.spacedPostcode,
      })
    );
    mainMap.getView().animate({
      center: mapCoord,
      zoom: item.coords ? 17 : Math.max(mainMap.getView().getZoom(), 14),
      duration: 800,
    });

    // 2. Populate "Here is the postcode" card details
    const adminParts = [
      item.admin?.district,
      item.admin?.lga,
      item.admin?.state,
    ].filter(Boolean);

    popupPostcode.textContent = item.spacedPostcode;
    popupAdmin.textContent = adminParts.length
      ? adminParts.join(', ')
      : 'Verified NIPOST Postcode';
    popupCoords.textContent = coordNote;

    // 3. Populate Mini-Map features (dashed search ring, yellow primary badge, white nearby badges)
    miniMarkerSource.clear();
    miniMarkerSource.addFeature(
      new Feature({
        geometry: new CircleGeom(mapCoord, 140),
        kind: 'radius',
      })
    );

    if (Array.isArray(item.nearby)) {
      item.nearby.forEach((nb) => {
        if (!nb.coords) return;
        miniMarkerSource.addFeature(
          new Feature({
            geometry: new Point(fromLonLat([nb.coords.lng, nb.coords.lat])),
            kind: 'nearby',
            shortCode: nb.shortCode || nb.postcode.slice(-4),
          })
        );
      });
    }

    miniMarkerSource.addFeature(
      new Feature({
        geometry: new Point(mapCoord),
        kind: 'primary',
        shortCode: item.postcode.slice(-4),
      })
    );

    // 4. Open modal & resize OpenLayers mini-map canvas
    modalBackdrop.classList.remove('hidden');
    setTimeout(() => {
      miniMap.updateSize();
      miniMap.getView().setCenter(mapCoord);
      miniMap.getView().setZoom(17);
    }, 35);
  }

  // Copy Postcode button
  copyBtn.addEventListener('click', async () => {
    if (!activeSearchResult) return;
    try {
      await navigator.clipboard.writeText(activeSearchResult.spacedPostcode);
      showToast(`Copied "${activeSearchResult.spacedPostcode}" to clipboard`, 'success');
    } catch {
      showToast(`Postcode: ${activeSearchResult.spacedPostcode}`, 'success');
    }
  });

  // Directions button
  directionsBtn.addEventListener('click', () => {
    if (!activeLatLng) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${activeLatLng.lat},${activeLatLng.lng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  // Share button
  shareBtn.addEventListener('click', async () => {
    if (!activeSearchResult) return;
    const shareText = `NIPOST Postcode: ${activeSearchResult.spacedPostcode} (${popupAdmin.textContent}) — Located via GeoField Tracker`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Postcode ${activeSearchResult.spacedPostcode}`,
          text: shareText,
          url: window.location.href,
        });
        return;
      } catch {
        // User cancelled share sheet; fall back to copy
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      showToast('Postcode location copied for sharing', 'success');
    } catch {
      showToast(shareText, 'success');
    }
  });

  // "+ Save Pin to Field Data" button
  popupSaveBtn.addEventListener('click', async () => {
    if (!activeSearchResult || !activeMapCoord) return;
    const source = getVectorSource();
    if (!source) return;

    const newFeature = new Feature({
      geometry: new Point(activeMapCoord),
    });

    newFeature.setProperties({
      title:
        activeSearchResult.admin?.district ||
        `Site ${activeSearchResult.spacedPostcode}`,
      type: 'utilities',
      description: `Located via NIPOST Postcode Search (${activeSearchResult.spacedPostcode})`,
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
    closeModal();
    showToast(`Added ${activeSearchResult.spacedPostcode} to field features`, 'success');

    if (uiManager?.openMetadataPanel) {
      uiManager.openMetadataPanel(newFeature);
    }
  });

  async function runSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching...';
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
        showResultCard(results[0]);
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
            <div class="search-result-code">${item.spacedPostcode}</div>
            <div class="search-result-sub">${loc || 'NIPOST Verified Postcode'}</div>
          </div>
          <span class="search-result-tag">Open Card</span>
        `;
        row.addEventListener('click', () => showResultCard(item));
        dropdown.appendChild(row);
      });

      dropdown.classList.remove('hidden');
    } catch (err) {
      showToast(err.message || 'Search failed', 'warning');
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = 'Find postcode';
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
    searchPinSource.clear();
    closeModal();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  setupThemeToggle();
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

  // 7. Setup Interactive "Here is the postcode" Search Modal
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