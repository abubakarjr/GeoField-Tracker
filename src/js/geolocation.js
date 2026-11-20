// src/js/geolocation.js
import Geolocation from 'ol/Geolocation.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import { toLonLat } from 'ol/proj.js';

function haversineKm([lon1, lat1], [lon2, lat2]) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function setupGeolocation(map, { onGpsFix = () => {} } = {}) {
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
        fill: new Fill({ color: '#175d69' }),
        stroke: new Stroke({ color: '#ffffff', width: 2.5 }),
      }),
    })
  );

  new VectorLayer({
    map: map,
    source: new VectorSource({ features: [positionFeature] }),
    zIndex: 999,
  });

  let isTracking = false;
  let shouldTriggerAutoCache = false;
  let lastAutoCachedLonLat = null;

  const locateBtn = document.getElementById('btn-locate');

  locateBtn.addEventListener('click', () => {
    isTracking = !isTracking;
    locateBtn.classList.toggle('tracking', isTracking);
    geolocation.setTracking(isTracking);

    if (isTracking) {
      shouldTriggerAutoCache = true;
      const existingCoords = geolocation.getPosition();
      if (existingCoords) {
        view.animate({ center: existingCoords, zoom: 16, duration: 800 });
        triggerAutoDownloadIfNeeded(existingCoords);
      }
    } else {
      shouldTriggerAutoCache = false;
      positionFeature.setGeometry(null);
    }
  });

  function triggerAutoDownloadIfNeeded(mapCoords) {
    if (!shouldTriggerAutoCache) return;
    shouldTriggerAutoCache = false;

    const lonLat = toLonLat(mapCoords);
    if (
      lastAutoCachedLonLat &&
      haversineKm(lastAutoCachedLonLat, lonLat) < 2.0
    ) {
      return; // Already cached within 2km in this session
    }

    lastAutoCachedLonLat = lonLat;
    onGpsFix(lonLat);
  }

  geolocation.on('change:position', () => {
    const coordinates = geolocation.getPosition();
    positionFeature.setGeometry(coordinates ? new Point(coordinates) : null);

    if (isTracking && coordinates) {
      view.animate({ center: coordinates, zoom: 16, duration: 800 });
      triggerAutoDownloadIfNeeded(coordinates);
    }
  });

  map.on('pointerdrag', () => {
    if (isTracking) {
      isTracking = false;
      locateBtn.classList.remove('tracking');
    }
  });
}