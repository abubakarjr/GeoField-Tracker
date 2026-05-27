import 'ol/ol.css';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import { fromLonLat } from 'ol/proj.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import ScaleLine from 'ol/control/ScaleLine.js';

export function initializeMap(targetElement) {
  const map = new Map({
    target: targetElement,
    layers: [
      new TileLayer({
        source: new OSM(),
      }),
    ],
    view: new View({
      center: fromLonLat([7.489064, 9.058505]), // Default: Nigeria
      zoom: 6,
    }),
    controls: defaultControls({ zoom: true }).extend([
      new ScaleLine({ units: 'metric' })
    ])
  });

  return map;
}