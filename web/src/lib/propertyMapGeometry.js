const EARTH_RADIUS_M = 6_371_008.8;
const radians = (degrees) => (degrees * Math.PI) / 180;

export function distanceMeters(a, b) {
  const lat1 = radians(a.lat), lat2 = radians(b.lat);
  const dLat = lat2 - lat1, dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLengthMeters(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceMeters(points[i - 1], points[i]);
  return total;
}

export function polygonAreaMeters2(points) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i], next = points[(i + 1) % points.length];
    sum += radians(next.lng - current.lng) * (2 + Math.sin(radians(current.lat)) + Math.sin(radians(next.lat)));
  }
  return Math.abs((sum * EARTH_RADIUS_M ** 2) / 2);
}

export function measurementValue(measurement) {
  if (measurement.type === "count") return 1;
  return measurement.type === "area"
    ? polygonAreaMeters2(measurement.points)
    : pathLengthMeters(measurement.points);
}

export function formatPropertyMeasurement(measurement, units = "imperial") {
  const value = measurementValue(measurement);
  if (measurement.type === "count") return "1 EA";
  if (measurement.type === "area") {
    return units === "imperial"
      ? `${(value * 10.7639104167).toLocaleString(undefined, { maximumFractionDigits: 1 })} SF`
      : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} m²`;
  }
  return units === "imperial"
    ? `${(value * 3.280839895).toLocaleString(undefined, { maximumFractionDigits: 1 })} LF`
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} m`;
}
