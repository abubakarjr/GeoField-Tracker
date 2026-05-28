// src/main.js
import { initializeMap, toggleBasemap } from './js/map.js';
import { setupGeolocation } from './js/geolocation.js';
import { setupDrawing } from './js/draw.js';
import { setupUI } from './js/ui.js';
import { loadLayerFromLocal } from './js/storage.js';
import { setupExport } from './js/export.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Map (OSM & Satellite layers)
  const map = initializeMap('map');
  
  // 2. Wire up the Basemap Toggle Button
  const btnToggleMap = document.getElementById('btn-toggle-basemap');
  if (btnToggleMap) {
    btnToggleMap.addEventListener('click', () => {
      const currentView = toggleBasemap(map);
      // Change the button icon and tooltip based on the active view
      btnToggleMap.innerHTML = currentView === 'satellite' ? '🗺️' : '🌍';
      btnToggleMap.title = currentView === 'satellite' ? 'Switch to Vector Map' : 'Switch to Satellite';
    });
  }

  // 3. Setup Live Geolocation
  setupGeolocation(map);
  
  // 4. Declare vectorSource FIRST so the UI can reference it
  let vectorSource; 
  
  // 5. Setup UI, passing a function that returns vectorSource when called
  const uiManager = setupUI(() => vectorSource);
  
  // 6. Setup Drawing, passing the uiManager so it can trigger the form
  vectorSource = setupDrawing(map, uiManager);
  
  // 7. Load Offline Data (IndexedDB)
  await loadLayerFromLocal(vectorSource);
  
  // 8. Setup Export Engine (GeoJSON & CSV)
  setupExport(vectorSource);
  
  // 9. Register Service Worker (PWA Offline Support)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('⚙️ Service Worker Registered!', reg.scope))
        .catch(err => console.error('⚙️ Service Worker failed:', err));
    });
  }
  
  console.log('GeoField Tracker: All systems initialized and ready for field deployment.');
});