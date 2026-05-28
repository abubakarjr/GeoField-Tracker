import { initializeMap } from './js/map.js';
import { setupGeolocation } from './js/geolocation.js';
import { setupDrawing } from './js/draw.js';
import { setupUI } from './js/ui.js';
import { loadLayerFromLocal } from './js/storage.js'; // Import loading logic

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Map
  const map = initializeMap('map');
  
  // 2. Setup Live Geolocation
  setupGeolocation(map);
  
  // 3. Setup Spatial Drawing Tools (wait to pass uiManager)
  let vectorSource; // Declare first
  
  // 4. Setup UI (Pass vectorSource so UI can save it)
  const uiManager = setupUI({
     // We will bind this after setting up drawing
     getVectorSource: () => vectorSource 
  });
  
  // Re-assign vectorSource
  vectorSource = setupDrawing(map, uiManager);
  
  // Now update UI setup to use actual source (Slight adjustment to your ui.js export needed if doing it this way, 
  // or simply just pass `vectorSource` into `setupUI(vectorSource)` as shown in Step 3).
  // Let's assume you updated ui.js to accept vectorSource:
  // const uiManager = setupUI(vectorSource);
  // vectorSource = setupDrawing(map, uiManager);
  
  // 5. Load Data from Offline Storage on Boot
  await loadLayerFromLocal(vectorSource);
  
  // 6. Register Service Worker for Offline Caching
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('⚙️ Service Worker Registered!', reg.scope))
        .catch(err => console.error('⚙️ Service Worker failed:', err));
    });
  }
  
  console.log('GeoField Tracker: Stage 5 initialized.');
});