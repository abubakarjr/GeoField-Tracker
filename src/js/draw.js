// src/js/draw.js
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import Select from 'ol/interaction/Select.js';
import { click } from 'ol/events/condition.js';
import Style from 'ol/style/Style.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import CircleStyle from 'ol/style/Circle.js';
import Text from 'ol/style/Text.js';
import { unByKey } from 'ol/Observable.js';
import { formatArea, formatLength } from './measurement.js';
import { formatSpacedPostcode } from './postcode.js';
import { clearLocalFeatures, saveLayerToLocal } from './storage.js';

function createFeatureStyle(feature) {
  const postcode = feature.get('postcode');
  const title = feature.get('title');

  let labelText = '';
  if (postcode) {
    const formatted = formatSpacedPostcode(postcode);
    labelText = title ? `${title}\n${formatted}` : formatted;
  } else if (title) {
    labelText = title;
  }

  return new Style({
    fill: new Fill({ color: 'rgba(23, 93, 105, 0.32)' }),
    stroke: new Stroke({ color: '#175d69', width: 3 }),
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: '#175d69' }),
      stroke: new Stroke({ color: '#ffffff', width: 2.5 }),
    }),
    text: labelText
      ? new Text({
          text: labelText,
          font: '700 11px system-ui, -apple-system, sans-serif',
          fill: new Fill({ color: '#ffffff' }),
          backgroundFill: new Fill({ color: 'rgba(23, 93, 105, 0.94)' }),
          backgroundStroke: new Stroke({ color: '#ffffff', width: 1.2 }),
          padding: [4, 8, 4, 8],
          offsetY: -22,
          overflow: true,
        })
      : undefined,
  });
}

export function setupDrawing(map, uiManager, showToast = () => {}) {
  const source = new VectorSource({ wrapX: false });

  const vectorLayer = new VectorLayer({
    source: source,
    style: createFeatureStyle,
    zIndex: 100,
  });

  map.addLayer(vectorLayer);

  const modify = new Modify({ source: source });
  modify.on('modifyend', async () => {
    await saveLayerToLocal(source);
  });
  map.addInteraction(modify);

  const countBadge = document.getElementById('feature-count');
  function updateFeatureCount() {
    if (!countBadge) return;
    const total = source.getFeatures().length;
    countBadge.textContent = `${total} ${total === 1 ? 'Feature' : 'Features'}`;
  }
  source.on('addfeature', updateFeatureCount);
  source.on('removefeature', updateFeatureCount);
  source.on('clear', updateFeatureCount);

  let activeInteraction = null;

  const measureDisplay = document.getElementById('measure-display');
  const measureOutput = document.getElementById('measure-output');

  const btns = {
    Select: document.getElementById('btn-select-feature'),
    Point: document.getElementById('btn-draw-point'),
    LineString: document.getElementById('btn-draw-line'),
    Polygon: document.getElementById('btn-draw-poly'),
  };

  function resetButtons() {
    Object.values(btns).forEach((btn) => btn && btn.classList.remove('active'));
    if (measureDisplay) measureDisplay.classList.add('hidden');
  }

  function clearActiveInteraction() {
    if (activeInteraction) {
      map.removeInteraction(activeInteraction);
      activeInteraction = null;
    }
  }

  function setTool(mode) {
    clearActiveInteraction();
    if (mode === 'None') return;

    if (mode === 'Select') {
      const select = new Select({
        condition: click,
        layers: [vectorLayer],
      });
      select.on('select', (e) => {
        const picked = e.selected[0];
        if (picked && uiManager?.openMetadataPanel) {
          uiManager.openMetadataPanel(picked);
          select.getFeatures().clear();
        }
      });
      activeInteraction = select;
      map.addInteraction(activeInteraction);
      return;
    }

    const draw = new Draw({ source: source, type: mode });
    activeInteraction = draw;
    map.addInteraction(draw);

    let listener;

    draw.on('drawstart', (event) => {
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
        if (measureOutput) measureOutput.textContent = output;
      });
    });

    draw.on('drawend', (event) => {
      unByKey(listener);

      if (measureDisplay) measureDisplay.classList.add('hidden');
      if (measureOutput) measureOutput.textContent = '0.00 m';

      const finalGeom = event.feature.getGeometry();
      if (finalGeom.getType() === 'Polygon') {
        event.feature.set('measurement', formatArea(finalGeom));
      } else if (finalGeom.getType() === 'LineString') {
        event.feature.set('measurement', formatLength(finalGeom));
      }

      setTimeout(() => {
        resetButtons();
        clearActiveInteraction();
        if (uiManager?.openMetadataPanel) {
          uiManager.openMetadataPanel(event.feature);
        }
      }, 100);
    });
  }

  Object.entries(btns).forEach(([mode, btn]) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isActive = btn.classList.contains('active');
      resetButtons();

      if (isActive) {
        setTool('None');
      } else {
        btn.classList.add('active');
        setTool(mode);
      }
    });
  });

  document.getElementById('btn-clear').addEventListener('click', async () => {
    if (confirm('Clear all drawn features from the map and offline database?')) {
      source.clear();
      await clearLocalFeatures();
      resetButtons();
      setTool('None');
      showToast('All features cleared from map and local storage', 'warning');
    }
  });

  return source;
}