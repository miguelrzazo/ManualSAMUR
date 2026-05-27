#!/usr/bin/env node
/**
 * Processes content/ and outputs iOS-ready JSON to public/data/.
 * Vercel serves these as static CDN assets; the iOS app fetches them directly.
 *
 * Run standalone: node scripts/export-ios-data.js
 * Called by package.json "build" script before next build.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CONTENT = path.join(ROOT, 'content')
const PUBLIC_DATA = path.join(ROOT, 'public/data')

fs.mkdirSync(PUBLIC_DATA, { recursive: true })

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseFrontmatter(md) {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: md }
  const raw = match[1]
  const body = match[2].trimStart()
  const meta = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\w+):\s*['"]?(.+?)['"]?\s*$/)
    if (m) meta[m[1]] = m[2]
  }
  return { meta, body }
}

const SECTION_COLORS = {
  sva: '#D71920',
  svb: '#0057B8',
  operativos: '#F97316',
  administrativos: '#64748B',
  comunicaciones: '#06B6D4',
  general: '#10B981',
  tecnicas: '#8B5CF6',
  psicologicos: '#DFFF00',
  drp: '#F97316',
  intervinientes: '#10B981',
}

// ── Procedures ────────────────────────────────────────────────────────────────

const procedures = []
const procDir = path.join(CONTENT, 'procedures')
const sections = fs.readdirSync(procDir).filter(d =>
  fs.statSync(path.join(procDir, d)).isDirectory()
)

for (const section of sections) {
  const sectionDir = path.join(procDir, section)
  const files = fs.readdirSync(sectionDir).filter(f => f.endsWith('.md'))
  for (const file of files) {
    const id = file.replace('.md', '')
    const raw = fs.readFileSync(path.join(sectionDir, file), 'utf8')
    const { meta, body } = parseFrontmatter(raw)
    const title = meta.title || body.match(/^#\s+(.+)$/m)?.[1]?.trim() || id
    procedures.push({
      id,
      title,
      section,
      sectionColor: SECTION_COLORS[section] ?? '#64748B',
      content: body,
      updated: meta.updated ?? null,
    })
  }
}

procedures.sort((a, b) => {
  const na = parseInt(a.id, 10), nb = parseInt(b.id, 10)
  if (!isNaN(na) && !isNaN(nb)) return na - nb
  return a.id.localeCompare(b.id)
})

fs.writeFileSync(path.join(PUBLIC_DATA, 'procedures.json'), JSON.stringify(procedures))
console.log(`✓ procedures.json (${procedures.length} items, ${(Buffer.byteLength(JSON.stringify(procedures)) / 1024).toFixed(0)} KB)`)

// ── Vademecum ─────────────────────────────────────────────────────────────────

const vademecum = JSON.parse(fs.readFileSync(path.join(CONTENT, 'data/vademecum.json'), 'utf8'))
fs.writeFileSync(path.join(PUBLIC_DATA, 'vademecum.json'), JSON.stringify(vademecum))
console.log(`✓ vademecum.json (${vademecum.length} items)`)

// ── Codigos ───────────────────────────────────────────────────────────────────
// Merge all codigos-*.json files into a single keyed object.
// Skip "cheatsheet" (complex template format, not useful for lookup).

const codigoFiles = fs.readdirSync(path.join(CONTENT, 'data'))
  .filter(f => f.startsWith('codigos-') && f.endsWith('.json'))

const codigosMap = {}
for (const file of codigoFiles) {
  const key = file.replace('codigos-', '').replace('.json', '')
  if (key === 'cheatsheet') continue
  const data = JSON.parse(fs.readFileSync(path.join(CONTENT, 'data', file), 'utf8'))
  codigosMap[key] = data
}

fs.writeFileSync(path.join(PUBLIC_DATA, 'codigos.json'), JSON.stringify(codigosMap))
console.log(`✓ codigos.json (${Object.keys(codigosMap).length} types)`)

// ── Hospitals ─────────────────────────────────────────────────────────────────

const hospitals = JSON.parse(fs.readFileSync(path.join(CONTENT, 'data/hospitals.json'), 'utf8'))
fs.writeFileSync(path.join(PUBLIC_DATA, 'hospitals.json'), JSON.stringify(hospitals))
console.log(`✓ hospitals.json (${hospitals.length} items)`)

// ── Manifest ──────────────────────────────────────────────────────────────────

const manifest = {
  lastUpdated: new Date().toISOString(),
  version: Date.now(),
}
fs.writeFileSync(path.join(PUBLIC_DATA, 'manifest.json'), JSON.stringify(manifest))
console.log(`✓ manifest.json`)

console.log('\n✅ iOS data export complete → public/data/')
