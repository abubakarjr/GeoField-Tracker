// src/js/map.js
import 'ol/ol.css';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';
import { fromLonLat } from 'ol/proj.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import ScaleLine from 'ol/control/ScaleLine.js';

export function initializeMap(targetElement) {
  // 1. Standard Vector Map
  const osmLayer = new TileLayer({
    source: new OSM(),
    visible: true,
    properties: { name: 'basemap-osm' }
  });

  // 2. High-Resolution Satellite Map (Google Hybrid)
  const satelliteLayer = new TileLayer({
    source: new XYZ({
      url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      crossOrigin: 'anonymous'
    }),
    visible: false,
    properties: { name: 'basemap-satellite' }
  });

  const map = new Map({
    target: targetElement,
    layers: [osmLayer, satelliteLayer], // Load both into the map
    view: new View({
      center: fromLonLat([7.489064, 9.058505]), // Default: Nigeria
      zoom: 12,
    }),
    controls: defaultControls({ zoom: true }).extend([
      new ScaleLine({ units: 'metric' })
    ])
  });

  return map;
}

// 3. Logic to toggle between the two layers
export function toggleBasemap(map) {
  const layers = map.getLayers().getArray();
  const osmLayer = layers.find(l => l.get('name') === 'basemap-osm');
  const satLayer = layers.find(l => l.get('name') === 'basemap-satellite');

  if (osmLayer && satLayer) {
    const isOsmVisible = osmLayer.getVisible();
    
    // Flip their visibilities
    osmLayer.setVisible(!isOsmVisible);
    satLayer.setVisible(isOsmVisible);
    
    return !isOsmVisible ? 'osm' : 'satellite';
  }
}