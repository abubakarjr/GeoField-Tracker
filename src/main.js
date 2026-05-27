import { initializeMap } from './js/map.js';
import { setupGeolocation } from './js/geolocation.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Map
  const map = initializeMap('map');
  
  // 2. Setup Live Geolocation
  setupGeolocation(map);
  
  console.log('GeoField Tracker: Core initialized successfully.');
});