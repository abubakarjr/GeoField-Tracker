// src/js/export.js
import GeoJSON from 'ol/format/GeoJSON.js';
import { transformExtent } from 'ol/proj.js';

// Utility to trigger native browser download
function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function setupExport(vectorSource) {
  const btnGeoJSON = document.getElementById('btn-export-geojson');
  const btnCSV = document.getElementById('btn-export-csv');

  // 1. Export as GeoJSON
  btnGeoJSON.addEventListener('click', () => {
    const features = vectorSource.getFeatures();
    if (features.length === 0) return alert("No features to export!");

    const format = new GeoJSON();
    const geojsonStr = format.writeFeatures(features, {
      featureProjection: 'EPSG:3857', // Internal map projection
      dataProjection: 'EPSG:4326'     // Standard GPS coordinates for export
    });

    const timestamp = new Date().toISOString().split('T')[0];
    triggerDownload(`GeoField_Data_${timestamp}.geojson`, geojsonStr, 'application/json');
    console.log("✅ GeoJSON Exported Successfully.");
  });

  // 2. Export as CSV
  btnCSV.addEventListener('click', () => {
    const features = vectorSource.getFeatures();
    if (features.length === 0) return alert("No features to export!");

    // CSV Header
    let csvContent = "ID,Category,Title,Description,Timestamp,GeometryType,Coordinates\n";

    features.forEach((feature, index) => {
      const props = feature.getProperties();
      const geom = feature.getGeometry();
      const type = geom.getType();
      
      // Extract properties, falling back to defaults if empty
      const id = feature.getId() || `feat_${index}`;
      const category = props.type || 'N/A';
      const title = (props.title || 'Unnamed').replace(/,/g, ''); // Remove commas to prevent CSV breaking
      const desc = (props.description || '').replace(/,/g, ' '); 
      const time = props.timestamp || 'N/A';

      // Get bounding box coordinates in standard GPS format for the CSV
      const extent = transformExtent(geom.getExtent(), 'EPSG:3857', 'EPSG:4326');
      const coords = `"[${extent[0].toFixed(5)}, ${extent[1].toFixed(5)}]"`;

      csvContent += `${id},${category},${title},${desc},${time},${type},${coords}\n`;
    });

    const timestamp = new Date().toISOString().split('T')[0];
    triggerDownload(`GeoField_Data_${timestamp}.csv`, csvContent, 'text/csv');
    console.log("✅ CSV Exported Successfully.");
  });
}