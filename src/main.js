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
import {
  attachOfflineTileLoader,
  downloadOfflineRegion,
  cancelOfflineDownload,
  getOfflineStorageSummary,
  clearAllOfflineMapTiles,
} from './js/offlineTiles.js';

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
      metaTheme.setAttribute('content', isDark ? '#0d1d22' : '#175d69');
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

function setupOfflineMapManager(mainMap) {
  const openBtn = document.getElementById('btn-open-offline-mgr');
  const panel = document.getElementById('offline-map-panel');
  const closeBtn = document.getElementById('btn-close-offline-panel');
  const statsBadge = document.getElementById('offline-storage-stats');

  const nameInput = document.getElementById('offline-region-name');
  const modeSelect = document.getElementById('offline-radius-mode');
  const startBtn = document.getElementById('btn-start-offline-dl');
  const cancelBtn = document.getElementById('btn-cancel-offline-dl');
  const clearCacheBtn = document.getElementById('btn-clear-offline-tiles');

  const progressBox = document.getElementById('offline-progress-box');
  const progressText = document.getElementById('offline-progress-text');
  const progressPct = document.getElementById('offline-progress-pct');
  const progressFill = document.getElementById('offline-progress-fill');
  const regionsList = document.getElementById('saved-regions-list');

  async function refreshRegionsList() {
    const { regions, cachedTileCount, quotaNote } = await getOfflineStorageSummary();
    if (statsBadge) {
      statsBadge.textContent = quotaNote
        ? `${cachedTileCount} TILES • ${quotaNote}`
        : `${cachedTileCount} TILES CACHED`;
    }

    if (!regions.length) {
      regionsList.innerHTML =
        '<div class="empty-regions">No offline map areas downloaded yet.</div>';
      return;
    }

    regionsList.innerHTML = '';
    regions
      .slice()
      .reverse()
      .forEach((reg) => {
        const card = document.createElement('div');
        card.className = 'region-card';
        const dateStr = new Date(reg.savedAt).toLocaleDateString();
        card.innerHTML = `
          <div>
            <div class="region-title">${reg.label}</div>
            <div class="region-meta">${reg.tileCount} tiles • Saved ${dateStr}</div>
          </div>
          <button type="button" class="region-fly-btn">Go to Area</button>
        `;
        card.querySelector('.region-fly-btn').addEventListener('click', () => {
          mainMap.getView().animate({
            center: fromLonLat(reg.center),
            zoom: 14,
            duration: 750,
          });
          panel.classList.add('hidden');
        });
        regionsList.appendChild(card);
      });
  }

  openBtn?.addEventListener('click', async () => {
    panel.classList.remove('hidden');
    await refreshRegionsList();
  });

  closeBtn?.addEventListener('click', () => {
    panel.classList.add('hidden');
  });

  cancelBtn?.addEventListener('click', () => {
    cancelOfflineDownload();
    progressBox.classList.add('hidden');
    startBtn.disabled = false;
    showToast('Offline map download cancelled', 'warning');
  });

  startBtn?.addEventListener('click', async () => {
    const centerLonLat = toLonLat(mainMap.getView().getCenter());
    const mode = modeSelect.value;
    const label =
      nameInput.value.trim() ||
      `Field Zone (${centerLonLat[1].toFixed(3)}°N, ${centerLonLat[0].toFixed(3)}°E)`;

    startBtn.disabled = true;
    progressBox.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressPct.textContent = '0%';
    progressText.textContent = 'Starting tile download...';

    try {
      const outcome = await downloadOfflineRegion({
        centerLonLat,
        mode,
        label,
        onProgress: ({ completed, total, percent }) => {
          progressFill.style.width = `${percent}%`;
          progressPct.textContent = `${percent}%`;
          progressText.textContent = `Cached ${completed} / ${total} tiles`;
        },
      });

      if (!outcome.cancelled) {
        showToast(`Saved "${label}" for offline field collection`, 'success');
        nameInput.value = '';
        await refreshRegionsList();
      }
    } catch (err) {
      showToast(err.message || 'Offline download failed', 'warning');
    } finally {
      startBtn.disabled = false;
      progressBox.classList.add('hidden');
    }
  });

  clearCacheBtn?.addEventListener('click', async () => {
    if (confirm('Delete all downloaded offline map tiles from this device?')) {
      await clearAllOfflineMapTiles();
      await refreshRegionsList();
      showToast('Offline map cache cleared', 'warning');
    }
  });

  return { refreshRegionsList };
}

function setupPostcodeMapSearch(mainMap, getVectorSource, uiManager, offlineMgr) {
  const searchInput = document.getElementById('map-search-input');
  const searchBtn = document.getElementById('btn-map-search');
  const clearBtn = document.getElementById('btn-clear-search');
  const dropdown = document.getElementById('search-results-dropdown');

  // Floating "Here is the postcode" Card Elements
  const resultCard = document.getElementById('postcode-result-card');
  const popupClose = document.getElementById('popup-close');
  const popupPostcode = document.getElementById('popup-postcode');
  const popupAdmin = document.getElementById('popup-admin');
  const popupCoords = document.getElementById('popup-coords');
  const copyBtn = document.getElementById('btn-copy-postcode');
  const directionsBtn = document.getElementById('btn-postcode-directions');
  const shareBtn = document.getElementById('btn-postcode-share');
  const popupSaveBtn = document.getElementById('popup-save-feature');
  const popupDownload10kmBtn = document.getElementById('popup-download-10km');
  const miniMapLayerBtn = document.getElementById('btn-minimap-layer');

  // Pin Layer on Main Map (Deep Teal #175d69)
  const searchPinSource = new VectorSource();
  const searchPinLayer = new VectorLayer({
    source: searchPinSource,
    zIndex: 500,
    style: (feature) =>
      new Style({
        image: new CircleStyle({
          radius: 10,
          fill: new Fill({ color: '#175d69' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 }),
        }),
        text: new Text({
          text: feature.get('label') || '',
          font: '800 12px system-ui, -apple-system, sans-serif',
          fill: new Fill({ color: '#ffffff' }),
          backgroundFill: new Fill({ color: '#175d69' }),
          backgroundStroke: new Stroke({ color: '#ffffff', width: 1.5 }),
          padding: [5, 9, 5, 9],
          offsetY: -24,
        }),
      }),
  });
  mainMap.addLayer(searchPinLayer);

  // Embedded Mini-Map inside the "Here is the postcode" Card
  const miniSatSource = new XYZ({
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    crossOrigin: 'anonymous',
  });
  attachOfflineTileLoader(miniSatSource);

  const miniOsmSource = new OSM();
  attachOfflineTileLoader(miniOsmSource);

  const miniSatLayer = new TileLayer({ source: miniSatSource, visible: true });
  const miniOsmLayer = new TileLayer({ source: miniOsmSource, visible: false });

  const miniMarkerSource = new VectorSource();
  const miniMarkerLayer = new VectorLayer({
    source: miniMarkerSource,
    style: (feature) => {
      const kind = feature.get('kind');

      if (kind === 'radius') {
        return new Style({
          stroke: new Stroke({
            color: 'rgba(38, 166, 154, 0.9)',
            width: 1.8,
            lineDash: [6, 6],
          }),
          fill: new Fill({
            color: 'rgba(23, 93, 105, 0.12)',
          }),
        });
      }

      if (kind === 'primary') {
        return new Style({
          text: new Text({
            text: feature.get('shortCode') || '',
            font: '800 11.5px system-ui, -apple-system, sans-serif',
            fill: new Fill({ color: '#ffffff' }),
            backgroundFill: new Fill({ color: '#175d69' }),
            backgroundStroke: new Stroke({ color: '#ffffff', width: 1.5 }),
            padding: [4, 8, 4, 8],
          }),
        });
      }

      return new Style({
        text: new Text({
          text: feature.get('shortCode') || '',
          font: '700 10.5px system-ui, -apple-system, sans-serif',
          fill: new Fill({ color: '#0f292e' }),
          backgroundFill: new Fill({ color: 'rgba(255, 255, 255, 0.94)' }),
          backgroundStroke: new Stroke({ color: 'rgba(23, 93, 105, 0.25)', width: 1 }),
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
      zoom: 16,
    }),
  });

  miniMapLayerBtn.addEventListener('click', () => {
    const showOsm = miniSatLayer.getVisible();
    miniSatLayer.setVisible(!showOsm);
    miniOsmLayer.setVisible(showOsm);
    miniMapLayerBtn.textContent = showOsm ? 'Satellite' : 'Map';
  });

  let activeSearchResult = null;
  let activeMapCoord = null;
  let activeLatLng = null;

  function closeCard() {
    resultCard.classList.add('hidden');
  }

  popupClose.addEventListener('click', closeCard);

  function showResultOnMap(item) {
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
      coordNote = `${lat.toFixed(5)}°, ${lng.toFixed(5)}° (Unmapped Sandbox Code)`;
    }

    activeMapCoord = mapCoord;
    activeLatLng = { lat, lng };

    // 1. Place pin directly on the main map and fly to actual coordinates
    searchPinSource.clear();
    searchPinSource.addFeature(
      new Feature({
        geometry: new Point(mapCoord),
        label: item.spacedPostcode,
      })
    );
    mainMap.getView().animate({
      center: mapCoord,
      zoom: item.coords ? 16 : Math.max(mainMap.getView().getZoom(), 14),
      duration: 850,
    });

    // 2. Populate floating "Here is the postcode" card
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

    // 3. Populate Mini-Map preview
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
        shortCode: item.postcode ? item.postcode.slice(-4) : 'PIN',
      })
    );

    resultCard.classList.remove('hidden');
    setTimeout(() => {
      miniMap.updateSize();
      miniMap.getView().setCenter(mapCoord);
      miniMap.getView().setZoom(16);
    }, 40);
  }

  // Copy Postcode
  copyBtn.addEventListener('click', async () => {
    if (!activeSearchResult) return;
    try {
      await navigator.clipboard.writeText(activeSearchResult.spacedPostcode);
      showToast(`Copied "${activeSearchResult.spacedPostcode}"`, 'success');
    } catch {
      showToast(`Postcode: ${activeSearchResult.spacedPostcode}`, 'success');
    }
  });

  // Directions
  directionsBtn.addEventListener('click', () => {
    if (!activeLatLng) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${activeLatLng.lat},${activeLatLng.lng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  // Share
  shareBtn.addEventListener('click', async () => {
    if (!activeSearchResult) return;
    const shareText = `NIPOST Postcode: ${activeSearchResult.spacedPostcode} (${popupAdmin.textContent}) — GeoField Tracker`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Postcode ${activeSearchResult.spacedPostcode}`,
          text: shareText,
          url: window.location.href,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      showToast('Location details copied for sharing', 'success');
    } catch {
      showToast(shareText, 'success');
    }
  });

  // Save Pin to Field Data
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
      description: `Located via GeoField Search (${activeSearchResult.spacedPostcode})`,
      postcode: activeSearchResult.postcode || '',
      postcodeStatus: activeSearchResult.postcode ? 'verified' : 'unverified',
      state: activeSearchResult.admin?.state || '',
      lga: activeSearchResult.admin?.lga || '',
      ward: activeSearchResult.admin?.ward || '',
      district: activeSearchResult.admin?.district || '',
      timestamp: new Date().toISOString(),
    });

    source.addFeature(newFeature);
    await saveLayerToLocal(source);
    closeCard();
    showToast(`Saved ${activeSearchResult.spacedPostcode} to field data`, 'success');

    if (uiManager?.openMetadataPanel) {
      uiManager.openMetadataPanel(newFeature);
    }
  });

  // Pre-visit 10km Offline Map Download right from Searched Location
  popupDownload10kmBtn.addEventListener('click', async () => {
    if (!activeLatLng) return;
    const label = `${activeSearchResult?.spacedPostcode || 'Searched Area'} (10km)`;
    popupDownload10kmBtn.disabled = true;
    popupDownload10kmBtn.textContent = 'Downloading...';

    try {
      const outcome = await downloadOfflineRegion({
        centerLonLat: [activeLatLng.lng, activeLatLng.lat],
        mode: 'smart10km',
        label,
        onProgress: ({ percent }) => {
          popupDownload10kmBtn.textContent = `Caching ${percent}%`;
        },
      });
      if (!outcome.cancelled) {
        showToast(`10km offline map saved for ${label}`, 'success');
        await offlineMgr?.refreshRegionsList();
      }
    } catch (err) {
      showToast(err.message || 'Download failed', 'warning');
    } finally {
      popupDownload10kmBtn.disabled = false;
      popupDownload10kmBtn.textContent = '↓ 10km Offline';
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
          '<div class="search-result-item"><span class="search-result-sub">No matching postcode or location found. Try FC01A01KP27 or a town name.</span></div>';
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
            <div class="search-result-code">${item.spacedPostcode}</div>
            <div class="search-result-sub">${loc || 'NIPOST Verified Postcode'}</div>
          </div>
          <span class="search-result-tag">Locate</span>
        `;
        row.addEventListener('click', () => showResultOnMap(item));
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
    closeCard();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  setupThemeToggle();
  setupNetworkStatus();

  // 1. Initialize Map (OSM & Satellite with offline tile caching)
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

  // 3. Setup Offline Map Manager Drawer
  const offlineMgr = setupOfflineMapManager(map);

  // 4. Setup Live Geolocation + Automatic 10km Radius Offline Map Download
  const autoPill = document.getElementById('auto-cache-pill');
  const autoText = document.getElementById('auto-cache-text');

  setupGeolocation(map, {
    onGpsFix: async (lonLat) => {
      if (!navigator.onLine) return;
      autoPill?.classList.remove('hidden');
      if (autoText) autoText.textContent = 'Caching 10km offline map: 0%';

      try {
        const label = `Live GPS 10km (${lonLat[1].toFixed(3)}°N, ${lonLat[0].toFixed(3)}°E)`;
        const outcome = await downloadOfflineRegion({
          centerLonLat: lonLat,
          mode: 'smart10km',
          label,
          onProgress: ({ percent }) => {
            if (autoText) {
              autoText.textContent = `Caching 10km offline map: ${percent}%`;
            }
          },
        });
        if (!outcome.cancelled) {
          showToast('10km radius around your live location is now saved offline', 'success');
          await offlineMgr.refreshRegionsList();
        }
      } catch {
        // Silent fail if tile server rate-limits
      } finally {
        autoPill?.classList.add('hidden');
      }
    },
  });

  // 5. Declare vectorSource FIRST so UI and Search can reference it
  let vectorSource;

  // 6. Setup UI Drawer
  const uiManager = setupUI(() => vectorSource, showToast);

  // 7. Setup Drawing & Map Postcode Labels
  vectorSource = setupDrawing(map, uiManager, showToast);

  // 8. Setup Interactive Postcode Search & Floating Result Card
  setupPostcodeMapSearch(map, () => vectorSource, uiManager, offlineMgr);

  // 9. Load Offline Data (IndexedDB) & sync any pending offline postcodes if online
  await loadLayerFromLocal(vectorSource);
  await uiManager.syncPendingPostcodes();

  // 10. Setup Export Engine (GeoJSON & CSV with Postcode columns)
  setupExport(vectorSource, showToast);

  // 11. Register Service Worker (PWA Offline Support)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('Service Worker Registered:', reg.scope))
        .catch((err) => console.error('Service Worker failed:', err));
    });
  }
});