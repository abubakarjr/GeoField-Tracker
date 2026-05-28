import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import Style from 'ol/style/Style.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import CircleStyle from 'ol/style/Circle.js';

export function setupDrawing(map, uiManager) {
  // 1. Create the data source and layer
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

  // 2. Add Modify interaction
  const modify = new Modify({ source: source });
  map.addInteraction(modify);

  let drawInteraction;

  // 3. Manage drawing modes
  function addInteraction(type) {
    if (drawInteraction) {
      map.removeInteraction(drawInteraction);
    }
    
    if (type !== 'None') {
      drawInteraction = new Draw({
        source: source,
        type: type,
      });
      map.addInteraction(drawInteraction);
      
          drawInteraction.on('drawend', (event) => {
        console.log(`✅ Successfully captured a ${type}!`);
        // Trigger the metadata form immediately after drawing!
        if (uiManager && uiManager.openMetadataPanel) {
          uiManager.openMetadataPanel(event.feature);
        }
        
        // Optional: toggle drawing mode back off automatically
        resetButtons();
        map.removeInteraction(drawInteraction); 
          });
        }

      }

      // 4. Wire up the UI buttons
  const btns = {
    'Point': document.getElementById('btn-draw-point'),
    'LineString': document.getElementById('btn-draw-line'),
    'Polygon': document.getElementById('btn-draw-poly')
  };

  function resetButtons() {
    Object.values(btns).forEach(btn => btn.classList.remove('active'));
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