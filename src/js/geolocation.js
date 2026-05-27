import Geolocation from 'ol/Geolocation.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';

export function setupGeolocation(map) {
  const view = map.getView();

  const geolocation = new Geolocation({
    trackingOptions: { enableHighAccuracy: true },
    projection: view.getProjection(),
  });

  const positionFeature = new Feature();
  positionFeature.setStyle(
    new Style({
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: '#3399CC' }),
        stroke: new Stroke({ color: '#fff', width: 2 }),
      }),
    })
  );

  const vectorLayer = new VectorLayer({
    map: map,
    source: new VectorSource({ features: [positionFeature] }),
    zIndex: 999
  });

  let isTracking = false;
  const locateBtn = document.getElementById('btn-locate');

  locateBtn.addEventListener('click', () => {
    isTracking = !isTracking;
    locateBtn.classList.toggle('tracking');
    geolocation.setTracking(isTracking);

    if (!isTracking) {
      positionFeature.setGeometry(null);
    }
  });

  geolocation.on('change:position', function () {
    const coordinates = geolocation.getPosition();
    positionFeature.setGeometry(coordinates ? new Point(coordinates) : null);
    
    if (isTracking && coordinates) {
      view.animate({ center: coordinates, zoom: 16, duration: 800 });
    }
  });
  
  map.on('pointerdrag', () => {
    if (isTracking) {
        isTracking = false; 
        locateBtn.classList.remove('tracking');
    }
  });
}