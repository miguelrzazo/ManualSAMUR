import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "samur-manual.favourites.v1";

export function toggleFavouriteId(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}

export async function readFavourites(): Promise<string[]> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function toggleFavourite(id: string): Promise<string[]> {
  const current = await readFavourites();
  const next = toggleFavouriteId(current, id);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
