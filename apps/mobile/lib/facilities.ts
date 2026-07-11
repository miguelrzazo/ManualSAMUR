import type { Facility } from "./types";

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => degrees * Math.PI / 180;

export function distanceKm(from: { latitude: number; longitude: number }, facility: Facility): number {
  const latitudeDelta = toRadians(facility.lat - from.latitude);
  const longitudeDelta = toRadians(facility.lng - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(facility.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestHospital(from: { latitude: number; longitude: number }, hospitals: Facility[]): { hospital: Facility; distanceKm: number } | null {
  const candidates = hospitals.filter((hospital) => hospital.type !== "private");
  if (!candidates.length) return null;
  return candidates.reduce<{ hospital: Facility; distanceKm: number }>((nearest, hospital) => {
    const candidateDistance = distanceKm(from, hospital);
    return candidateDistance < nearest.distanceKm ? { hospital, distanceKm: candidateDistance } : nearest;
  }, { hospital: candidates[0], distanceKm: distanceKm(from, candidates[0]) });
}
