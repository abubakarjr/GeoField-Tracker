// src/js/export.js
import GeoJSON from 'ol/format/GeoJSON.js';
import { transformExtent, toLonLat } from 'ol/proj.js';
import { formatHyphenatedPostcode } from './postcode.js';

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

// RFC-4180 compliant CSV cell escaping
function csvCell(value) {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/\r?\n/g, ' ').replace(/"/g, '""').trim();
  return `"${str}"`;
}

function getRepresentativeLonLat(geom) {
  const type = geom.getType();
  let coord;
  if (type === 'Point') {
    coord = geom.getCoordinates();
  } else if (type === 'LineString') {
    coord = geom.getFirstCoordinate();
  } else if (type === 'Polygon') {
    coord = geom.getInteriorPoint().getCoordinates().slice(0, 2);
  }
  return coord ? toLonLat(coord) : [0, 0];
}

export function setupExport(vectorSource, showToast = () => {}) {
  const btnGeoJSON = document.getElementById('btn-export-geojson');
  const btnCSV = document.getElementById('btn-export-csv');

  // 1. Export as GeoJSON
  btnGeoJSON.addEventListener('click', () => {
    const features = vectorSource.getFeatures();
    if (features.length === 0) {
      showToast('Draw or save at least one feature before exporting.', 'warning');
      return;
    }

    const format = new GeoJSON();
    const geojsonStr = format.writeFeatures(features, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326',
    });

    const timestamp = new Date().toISOString().split('T')[0];
    triggerDownload(`GeoField_Data_${timestamp}.geojson`, geojsonStr, 'application/json');
    showToast(`Exported ${features.length} features to GeoJSON`, 'success');
  });

  // 2. Export as CSV with dedicated Postcode & Administrative columns
  btnCSV.addEventListener('click', () => {
    const features = vectorSource.getFeatures();
    if (features.length === 0) {
      showToast('Draw or save at least one feature before exporting.', 'warning');
      return;
    }

    const headers = [
      'ID',
      'Title',
      'Category',
      'Postcode',
      'Postcode_Formatted',
      'Postcode_Status',
      'State',
      'LGA',
      'Ward',
      'District',
      'Measurement',
      'Latitude',
      'Longitude',
      'Geometry_Type',
      'Extent_Bounds',
      'Description',
      'Timestamp',
    ];

    const rows = [headers.join(',')];

    features.forEach((feature, index) => {
      const props = feature.getProperties();
      const geom = feature.getGeometry();
      const type = geom.getType();

      const rawPostcode = props.postcode || '';
      const formattedPostcode = rawPostcode ? formatHyphenatedPostcode(rawPostcode) : '';
      const [lon, lat] = getRepresentativeLonLat(geom);
      const extent = transformExtent(geom.getExtent(), 'EPSG:3857', 'EPSG:4326');
      const boundsStr = `[${extent[0].toFixed(5)}, ${extent[1].toFixed(5)}, ${extent[2].toFixed(5)}, ${extent[3].toFixed(5)}]`;

      const row = [
        csvCell(feature.getId() || `feat_${index + 1}`),
        csvCell(props.title || 'Unnamed Feature'),
        csvCell(props.type || 'N/A'),
        csvCell(rawPostcode || 'N/A'),
        csvCell(formattedPostcode || 'N/A'),
        csvCell(props.postcodeStatus || 'unverified'),
        csvCell(props.state || ''),
        csvCell(props.lga || ''),
        csvCell(props.ward || ''),
        csvCell(props.district || ''),
        csvCell(props.measurement || ''),
        csvCell(lat.toFixed(6)),
        csvCell(lon.toFixed(6)),
        csvCell(type),
        csvCell(boundsStr),
        csvCell(props.description || ''),
        csvCell(props.timestamp || new Date().toISOString()),
      ];

      rows.push(row.join(','));
    });

    const timestamp = new Date().toISOString().split('T')[0];
    triggerDownload(`GeoField_Data_${timestamp}.csv`, rows.join('\n'), 'text/csv;charset=utf-8;');
    showToast(`Exported ${features.length} features to CSV with Postcodes`, 'success');
  });
}