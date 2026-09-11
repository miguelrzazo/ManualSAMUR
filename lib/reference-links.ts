/** Shared, conservative linking for references embedded in procedure prose. */

export interface ReferenceDrug {
  id: string;
  name: string;
  synonyms?: string[];
}

export interface ReferenceCode {
  code: string;
  name: string;
  tab: string;
  subtab?: string;
}

type Mention = { label: string; href: string; id: string; kind: "drug" | "code" };

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function protectMarkdown(content: string): { text: string; protectedParts: string[] } {
  const protectedParts: string[] = [];
  const text = content.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`|!?(?:\[[^\]]*\])\([^)]*\)|<[^>]+>/g, (part) => {
    const token = `\u0000REF_${protectedParts.length}\u0000`;
    protectedParts.push(part);
    return token;
  });
  return { text, protectedParts };
}

function restoreMarkdown(text: string, protectedParts: string[]): string {
  return text.replace(/\u0000REF_(\d+)\u0000/g, (_match, index: string) => protectedParts[Number(index)] ?? "");
}

function codeHref(code: ReferenceCode): string {
  const params = new URLSearchParams({ tab: code.tab, code: code.code });
  if (code.subtab) params.set("subtab", code.subtab);
  return `/codigos?${params.toString()}`;
}

function mentionsFor(drugs: ReferenceDrug[], codes: ReferenceCode[], drugHref: (id: string) => string, codeLink = codeHref): Mention[] {
  const byLabel = new Map<string, Mention | null>();
  const add = (mention: Mention) => {
    const key = normalize(mention.label);
    if (key.length < 3) return;
    if (byLabel.has(key) && byLabel.get(key) === null) return;
    const prior = byLabel.get(key);
    byLabel.set(key, prior && (prior.id !== mention.id || prior.kind !== mention.kind) ? null : (prior ?? mention));
  };
  for (const drug of drugs) {
    for (const label of [drug.name, ...(drug.synonyms ?? [])]) {
      add({ label, href: drugHref(drug.id), id: drug.id, kind: "drug" });
    }
  }
  for (const code of codes) {
    const id = `${code.tab}:${code.subtab ?? ""}:${code.code}`;
    // A symptom such as “shock” or “caída” is not an unambiguous code mention.
    // Named code links must carry the radio vocabulary marker; numeric/alphanumeric
    // codes are linked only with the explicit Código/Clave prefix below.
    if (/^(?:c[oó]digo|clave)\b/i.test(code.name.trim())) add({ label: code.name, href: codeLink(code), id, kind: "code" });
    add({ label: `${code.subtab === "claves" ? "Clave" : "Código"} ${code.code}`, href: codeLink(code), id, kind: "code" });
  }
  return [...byLabel.values()].filter((mention): mention is Mention => mention !== null).sort((a, b) => b.label.length - a.label.length);
}

function replaceMentions(text: string, mentions: Mention[], link: boolean): string {
  if (!mentions.length) return text;
  const byPattern = mentions.map((mention) => escapeRegex(mention.label)).join("|");
  const targets = new Map(mentions.map((mention) => [normalize(mention.label), mention]));
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${byPattern})(?=$|[^\\p{L}\\p{N}])`, "giu");
  return text.replace(pattern, (_match, prefix: string, label: string) => {
    const mention = targets.get(normalize(label));
    return mention && link ? `${prefix}[${label}](${mention.href})` : `${prefix}${label}`;
  });
}

export function collectReferenceMentions(content: string, drugs: ReferenceDrug[], codes: ReferenceCode[] = []): { drugIds: string[]; codeIds: string[] } {
  const { text } = protectMarkdown(content);
  const foundDrugs = new Set<string>();
  const foundCodes = new Set<string>();
  for (const match of content.matchAll(/(?:[?&]farmaco=|\/vademecum\/)([^&#)\s]+)/gi)) {
    try {
      const id = decodeURIComponent(match[1]);
      if (drugs.some((drug) => drug.id === id)) foundDrugs.add(id);
    } catch { /* malformed legacy href: leave it untouched */ }
  }
  for (const mention of mentionsFor(drugs, codes, (id) => id)) {
    const probe = replaceMentions(text, [mention], true);
    if (probe === text) continue;
    if (mention.kind === "drug") foundDrugs.add(mention.id);
    else foundCodes.add(mention.id);
  }
  return { drugIds: [...foundDrugs], codeIds: [...foundCodes] };
}

export function linkReferenceMentions(content: string, drugs: ReferenceDrug[], codes: ReferenceCode[] = [], drugHref = (id: string) => `/vademecum?farmaco=${encodeURIComponent(id)}`): string {
  const { text, protectedParts } = protectMarkdown(content);
  const mentions = mentionsFor(drugs, codes, drugHref);
  const linked = replaceMentions(text, mentions, true);
  return restoreMarkdown(linked, protectedParts);
}
