import { initializeMap } from './js/map.js';
import { setupGeolocation } from './js/geolocation.js';
import { setupDrawing } from './js/draw.js';
import { setupUI } from './js/ui.js';
import { loadLayerFromLocal } from './js/storage.js';
import { setupExport } from './js/export.js'; // Import Export Engine

document.addEventListener('DOMContentLoaded', async () => {
  const map = initializeMap('map');
  setupGeolocation(map);
  
  let vectorSource;
  
  const uiManager = setupUI({
     getVectorSource: () => vectorSource 
  });
  
  vectorSource = setupDrawing(map, uiManager);
  
  await loadLayerFromLocal(vectorSource);
  
  // Initialize the Export Engine with the loaded data source
  setupExport(vectorSource);
  
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .catch(err => console.error('⚙️ Service Worker failed:', err));
    });
  }
  
  console.log('GeoField Tracker: Stage 6 (Export Engine) initialized.');
});