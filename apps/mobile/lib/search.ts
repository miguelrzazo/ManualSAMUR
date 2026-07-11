export function normaliseSearch(value: unknown): string {
  return (typeof value === "string" ? value : JSON.stringify(value))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export function matchesSearch(value: unknown, query: string): boolean {
  const term = normaliseSearch(query.trim());
  return Boolean(term) && normaliseSearch(value).includes(term);
}
