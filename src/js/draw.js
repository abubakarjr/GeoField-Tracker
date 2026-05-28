import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import Style from 'ol/style/Style.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import CircleStyle from 'ol/style/Circle.js';
import { unByKey } from 'ol/Observable.js';
import { formatArea, formatLength } from './measurement.js';

export function setupDrawing(map, uiManager) {
  const source = new VectorSource({ wrapX: false });
  
  const vectorLayer = new VectorLayer({
    source: source,
    style: new Style({
      fill: new Fill({ color: 'rgba(23, 93, 105, 0.4)' }), 
      stroke: new Stroke({ color: '#175d69', width: 3 }),
      image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color: '#e74c3c' }),
        stroke: new Stroke({ color: '#fff', width: 2 })
      }),
    }),
    zIndex: 100 
  });

  map.addLayer(vectorLayer);
  const modify = new Modify({ source: source });
  map.addInteraction(modify);

  let drawInteraction;
  
  // UI Elements
  const measureDisplay = document.getElementById('measure-display');
  const measureOutput = document.getElementById('measure-output');

  function addInteraction(type) {
    if (drawInteraction) map.removeInteraction(drawInteraction);
    if (type === 'None') return;

    drawInteraction = new Draw({ source: source, type: type });
    map.addInteraction(drawInteraction);
    
    let listener;

    // Fired when the user starts drawing
    drawInteraction.on('drawstart', (event) => {
      const sketch = event.feature;
      if (measureDisplay) measureDisplay.classList.remove('hidden');

      listener = sketch.getGeometry().on('change', (evt) => {
        const geom = evt.target;
        let output = '';
        
        if (geom.getType() === 'Polygon') {
          output = formatArea(geom);
        } else if (geom.getType() === 'LineString') {
          output = formatLength(geom);
        }
        
        if (measureOutput) measureOutput.innerHTML = output;
      });
    });

    // Fired when the user finishes drawing
    drawInteraction.on('drawend', (event) => {
      // 1. Stop tracking geometry changes
      unByKey(listener);
      
      // 2. Hide measurement UI
      if (measureDisplay) measureDisplay.classList.add('hidden');
      if (measureOutput) measureOutput.innerHTML = '0.00 m';
      
      // 3. Save the final math into the spatial feature
      const finalGeom = event.feature.getGeometry();
      if (finalGeom.getType() === 'Polygon') {
        event.feature.set('measurement', formatArea(finalGeom));
      } else if (finalGeom.getType() === 'LineString') {
        event.feature.set('measurement', formatLength(finalGeom));
      }

      // 4. Delay interaction removal slightly so OpenLayers doesn't delete the shape
      setTimeout(() => {
        // Turn off drawing tool
        resetButtons();
        map.removeInteraction(drawInteraction); 
        
        // Open the metadata form
        if (uiManager && uiManager.openMetadataPanel) {
          uiManager.openMetadataPanel(event.feature);
        }
      }, 100); // 100ms delay ensures maximum stability
    });
  }

  const btns = {
    'Point': document.getElementById('btn-draw-point'),
    'LineString': document.getElementById('btn-draw-line'),
    'Polygon': document.getElementById('btn-draw-poly')
  };

  function resetButtons() {
    Object.values(btns).forEach(btn => btn.classList.remove('active'));
    if (measureDisplay) measureDisplay.classList.add('hidden');
  }

  Object.entries(btns).forEach(([type, btn]) => {
    btn.addEventListener('click', () => {
      const isActive = btn.classList.contains('active');
      resetButtons();
      
      if (isActive) {
        addInteraction('None');
      } else {
        btn.classList.add('active');
        addInteraction(type); 
      }
    });
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if(confirm('Clear all drawn features?')) {
      source.clear();
      resetButtons();
      addInteraction('None');
    }
  });

  return source;
}