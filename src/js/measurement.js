import { getArea, getLength } from 'ol/sphere.js';

export function formatLength(line) {
  const length = getLength(line);
  if (length > 1000) {
    return (Math.round((length / 1000) * 100) / 100) + ' km';
  }
  return (Math.round(length * 100) / 100) + ' m';
}

export function formatArea(polygon) {
  const area = getArea(polygon);
  if (area >= 10000) {
    return (Math.round((area / 10000) * 100) / 100) + ' hectares';
  }
  return (Math.round(area * 100) / 100) + ' m²';
}