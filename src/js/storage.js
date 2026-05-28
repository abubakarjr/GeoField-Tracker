// src/js/storage.js
import GeoJSON from 'ol/format/GeoJSON.js';
import { saveFeatureToDB, getAllFeaturesFromDB } from '../data/localdb.js';

const geojsonFormat = new GeoJSON();

export async function saveLayerToLocal(vectorSource) {
  const features = vectorSource.getFeatures();
  
  for (const feature of features) {
    // Ensure the feature has a unique ID before saving
    if (!feature.getId()) {
      feature.setId('feat_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9));
    }
    
    const geojson = geojsonFormat.writeFeatureObject(feature, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326' // Standard GPS coordinates
    });
    
    await saveFeatureToDB(geojson);
  }
}

export async function loadLayerFromLocal(vectorSource) {
  try {
    const geojsonFeatures = await getAllFeaturesFromDB();
    if (geojsonFeatures && geojsonFeatures.length > 0) {
      const features = geojsonFeatures.map(f => geojsonFormat.readFeature(f, {
        featureProjection: 'EPSG:3857',
        dataProjection: 'EPSG:4326'
      }));
      
      vectorSource.clear();
      vectorSource.addFeatures(features);
      console.log(`📡 Loaded ${features.length} features from offline storage.`);
    }
  } catch (error) {
    console.error('Error loading local features:', error);
  }
}