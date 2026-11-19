// src/js/export.js
import GeoJSON from 'ol/format/GeoJSON.js';
import { transformExtent } from 'ol/proj.js';

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

function sanitizeCSV(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\r\n,]+/g, ' ').trim();
}

export function setupExport(vectorSource) {
  const btnGeoJSON = document.getElementById('btn-export-geojson');
  const btnCSV = document.getElementById('btn-export-csv');

  // 1. Export as GeoJSON (automatically includes postcode, state, lga, ward, district)
  btnGeoJSON.addEventListener('click', () => {
    const features = vectorSource.getFeatures();
    if (features.length === 0) return alert('No features to export!');

    const format = new GeoJSON();
    const geojsonStr = format.writeFeatures(features, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326',
    });

    const timestamp = new Date().toISOString().split('T')[0];
    triggerDownload(`GeoField_Data_${timestamp}.geojson`, geojsonStr, 'application/json');
    console.log('✅ GeoJSON Exported Successfully.');
  });

  // 2. Export as CSV with NIPOST Postcode & Administrative Hierarchy columns
  btnCSV.addEventListener('click', () => {
    const features = vectorSource.getFeatures();
    if (features.length === 0) return alert('No features to export!');

    let csvContent =
      'ID,Category,Title,Description,Postcode,PostcodeStatus,State,LGA,Ward,District,Measurement,Timestamp,GeometryType,Coordinates\n';

    features.forEach((feature, index) => {
      const props = feature.getProperties();
      const geom = feature.getGeometry();
      const type = geom.getType();

      const id = sanitizeCSV(feature.getId() || `feat_${index}`);
      const category = sanitizeCSV(props.type || 'N/A');
      const title = sanitizeCSV(props.title || 'Unnamed');
      const desc = sanitizeCSV(props.description || '');
      const postcode = sanitizeCSV(props.postcode || 'N/A');
      const postcodeStatus = sanitizeCSV(props.postcodeStatus || 'unverified');
      const state = sanitizeCSV(props.state || '');
      const lga = sanitizeCSV(props.lga || '');
      const ward = sanitizeCSV(props.ward || '');
      const district = sanitizeCSV(props.district || '');
      const measurement = sanitizeCSV(props.measurement || '');
      const time = sanitizeCSV(props.timestamp || 'N/A');

      const extent = transformExtent(geom.getExtent(), 'EPSG:3857', 'EPSG:4326');
      const coords = `"[${extent[0].toFixed(5)}, ${extent[1].toFixed(5)}]"`;

      csvContent += `${id},${category},${title},${desc},${postcode},${postcodeStatus},${state},${lga},${ward},${district},${measurement},${time},${type},${coords}\n`;
    });

    const timestamp = new Date().toISOString().split('T')[0];
    triggerDownload(`GeoField_Data_${timestamp}.csv`, csvContent, 'text/csv');
    console.log('✅ CSV Exported Successfully.');
  });
}