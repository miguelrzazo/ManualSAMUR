# iOS App + Monorepo Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the repo to a Turborepo monorepo and build a native-feeling iOS app with React Native + Expo (4 tabs: Manual, Códigos, Vademécum, Mapa) with full offline access and parity with the web app.

**Architecture:** The existing Next.js app moves to `apps/web/`. Shared logic (types, search, markdown) and content (procedures, data JSON) are extracted into `packages/core` and `packages/content`. The Expo app at `apps/ios/` imports from these packages and bundles all content at build time for offline use.

**Tech Stack:** Turborepo, pnpm workspaces, Expo SDK 52+, Expo Router v4, `react-native-maps`, `react-native-markdown-display`, `react-native-reanimated`, `fuse.js`, `@react-native-async-storage/async-storage`, Instrument Serif + IBM Plex Mono via `expo-font`

**Prerequisite:** Plan `2026-05-17-web-design-system-completion.md` merged to main.

---

## File Map — Final Structure

```
ManualSAMUR/                          ← repo root (was the web app)
├── apps/
│   ├── web/                          ← Next.js app (moved here)
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── content/ → symlink to ../../packages/content/files
│   │   ├── package.json
│   │   └── next.config.ts
│   └── ios/                          ← Expo app (new)
│       ├── app/
│       │   ├── _layout.tsx           ← RootLayout, ThemeProvider, fonts
│       │   └── (tabs)/
│       │       ├── _layout.tsx       ← TabNavigator (4 tabs)
│       │       ├── manual/
│       │       │   ├── _layout.tsx   ← Stack for Manual tab
│       │       │   ├── index.tsx     ← ProcedureList
│       │       │   └── [id].tsx      ← ProcedureDetail
│       │       ├── vademecum/
│       │       │   ├── _layout.tsx
│       │       │   ├── index.tsx     ← DrugList
│       │       │   └── [id].tsx      ← DrugDetail
│       │       ├── codigos/
│       │       │   └── index.tsx     ← CodesView
│       │       └── mapa/
│       │           └── index.tsx     ← MapView
│       ├── components/
│       │   ├── shared/
│       │   │   ├── SearchBar.tsx     ← native UISearchBar wrapper
│       │   │   ├── SectionHeader.tsx ← "// description" mono header
│       │   │   └── ThemedView.tsx    ← dark/light aware container
│       │   ├── manual/
│       │   │   ├── ProcedureRow.tsx
│       │   │   └── ProcedureMarkdown.tsx
│       │   ├── vademecum/
│       │   │   ├── DrugCard.tsx
│       │   │   └── FilterChips.tsx
│       │   ├── codigos/
│       │   │   └── CodesTable.tsx
│       │   └── mapa/
│       │       └── HospitalMap.tsx
│       ├── hooks/
│       │   ├── useSearch.ts          ← Fuse.js wrapper
│       │   ├── useFavorites.ts       ← AsyncStorage favorites
│       │   └── useHistory.ts         ← AsyncStorage history
│       ├── constants/
│       │   └── tokens.ts             ← color/spacing (shared with @samur/core)
│       ├── app.json
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── core/                         ← @samur/core
│   │   ├── src/
│   │   │   ├── types.ts
│   │   │   ├── search.ts
│   │   │   ├── markdown.ts
│   │   │   ├── tokens.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── content/                      ← @samur/content
│       ├── procedures/               ← Markdown files (moved from web)
│       ├── data/                     ← JSON files (moved from web)
│       ├── index.ts                  ← re-exports all data
│       ├── package.json
│       └── tsconfig.json
├── turbo.json
├── pnpm-workspace.yaml
└── package.json                      ← root workspace package.json
```

---

## Phase 1 — Monorepo Migration

### Task 1: Initialize Turborepo + pnpm workspaces

**Files:**
- Create: `turbo.json`
- Create: `pnpm-workspace.yaml`
- Modify: `package.json` (root)

- [ ] **Install Turborepo**

From the repo root:
```bash
npm install -g pnpm
pnpm add -D turbo --ignore-workspace-root-check
```

- [ ] **Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Update root package.json**

Replace current `package.json` at repo root with:

```json
{
  "name": "manual-samur-root",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "dev:web": "turbo dev --filter=web",
    "dev:ios": "turbo dev --filter=ios",
    "build": "turbo build",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "latest"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Commit**

```bash
git add turbo.json pnpm-workspace.yaml package.json
git commit -m "chore: initialize Turborepo + pnpm workspaces"
```

---

### Task 2: Move web app to apps/web/

**Files:**
- Move: all current root files → `apps/web/`
- Modify: `apps/web/package.json`

- [ ] **Create apps/ directory and move web app**

```bash
mkdir -p apps/web
# Move everything EXCEPT the new root files (turbo.json, pnpm-workspace.yaml, apps/, packages/)
git mv app apps/web/app
git mv components apps/web/components
git mv lib apps/web/lib
git mv public apps/web/public
git mv content apps/web/content
git mv next.config.ts apps/web/next.config.ts
git mv next-env.d.ts apps/web/next-env.d.ts
git mv tsconfig.json apps/web/tsconfig.json
git mv tailwind.config.ts apps/web/tailwind.config.ts 2>/dev/null || true
git mv postcss.config.mjs apps/web/postcss.config.mjs 2>/dev/null || true
git mv .eslintrc.json apps/web/.eslintrc.json 2>/dev/null || true
```

- [ ] **Move package.json and add workspace name**

```bash
git mv package.json apps/web/package.json
```

Then open `apps/web/package.json` and add `"name": "web"` at the top level:

```json
{
  "name": "web",
  "version": "0.1.0",
  "private": true,
  ...
}
```

- [ ] **Add dev script to apps/web/package.json**

Ensure `"scripts"` contains:
```json
"scripts": {
  "dev": "next dev --turbo",
  "build": "next build",
  "start": "next start",
  "lint": "next lint"
}
```

- [ ] **Install dependencies from root**

```bash
pnpm install
```

- [ ] **Verify web app still works**

```bash
pnpm dev:web
```
Open `http://localhost:3000`. App must work identically to before.

- [ ] **Commit**

```bash
git add -A
git commit -m "chore: move Next.js web app into apps/web/"
```

---

### Task 3: Extract @samur/content package

**Files:**
- Create: `packages/content/package.json`
- Create: `packages/content/tsconfig.json`
- Create: `packages/content/index.ts`
- Move: `apps/web/content/procedures/` → `packages/content/procedures/`
- Move: `apps/web/content/data/` → `packages/content/data/`

- [ ] **Move content files**

```bash
mkdir -p packages/content
git mv apps/web/content/procedures packages/content/procedures
git mv apps/web/content/data packages/content/data
```

- [ ] **Create packages/content/package.json**

```json
{
  "name": "@samur/content",
  "version": "0.1.0",
  "private": true,
  "main": "./index.ts",
  "types": "./index.ts",
  "exports": {
    ".": "./index.ts",
    "./data/*": "./data/*",
    "./procedures/*": "./procedures/*"
  }
}
```

- [ ] **Create packages/content/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Create packages/content/index.ts**

```ts
export { default as vademecumData } from './data/vademecum.json'
export { default as vademecumComerciales } from './data/vademecum-comerciales.json'
export { default as hospitalsData } from './data/hospitals.json'
export { default as fluidosData } from './data/fluidos.json'
// Add other JSON exports as needed — check packages/content/data/ for all files
```

- [ ] **Update web app to use @samur/content**

Add to `apps/web/package.json` dependencies:
```json
"@samur/content": "workspace:*"
```

In `apps/web/lib/vademecum-config.ts` (and any other file that imports from `../../content/data/`), update the import path from:
```ts
import data from '../../content/data/vademecum.json'
```
to:
```ts
import data from '@samur/content/data/vademecum.json'
```

Do the same for `hospitals.json`, `fluidos.json`, and any other data imports in `apps/web/lib/`.

- [ ] **Verify web still builds**

```bash
pnpm dev:web
```
Expected: app loads, Vademécum and Mapa pages work.

- [ ] **Commit**

```bash
git add -A
git commit -m "chore: extract @samur/content package with procedures and data"
```

---

### Task 4: Extract @samur/core package

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/tokens.ts`
- Create: `packages/core/src/search.ts`
- Create: `packages/core/src/markdown.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Create packages/core/package.json**

```json
{
  "name": "@samur/core",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "fuse.js": "^7.0.0"
  }
}
```

- [ ] **Create packages/core/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Create packages/core/src/types.ts**

```ts
export interface Procedure {
  id: string
  slug: string
  title: string
  section: string
  sectionColor: string
  content: string
  relatedIds: string[]
}

export interface Drug {
  id: string
  nombre: string
  categoria?: string
  grupo?: string
  via?: string
  indicacion?: string
  descripcion?: string
  dosis?: string
  presentacion?: string
}

export interface Code {
  id: string
  codigo: string
  descripcion: string
  tipo: string
}

export interface Hospital {
  id: string
  nombre: string
  tipo: string
  lat: number
  lng: number
  direccion?: string
}
```

> **Note:** Check `content/data/vademecum.json` for actual field names and update `Drug` accordingly before using in the iOS app.

- [ ] **Create packages/core/src/tokens.ts**

```ts
export const colors = {
  ambulanceYellow: '#DFFF00',
  limeReflective: '#B6E600',
  samurRed: '#D71920',
  operativeRed: '#9F1239',
  starBlue: '#0057B8',
  operativeOrange: '#F97316',
  progressGreen: '#10B981',
  techCyan: '#06B6D4',
  iaViolet: '#8B5CF6',
  sidebar: '#020817',
  nightBlue: '#07111F',
} as const

export const darkTheme = {
  background: '#020817',
  surface: '#081221',
  surfaceElevated: '#0D1A2D',
  textPrimary: '#F1F5F9',
  textSecondary: '#8CA0B8',
  border: '#243047',
} as const

export const lightTheme = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#F8FAFC',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  border: '#E5E7EB',
} as const
```

- [ ] **Create packages/core/src/search.ts**

```ts
import Fuse from 'fuse.js'
import type { Procedure, Drug, Code } from './types'

export function createProcedureSearch(procedures: Procedure[]) {
  return new Fuse(procedures, {
    keys: ['title', 'id', 'section', 'content'],
    threshold: 0.3,
    includeScore: true,
    minMatchCharLength: 2,
  })
}

export function createDrugSearch(drugs: Drug[]) {
  return new Fuse(drugs, {
    keys: ['nombre', 'categoria', 'grupo', 'indicacion'],
    threshold: 0.3,
    includeScore: true,
    minMatchCharLength: 2,
  })
}

export function createCodeSearch(codes: Code[]) {
  return new Fuse(codes, {
    keys: ['codigo', 'descripcion'],
    threshold: 0.2,
    includeScore: true,
    minMatchCharLength: 1,
  })
}
```

- [ ] **Create packages/core/src/markdown.ts**

```ts
/**
 * Normalize internal procedure links from legacy formats to /manual/[slug].
 * Used by both web (remark pipeline) and iOS (pre-processing before display).
 */
export function normalizeProcedureLinks(markdown: string): string {
  // Convert [label](103) → [label](/manual/103)
  return markdown.replace(
    /\[([^\]]+)\]\((\d{3})\)/g,
    (_, label, id) => `[${label}](/manual/${id})`
  )
}

/**
 * Extract the title from a procedure's Markdown content (first # heading).
 */
export function extractTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : 'Sin título'
}
```

- [ ] **Create packages/core/src/index.ts**

```ts
export * from './types'
export * from './tokens'
export * from './search'
export * from './markdown'
```

- [ ] **Install fuse.js in @samur/core**

```bash
cd packages/core && pnpm add fuse.js && cd ../..
```

- [ ] **Commit**

```bash
git add packages/core/
git commit -m "chore: extract @samur/core package (types, tokens, search, markdown)"
```

---

## Phase 2 — Expo iOS App Scaffold

### Task 5: Create Expo app and configure workspace

**Files:**
- Create: `apps/ios/` (Expo scaffold)
- Modify: `apps/ios/package.json`
- Modify: `apps/ios/app.json`

- [ ] **Scaffold the Expo app**

```bash
npx create-expo-app@latest apps/ios --template blank-typescript
```

- [ ] **Update apps/ios/package.json**

Set the name and add workspace dependencies:

```json
{
  "name": "ios",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start",
    "build": "expo export",
    "ios": "expo run:ios",
    "lint": "eslint ."
  },
  "dependencies": {
    "@samur/core": "workspace:*",
    "@samur/content": "workspace:*",
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "expo-font": "~13.0.0",
    "expo-haptics": "~14.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.2",
    "react-native": "0.76.0",
    "react-native-maps": "1.18.0",
    "react-native-markdown-display": "^7.0.0",
    "react-native-reanimated": "~3.16.0",
    "react-native-gesture-handler": "~2.20.0",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.3.0",
    "@react-native-async-storage/async-storage": "1.23.1",
    "fuse.js": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "~18.3.0",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Update apps/ios/app.json**

```json
{
  "expo": {
    "name": "Manual SAMUR",
    "slug": "manual-samur",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "manualsamur",
    "userInterfaceStyle": "automatic",
    "splash": {
      "backgroundColor": "#020817"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.samur.manual"
    },
    "plugins": [
      "expo-router",
      "expo-font"
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

- [ ] **Install dependencies**

```bash
pnpm install
```

- [ ] **Create apps/ios/tsconfig.json**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@samur/core": ["../../packages/core/src/index.ts"],
      "@samur/content": ["../../packages/content/index.ts"]
    }
  }
}
```

- [ ] **Commit**

```bash
git add apps/ios/
git commit -m "chore: scaffold Expo iOS app with workspace dependencies"
```

---

### Task 6: Root layout, fonts, and theme

**Files:**
- Create: `apps/ios/app/_layout.tsx`
- Create: `apps/ios/constants/tokens.ts`

- [ ] **Create constants/tokens.ts**

```ts
// apps/ios/constants/tokens.ts
import { useColorScheme } from 'react-native'
import { darkTheme, lightTheme, colors } from '@samur/core'

export { colors }

export function useTheme() {
  const scheme = useColorScheme()
  return scheme === 'dark' ? darkTheme : lightTheme
}
```

- [ ] **Create app/_layout.tsx**

```tsx
// apps/ios/app/_layout.tsx
import { useEffect } from 'react'
import { Stack } from 'expo-router'
import * as Font from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [fontsLoaded] = Font.useFonts({
    'InstrumentSerif-Regular': require('../assets/fonts/InstrumentSerif-Regular.ttf'),
    'InstrumentSerif-Italic': require('../assets/fonts/InstrumentSerif-Italic.ttf'),
    'IBMPlexMono-Regular': require('../assets/fonts/IBMPlexMono-Regular.ttf'),
    'IBMPlexMono-Medium': require('../assets/fonts/IBMPlexMono-Medium.ttf'),
    'IBMPlexMono-SemiBold': require('../assets/fonts/IBMPlexMono-SemiBold.ttf'),
  })

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  )
}
```

- [ ] **Download font files**

Download from Google Fonts and place in `apps/ios/assets/fonts/`:
- `InstrumentSerif-Regular.ttf`
- `InstrumentSerif-Italic.ttf`
- `IBMPlexMono-Regular.ttf`
- `IBMPlexMono-Medium.ttf`
- `IBMPlexMono-SemiBold.ttf`

```bash
mkdir -p apps/ios/assets/fonts
# Download from fonts.google.com or use npx:
cd apps/ios && npx expo install @expo-google-fonts/instrument-serif @expo-google-fonts/ibm-plex-mono
```

If using `@expo-google-fonts`, replace the `Font.useFonts` call with:
```tsx
import { useFonts, InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif'
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono'

const [fontsLoaded] = useFonts({
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
})
```

And update font names in `StyleSheet` objects to match.

- [ ] **Commit**

```bash
git add apps/ios/app/_layout.tsx apps/ios/constants/tokens.ts apps/ios/assets/fonts/
git commit -m "feat(ios): root layout with fonts, gesture handler, theme tokens"
```

---

### Task 7: Tab Navigator (4 tabs)

**Files:**
- Create: `apps/ios/app/(tabs)/_layout.tsx`

- [ ] **Create the tab layout**

```tsx
// apps/ios/app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router'
import { useColorScheme, Platform } from 'react-native'
import { BookOpen, Zap, Pill, Map } from 'lucide-react-native'
import { colors, darkTheme, lightTheme } from '@samur/core'

export default function TabsLayout() {
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? darkTheme : lightTheme

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ambulanceYellow,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.sidebar,
          borderTopColor: theme.border,
          borderTopWidth: 0.5,
        },
        tabBarLabelStyle: {
          fontFamily: 'IBMPlexMono_400Regular',
          fontSize: 10,
          letterSpacing: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="manual"
        options={{
          title: 'Manual',
          tabBarIcon: ({ color, size }) => <BookOpen size={size} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="codigos"
        options={{
          title: 'Códigos',
          tabBarIcon: ({ color, size }) => <Zap size={size} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="vademecum"
        options={{
          title: 'Vademécum',
          tabBarIcon: ({ color, size }) => <Pill size={size} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="mapa"
        options={{
          title: 'Mapa',
          tabBarIcon: ({ color, size }) => <Map size={size} color={color} strokeWidth={1.5} />,
        }}
      />
    </Tabs>
  )
}
```

> Install lucide-react-native: `cd apps/ios && pnpm add lucide-react-native react-native-svg`

- [ ] **Create placeholder screens to verify navigation**

Create these files with a minimal `<Text>` component each:
- `apps/ios/app/(tabs)/manual/index.tsx` → `<Text>Manual</Text>`
- `apps/ios/app/(tabs)/codigos/index.tsx` → `<Text>Códigos</Text>`
- `apps/ios/app/(tabs)/vademecum/index.tsx` → `<Text>Vademécum</Text>`
- `apps/ios/app/(tabs)/mapa/index.tsx` → `<Text>Mapa</Text>`

- [ ] **Run on simulator**

```bash
cd apps/ios && npx expo start --ios
```
Expected: 4 tabs appear at the bottom. Tapping switches screens. Tab bar is dark (`#020817`), active tab is yellow.

- [ ] **Commit**

```bash
git add apps/ios/app/\(tabs\)/
git commit -m "feat(ios): 4-tab navigator (Manual, Códigos, Vademécum, Mapa)"
```

---

### Task 8: Shared components — SearchBar and SectionHeader

**Files:**
- Create: `apps/ios/components/shared/SearchBar.tsx`
- Create: `apps/ios/components/shared/SectionHeader.tsx`
- Create: `apps/ios/components/shared/ThemedView.tsx`

- [ ] **Create SearchBar.tsx**

```tsx
// apps/ios/components/shared/SearchBar.tsx
import { TextInput, View, StyleSheet, useColorScheme } from 'react-native'
import { Search } from 'lucide-react-native'
import { darkTheme, lightTheme, colors } from '@samur/core'

interface Props {
  placeholder: string
  value: string
  onChangeText: (text: string) => void
}

export function SearchBar({ placeholder, value, onChangeText }: Props) {
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? darkTheme : lightTheme

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Search size={16} color={theme.textSecondary} strokeWidth={1.5} />
      <TextInput
        style={[styles.input, { color: theme.textPrimary, fontFamily: 'IBMPlexMono_400Regular' }]}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        value={value}
        onChangeText={onChangeText}
        clearButtonMode="while-editing"
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 14,
  },
})
```

- [ ] **Create SectionHeader.tsx**

```tsx
// apps/ios/components/shared/SectionHeader.tsx
import { View, Text, StyleSheet, useColorScheme } from 'react-native'
import { darkTheme, lightTheme } from '@samur/core'

interface Props {
  code: string      // e.g. "// procedimientos · circulación"
  title: string     // e.g. "Manual SAMUR"
}

export function SectionHeader({ code, title }: Props) {
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? darkTheme : lightTheme

  return (
    <View style={styles.container}>
      <Text style={[styles.code, { color: theme.textSecondary }]}>{code}</Text>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 4 },
  code: {
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 28,
    lineHeight: 32,
  },
})
```

- [ ] **Create ThemedView.tsx**

```tsx
// apps/ios/components/shared/ThemedView.tsx
import { View, type ViewProps, useColorScheme } from 'react-native'
import { darkTheme, lightTheme } from '@samur/core'

export function ThemedView({ style, ...props }: ViewProps) {
  const scheme = useColorScheme()
  const bg = scheme === 'dark' ? darkTheme.background : lightTheme.background
  return <View style={[{ flex: 1, backgroundColor: bg }, style]} {...props} />
}
```

- [ ] **Commit**

```bash
git add apps/ios/components/
git commit -m "feat(ios): SearchBar, SectionHeader, ThemedView shared components"
```

---

### Task 9: useSearch hook (shared Fuse.js logic)

**Files:**
- Create: `apps/ios/hooks/useSearch.ts`

- [ ] **Create useSearch.ts**

```ts
// apps/ios/hooks/useSearch.ts
import { useState, useMemo } from 'react'
import { createProcedureSearch, createDrugSearch, createCodeSearch } from '@samur/core'
import type { Procedure, Drug, Code } from '@samur/core'

export function useProcedureSearch(procedures: Procedure[]) {
  const [query, setQuery] = useState('')
  const fuse = useMemo(() => createProcedureSearch(procedures), [procedures])
  const results = useMemo(
    () => (query.length < 2 ? procedures : fuse.search(query).map(r => r.item)),
    [query, fuse, procedures]
  )
  return { query, setQuery, results }
}

export function useDrugSearch(drugs: Drug[]) {
  const [query, setQuery] = useState('')
  const fuse = useMemo(() => createDrugSearch(drugs), [drugs])
  const results = useMemo(
    () => (query.length < 2 ? drugs : fuse.search(query).map(r => r.item)),
    [query, fuse, drugs]
  )
  return { query, setQuery, results }
}

export function useCodeSearch(codes: Code[]) {
  const [query, setQuery] = useState('')
  const fuse = useMemo(() => createCodeSearch(codes), [codes])
  const results = useMemo(
    () => (query.length < 2 ? codes : fuse.search(query).map(r => r.item)),
    [query, fuse, codes]
  )
  return { query, setQuery, results }
}
```

- [ ] **Commit**

```bash
git add apps/ios/hooks/useSearch.ts
git commit -m "feat(ios): useSearch hooks using @samur/core Fuse.js"
```

---

### Task 10: useFavorites and useHistory hooks

**Files:**
- Create: `apps/ios/hooks/useFavorites.ts`
- Create: `apps/ios/hooks/useHistory.ts`

- [ ] **Create useFavorites.ts**

```ts
// apps/ios/hooks/useFavorites.ts
import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'

const FAVORITES_KEY = '@samur/favorites'

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([])

  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY).then(v => {
      if (v) setFavorites(JSON.parse(v))
    })
  }, [])

  const toggle = useCallback(async (id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
      return next
    })
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [])

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites])

  return { favorites, toggle, isFavorite }
}
```

- [ ] **Create useHistory.ts**

```ts
// apps/ios/hooks/useHistory.ts
import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const HISTORY_KEY = '@samur/history'
const MAX_HISTORY = 50

export function useHistory() {
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then(v => {
      if (v) setHistory(JSON.parse(v))
    })
  }, [])

  const push = useCallback(async (id: string) => {
    setHistory(prev => {
      const next = [id, ...prev.filter(h => h !== id)].slice(0, MAX_HISTORY)
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const clear = useCallback(async () => {
    setHistory([])
    await AsyncStorage.removeItem(HISTORY_KEY)
  }, [])

  return { history, push, clear }
}
```

- [ ] **Commit**

```bash
git add apps/ios/hooks/useFavorites.ts apps/ios/hooks/useHistory.ts
git commit -m "feat(ios): useFavorites and useHistory with AsyncStorage + haptics"
```

---

## Phase 3 — iOS Tab Screens

### Task 11: Manual tab — Procedure list

**Files:**
- Create: `apps/ios/app/(tabs)/manual/_layout.tsx`
- Create: `apps/ios/app/(tabs)/manual/index.tsx`
- Create: `apps/ios/components/manual/ProcedureRow.tsx`

- [ ] **Create Stack layout for Manual tab**

```tsx
// apps/ios/app/(tabs)/manual/_layout.tsx
import { Stack } from 'expo-router'
import { colors } from '@samur/core'

export default function ManualLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.sidebar },
        headerTintColor: '#F1F5F9',
        headerTitleStyle: { fontFamily: 'IBMPlexMono_400Regular', fontSize: 13 },
        contentStyle: { backgroundColor: colors.sidebar },
      }}
    />
  )
}
```

- [ ] **Create ProcedureRow.tsx**

```tsx
// apps/ios/components/manual/ProcedureRow.tsx
import { TouchableOpacity, View, Text, StyleSheet, useColorScheme } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { darkTheme, lightTheme } from '@samur/core'
import type { Procedure } from '@samur/core'

interface Props {
  procedure: Procedure
  onPress: () => void
}

const SECTION_COLORS: Record<string, string> = {
  'Circulación': '#D71920',
  'Airway': '#0057B8',
  'Trauma': '#F97316',
  'Neurológico': '#8B5CF6',
  'Pediátrico': '#10B981',
}

export function ProcedureRow({ procedure, onPress }: Props) {
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? darkTheme : lightTheme
  const dotColor = SECTION_COLORS[procedure.section] ?? '#64748B'

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <View style={styles.content}>
        <Text style={[styles.id, { color: theme.textSecondary }]}>{procedure.id}</Text>
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={2}>
          {procedure.title}
        </Text>
      </View>
      <ChevronRight size={16} color={theme.textSecondary} strokeWidth={1.5} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  content: { flex: 1, gap: 2 },
  id: { fontFamily: 'IBMPlexMono_400Regular', fontSize: 10, letterSpacing: 1 },
  title: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 17, lineHeight: 22 },
})
```

- [ ] **Create manual/index.tsx**

```tsx
// apps/ios/app/(tabs)/manual/index.tsx
import { SectionList, View, useColorScheme } from 'react-native'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { darkTheme, lightTheme } from '@samur/core'
import type { Procedure } from '@samur/core'
import { SearchBar } from '../../../components/shared/SearchBar'
import { SectionHeader } from '../../../components/shared/SectionHeader'
import { ProcedureRow } from '../../../components/manual/ProcedureRow'
import { ThemedView } from '../../../components/shared/ThemedView'
import { useProcedureSearch } from '../../../hooks/useSearch'

// Import procedures from @samur/content
// The data loading function reads Markdown files bundled in packages/content/
import { getProcedures } from '@samur/content'

const ALL_PROCEDURES: Procedure[] = getProcedures()

export default function ManualScreen() {
  const router = useRouter()
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? darkTheme : lightTheme
  const { query, setQuery, results } = useProcedureSearch(ALL_PROCEDURES)

  const sections = useMemo(() => {
    const grouped: Record<string, Procedure[]> = {}
    for (const p of results) {
      if (!grouped[p.section]) grouped[p.section] = []
      grouped[p.section].push(p)
    }
    return Object.entries(grouped).map(([title, data]) => ({ title, data }))
  }, [results])

  return (
    <ThemedView>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <SectionHeader code="// procedimientos · referencia operativa" title="Manual SAMUR" />
        <SearchBar
          placeholder="Buscar procedimiento..."
          value={query}
          onChangeText={setQuery}
        />
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ProcedureRow
              procedure={item}
              onPress={() => router.push(`/manual/${item.id}`)}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 }}>
            </View>
          )}
          stickySectionHeadersEnabled={false}
        />
      </SafeAreaView>
    </ThemedView>
  )
}
```

> **Note:** `getProcedures()` needs to be implemented in `packages/content/index.ts`. It reads the Markdown files and returns `Procedure[]` using `@samur/core`'s `extractTitle` and `normalizeProcedureLinks`. See the note below Task 12 for implementation guidance.

- [ ] **Run on simulator and verify**

```bash
cd apps/ios && npx expo start --ios
```
Expected: Manual tab shows a searchable list of procedures grouped by section with colored dots.

- [ ] **Commit**

```bash
git add apps/ios/app/\(tabs\)/manual/ apps/ios/components/manual/
git commit -m "feat(ios): Manual tab with procedure list and search"
```

---

### Task 12: Manual tab — Procedure detail with Markdown

**Files:**
- Create: `apps/ios/app/(tabs)/manual/[id].tsx`
- Create: `apps/ios/components/manual/ProcedureMarkdown.tsx`
- Modify: `packages/content/index.ts` (add `getProcedures` and `getProcedureById`)

- [ ] **Add getProcedures and getProcedureById to @samur/content**

Open `packages/content/index.ts` and add:

```ts
import { extractTitle, normalizeProcedureLinks } from '@samur/core'
import type { Procedure } from '@samur/core'

// Require all procedure Markdown files statically (bundled at build time)
const procedureModules = {
  '103': require('./procedures/103.md'),
  '201': require('./procedures/201.md'),
  // ... add all procedure IDs
  // Generate this list by running: ls procedures/ | sed "s/.md//" | sort
}

function parseProcedure(id: string, raw: string): Procedure {
  const content = normalizeProcedureLinks(raw)
  return {
    id,
    slug: id,
    title: extractTitle(content),
    section: 'General',        // derive from ID prefix (1xx=Circulación, 2xx=Airway, etc.)
    sectionColor: '#64748B',
    content,
    relatedIds: [],
  }
}

let _procedures: Procedure[] | null = null

export function getProcedures(): Procedure[] {
  if (_procedures) return _procedures
  _procedures = Object.entries(procedureModules).map(([id, mod]) =>
    parseProcedure(id, mod.default ?? mod)
  )
  return _procedures
}

export function getProcedureById(id: string): Procedure | undefined {
  return getProcedures().find(p => p.id === id)
}
```

> **Section mapping by ID prefix:**
> - `1xx` → Circulación (`#D71920`)
> - `2xx` → Airway (`#0057B8`)
> - `3xx` → Trauma (`#F97316`)
> - `4xx` → Neurológico (`#8B5CF6`)
> - `5xx` → Pediátrico (`#10B981`)
> - Other → General (`#64748B`)

- [ ] **Create ProcedureMarkdown.tsx**

```tsx
// apps/ios/components/manual/ProcedureMarkdown.tsx
import Markdown from 'react-native-markdown-display'
import { useColorScheme, StyleSheet } from 'react-native'
import { darkTheme, lightTheme, colors } from '@samur/core'

interface Props { content: string }

export function ProcedureMarkdown({ content }: Props) {
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? darkTheme : lightTheme

  const mdStyles = StyleSheet.create({
    body: { backgroundColor: 'transparent', paddingHorizontal: 16 },
    heading1: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 26, color: theme.textPrimary, marginBottom: 12 },
    heading2: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 22, color: theme.textPrimary, marginTop: 24, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.border, paddingBottom: 6 },
    heading3: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 18, color: theme.textPrimary, marginTop: 16, marginBottom: 6 },
    paragraph: { fontFamily: 'System', fontSize: 15, lineHeight: 24, color: theme.textPrimary },
    code_inline: { fontFamily: 'IBMPlexMono_400Regular', fontSize: 13, color: colors.starBlue, backgroundColor: theme.surface },
    fence: { fontFamily: 'IBMPlexMono_400Regular', fontSize: 13, backgroundColor: theme.surface, borderRadius: 8, padding: 12 },
    table: { borderWidth: 1, borderColor: theme.border, borderRadius: 8 },
    th: { fontFamily: 'IBMPlexMono_500Medium', fontSize: 11, backgroundColor: colors.starBlue, color: '#FFFFFF', padding: 8 },
    td: { fontFamily: 'System', fontSize: 14, padding: 8, borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
    bullet_list_icon: { color: colors.ambulanceYellow },
    ordered_list_icon: { fontFamily: 'IBMPlexMono_600SemiBold', color: colors.starBlue },
  })

  return <Markdown style={mdStyles}>{content}</Markdown>
}
```

- [ ] **Create manual/[id].tsx**

```tsx
// apps/ios/app/(tabs)/manual/[id].tsx
import { ScrollView, View, Text, TouchableOpacity, useColorScheme, StyleSheet } from 'react-native'
import { useLocalSearchParams, useNavigation } from 'expo-router'
import { useEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Heart } from 'lucide-react-native'
import { darkTheme, lightTheme, colors } from '@samur/core'
import { getProcedureById } from '@samur/content'
import { ProcedureMarkdown } from '../../../components/manual/ProcedureMarkdown'
import { ThemedView } from '../../../components/shared/ThemedView'
import { useFavorites } from '../../../hooks/useFavorites'
import { useHistory } from '../../../hooks/useHistory'

export default function ProcedureDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const navigation = useNavigation()
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? darkTheme : lightTheme
  const { isFavorite, toggle } = useFavorites()
  const { push } = useHistory()

  const procedure = getProcedureById(id)

  useEffect(() => {
    if (!procedure) return
    navigation.setOptions({
      title: procedure.id,
      headerRight: () => (
        <TouchableOpacity onPress={() => toggle(procedure.id)} style={{ marginRight: 16 }}>
          <Heart
            size={20}
            color={isFavorite(procedure.id) ? colors.samurRed : theme.textSecondary}
            fill={isFavorite(procedure.id) ? colors.samurRed : 'none'}
            strokeWidth={1.5}
          />
        </TouchableOpacity>
      ),
    })
    push(procedure.id)
  }, [procedure, isFavorite])

  if (!procedure) {
    return (
      <ThemedView style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.textSecondary, fontFamily: 'IBMPlexMono_400Regular' }}>
          Procedimiento no encontrado
        </Text>
      </ThemedView>
    )
  }

  return (
    <ThemedView>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <ProcedureMarkdown content={procedure.content} />
        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  )
}
```

- [ ] **Run and verify**

```bash
cd apps/ios && npx expo start --ios
```
Tap a procedure in the list. It should push a detail screen with rendered Markdown, a heart icon in the header for favorites, and swipe-back gesture working.

- [ ] **Commit**

```bash
git add apps/ios/app/\(tabs\)/manual/\[id\].tsx apps/ios/components/manual/ProcedureMarkdown.tsx packages/content/index.ts
git commit -m "feat(ios): procedure detail with Markdown render, favorites, history"
```

---

### Task 13: Vademécum tab

**Files:**
- Create: `apps/ios/app/(tabs)/vademecum/_layout.tsx`
- Create: `apps/ios/app/(tabs)/vademecum/index.tsx`
- Create: `apps/ios/app/(tabs)/vademecum/[id].tsx`
- Create: `apps/ios/components/vademecum/DrugCard.tsx`

- [ ] **Create vademecum/_layout.tsx**

```tsx
// Same pattern as manual/_layout.tsx — copy and adjust title style
import { Stack } from 'expo-router'
import { colors } from '@samur/core'

export default function VademecumLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.sidebar },
        headerTintColor: '#F1F5F9',
        headerTitleStyle: { fontFamily: 'IBMPlexMono_400Regular', fontSize: 13 },
        contentStyle: { backgroundColor: colors.sidebar },
      }}
    />
  )
}
```

- [ ] **Create DrugCard.tsx**

```tsx
// apps/ios/components/vademecum/DrugCard.tsx
import { TouchableOpacity, View, Text, StyleSheet, useColorScheme } from 'react-native'
import { darkTheme, lightTheme } from '@samur/core'
import type { Drug } from '@samur/core'

const CATEGORY_COLOR: Record<string, string> = {
  cardiovascular: '#0057B8',
  cardíaco: '#0057B8',
  'antiarrítmico': '#0057B8',
  crítico: '#D71920',
  emergencia: '#D71920',
  anafilaxia: '#D71920',
  vasoactivo: '#D71920',
  analgesia: '#8B5CF6',
  sedación: '#8B5CF6',
  broncodilatador: '#06B6D4',
  respiratorio: '#06B6D4',
  anticonvulsivante: '#F97316',
  neurológico: '#F97316',
}

function getDrugColor(drug: Drug): string {
  const key = (drug.categoria ?? drug.grupo ?? '').toLowerCase()
  for (const [k, c] of Object.entries(CATEGORY_COLOR)) {
    if (key.includes(k)) return c
  }
  return '#10B981'
}

interface Props { drug: Drug; onPress: () => void }

export function DrugCard({ drug, onPress }: Props) {
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? darkTheme : lightTheme
  const color = getDrugColor(drug)

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: color + '40', backgroundColor: color + '0D' }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.accentBar, { backgroundColor: color }]} />
      <View style={styles.header}>
        <Text style={[styles.category, { color: color + 'AA' }]}>
          {(drug.categoria ?? drug.grupo ?? 'Fármaco').toUpperCase()}
        </Text>
        {drug.via && (
          <Text style={[styles.badge, { color: color + 'AA', borderColor: color + '40' }]}>
            {drug.via.toUpperCase()}
          </Text>
        )}
      </View>
      <Text style={[styles.name, { color: theme.textPrimary }]}>{drug.nombre}</Text>
      {drug.indicacion && (
        <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>
          {drug.indicacion}
        </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 6, overflow: 'hidden' },
  accentBar: { position: 'absolute', top: 0, left: 14, right: 14, height: 1, opacity: 0.5 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: { fontFamily: 'IBMPlexMono_400Regular', fontSize: 9, letterSpacing: 1.2 },
  badge: { fontFamily: 'IBMPlexMono_400Regular', fontSize: 9, letterSpacing: 1, borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  name: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 17, lineHeight: 22 },
  description: { fontFamily: 'IBMPlexMono_400Regular', fontSize: 11, lineHeight: 16 },
})
```

- [ ] **Create vademecum/index.tsx**

```tsx
// apps/ios/app/(tabs)/vademecum/index.tsx
import { FlatList, useColorScheme } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { darkTheme, lightTheme } from '@samur/core'
import { vademecumData } from '@samur/content'
import type { Drug } from '@samur/core'
import { SearchBar } from '../../../components/shared/SearchBar'
import { SectionHeader } from '../../../components/shared/SectionHeader'
import { DrugCard } from '../../../components/vademecum/DrugCard'
import { ThemedView } from '../../../components/shared/ThemedView'
import { useDrugSearch } from '../../../hooks/useSearch'

const ALL_DRUGS = vademecumData as Drug[]

export default function VademecumScreen() {
  const router = useRouter()
  const { query, setQuery, results } = useDrugSearch(ALL_DRUGS)

  return (
    <ThemedView>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <SectionHeader code="// vademécum · referencia farmacológica" title="Vademécum" />
        <SearchBar placeholder="Buscar fármaco..." value={query} onChangeText={setQuery} />
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <DrugCard drug={item} onPress={() => router.push(`/vademecum/${item.id}`)} />
          )}
          contentContainerStyle={{ padding: 16, gap: 10 }}
        />
      </SafeAreaView>
    </ThemedView>
  )
}
```

- [ ] **Create vademecum/[id].tsx** (drug detail — basic implementation)

```tsx
// apps/ios/app/(tabs)/vademecum/[id].tsx
import { ScrollView, View, Text, StyleSheet, useColorScheme } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { darkTheme, lightTheme } from '@samur/core'
import { vademecumData } from '@samur/content'
import type { Drug } from '@samur/core'
import { ThemedView } from '../../../components/shared/ThemedView'

const ALL_DRUGS = vademecumData as Drug[]

export default function DrugDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? darkTheme : lightTheme
  const drug = ALL_DRUGS.find(d => d.id === id)

  if (!drug) return null

  const Row = ({ label, value }: { label: string; value?: string }) =>
    value ? (
      <View style={[styles.row, { borderBottomColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
        <Text style={[styles.value, { color: theme.textPrimary }]}>{value}</Text>
      </View>
    ) : null

  return (
    <ThemedView>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={{ padding: 16, paddingTop: 20 }}>
          <Text style={[styles.name, { color: theme.textPrimary }]}>{drug.nombre}</Text>
          <Row label="CATEGORÍA" value={drug.categoria ?? drug.grupo} />
          <Row label="VÍA" value={drug.via} />
          <Row label="INDICACIÓN" value={drug.indicacion} />
          <Row label="DOSIS" value={drug.dosis} />
          <Row label="PRESENTACIÓN" value={drug.presentacion} />
        </View>
      </ScrollView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  name: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 26, marginBottom: 20 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  label: { fontFamily: 'IBMPlexMono_400Regular', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  value: { fontFamily: 'System', fontSize: 15, lineHeight: 22 },
})
```

- [ ] **Commit**

```bash
git add apps/ios/app/\(tabs\)/vademecum/ apps/ios/components/vademecum/
git commit -m "feat(ios): Vademécum tab with drug list, search, and detail screen"
```

---

### Task 14: Códigos tab

**Files:**
- Create: `apps/ios/app/(tabs)/codigos/index.tsx`
- Create: `apps/ios/components/codigos/CodesTable.tsx`

- [ ] **Create CodesTable.tsx**

```tsx
// apps/ios/components/codigos/CodesTable.tsx
import { View, Text, FlatList, StyleSheet, useColorScheme } from 'react-native'
import { darkTheme, lightTheme } from '@samur/core'
import type { Code } from '@samur/core'

interface Props { codes: Code[]; title: string }

export function CodesTable({ codes, title }: Props) {
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? darkTheme : lightTheme

  return (
    <View style={[styles.table, { borderColor: theme.border }]}>
      <View style={[styles.tableHeader, { backgroundColor: '#0057B8' }]}>
        <Text style={styles.headerText}>{title.toUpperCase()}</Text>
      </View>
      {codes.map((code, i) => (
        <View key={code.id} style={[
          styles.tableRow,
          { borderBottomColor: theme.border },
          i % 2 === 0 ? { backgroundColor: theme.surface } : {},
        ]}>
          <Text style={[styles.codeText, { color: '#DFFF00' }]}>{code.codigo}</Text>
          <Text style={[styles.descText, { color: theme.textPrimary }]}>{code.descripcion}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  table: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', marginBottom: 20 },
  tableHeader: { paddingHorizontal: 12, paddingVertical: 8 },
  headerText: { fontFamily: 'IBMPlexMono_500Medium', fontSize: 11, color: '#FFFFFF', letterSpacing: 1 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start' },
  codeText: { fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 13, width: 60, flexShrink: 0 },
  descText: { fontFamily: 'System', fontSize: 14, flex: 1, lineHeight: 20 },
})
```

- [ ] **Create codigos/index.tsx**

```tsx
// apps/ios/app/(tabs)/codigos/index.tsx
import { ScrollView, useColorScheme } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { darkTheme, lightTheme } from '@samur/core'
// Import all code datasets from @samur/content
import codigosData from '@samur/content/data/codigos-svemsa.json'
import codigosSamu from '@samur/content/data/codigos-samu.json'
import type { Code } from '@samur/core'
import { SearchBar } from '../../../components/shared/SearchBar'
import { SectionHeader } from '../../../components/shared/SectionHeader'
import { CodesTable } from '../../../components/codigos/CodesTable'
import { ThemedView } from '../../../components/shared/ThemedView'
import { useCodeSearch } from '../../../hooks/useSearch'

const ALL_CODES = [...(codigosData as Code[]), ...(codigosSamu as Code[])]

export default function CodigosScreen() {
  const { query, setQuery, results } = useCodeSearch(ALL_CODES)

  return (
    <ThemedView>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <SectionHeader code="// códigos · indicativos operativos" title="Códigos" />
        <SearchBar placeholder="Buscar código..." value={query} onChangeText={setQuery} />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <CodesTable codes={results.filter(c => c.tipo === 'svemsa')} title="SVEMSA" />
          <CodesTable codes={results.filter(c => c.tipo === 'samu')} title="SAMU" />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  )
}
```

> **Note:** Check actual field names in `codigos-svemsa.json` and update the `Code` type import path accordingly.

- [ ] **Commit**

```bash
git add apps/ios/app/\(tabs\)/codigos/ apps/ios/components/codigos/
git commit -m "feat(ios): Códigos tab with searchable code tables"
```

---

### Task 15: Mapa tab — Apple Maps with hospital pins

**Files:**
- Create: `apps/ios/app/(tabs)/mapa/index.tsx`
- Create: `apps/ios/components/mapa/HospitalMap.tsx`

- [ ] **Create HospitalMap.tsx**

```tsx
// apps/ios/components/mapa/HospitalMap.tsx
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps'
import { StyleSheet, useColorScheme, View, Text } from 'react-native'
import { darkTheme, colors } from '@samur/core'
import type { Hospital } from '@samur/core'

interface Props { hospitals: Hospital[] }

const MADRID_CENTER = { latitude: 40.4168, longitude: -3.7038 }

export function HospitalMap({ hospitals }: Props) {
  const scheme = useColorScheme()

  return (
    <MapView
      style={styles.map}
      provider={PROVIDER_DEFAULT}  // Apple Maps on iOS
      userInterfaceStyle={scheme === 'dark' ? 'dark' : 'light'}
      initialRegion={{
        ...MADRID_CENTER,
        latitudeDelta: 0.15,
        longitudeDelta: 0.15,
      }}
      showsUserLocation
      showsCompass
    >
      {hospitals.map(h => (
        <Marker
          key={h.id}
          coordinate={{ latitude: h.lat, longitude: h.lng }}
          title={h.nombre}
          description={h.tipo}
          pinColor={h.tipo === 'hospital' ? colors.samurRed : colors.starBlue}
        />
      ))}
    </MapView>
  )
}

const styles = StyleSheet.create({
  map: { flex: 1 },
})
```

- [ ] **Create mapa/index.tsx**

```tsx
// apps/ios/app/(tabs)/mapa/index.tsx
import { View, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { hospitalsData } from '@samur/content'
import type { Hospital } from '@samur/core'
import { HospitalMap } from '../../../components/mapa/HospitalMap'

export default function MapaScreen() {
  return (
    <View style={styles.container}>
      <HospitalMap hospitals={hospitalsData as Hospital[]} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
})
```

- [ ] **Add NSLocationWhenInUseUsageDescription to app.json**

```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.samur.manual",
  "infoPlist": {
    "NSLocationWhenInUseUsageDescription": "Para mostrar tu ubicación en el mapa de hospitales y bases SAMUR."
  }
}
```

- [ ] **Run and verify on simulator**

```bash
cd apps/ios && npx expo run:ios
```
Expected: Mapa tab shows Apple Maps centered on Madrid with hospital pins (red for hospitals, blue for SAMUR bases).

- [ ] **Commit**

```bash
git add apps/ios/app/\(tabs\)/mapa/ apps/ios/components/mapa/ apps/ios/app.json
git commit -m "feat(ios): Mapa tab with Apple Maps and hospital/base pins"
```

---

### Task 16: Abreviaturas modal (accessible from Manual tab)

**Files:**
- Create: `apps/ios/app/abreviaturas.tsx`
- Modify: `apps/ios/app/(tabs)/manual/_layout.tsx`

- [ ] **Add abreviaturas data export to @samur/content**

Open `packages/content/index.ts`. Add:
```ts
export { default as abreviaturasData } from './data/abreviaturas.json'
```
(Verify the file exists at `packages/content/data/abreviaturas.json`. If it's named differently, adjust.)

- [ ] **Create apps/ios/app/abreviaturas.tsx**

```tsx
// apps/ios/app/abreviaturas.tsx
import { FlatList, View, Text, StyleSheet, useColorScheme } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack } from 'expo-router'
import { darkTheme, lightTheme } from '@samur/core'
import { abreviaturasData } from '@samur/content'
import { SearchBar } from '../components/shared/SearchBar'
import { ThemedView } from '../components/shared/ThemedView'
import { useState, useMemo } from 'react'

interface Abreviatura { abreviatura: string; significado: string }
const ALL = abreviaturasData as Abreviatura[]

export default function AbreviaturasModal() {
  const [query, setQuery] = useState('')
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? darkTheme : lightTheme

  const results = useMemo(
    () => query.length < 1
      ? ALL
      : ALL.filter(a =>
          a.abreviatura.toLowerCase().includes(query.toLowerCase()) ||
          a.significado.toLowerCase().includes(query.toLowerCase())
        ),
    [query]
  )

  return (
    <ThemedView>
      <Stack.Screen options={{ title: 'Abreviaturas', presentation: 'modal' }} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <SearchBar placeholder="Buscar abreviatura..." value={query} onChangeText={setQuery} />
        <FlatList
          data={results}
          keyExtractor={item => item.abreviatura}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderBottomColor: theme.border }]}>
              <Text style={[styles.abbr, { color: '#DFFF00' }]}>{item.abreviatura}</Text>
              <Text style={[styles.meaning, { color: theme.textPrimary }]}>{item.significado}</Text>
            </View>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12, alignItems: 'center' },
  abbr: { fontFamily: 'IBMPlexMono_600SemiBold', fontSize: 13, width: 70, flexShrink: 0 },
  meaning: { fontFamily: 'System', fontSize: 14, flex: 1, lineHeight: 20 },
})
```

- [ ] **Add info button to Manual tab header**

In `apps/ios/app/(tabs)/manual/_layout.tsx`, update the Stack `screenOptions` for the index route to include a header button:

```tsx
import { TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { Info } from 'lucide-react-native'

// Inside the Stack component, add a Screen for the index:
<Stack.Screen
  name="index"
  options={{
    title: 'Manual SAMUR',
    headerRight: () => {
      const router = useRouter()
      return (
        <TouchableOpacity onPress={() => router.push('/abreviaturas')} style={{ marginRight: 16 }}>
          <Info size={20} color="#8CA0B8" strokeWidth={1.5} />
        </TouchableOpacity>
      )
    },
  }}
/>
```

- [ ] **Verify modal opens and is searchable**

```bash
cd apps/ios && npx expo start --ios
```
Tap the ⓘ icon in the Manual tab header. A modal should slide up with the abbreviations list and a search bar.

- [ ] **Commit**

```bash
git add apps/ios/app/abreviaturas.tsx apps/ios/app/\(tabs\)/manual/_layout.tsx
git commit -m "feat(ios): Abreviaturas modal accessible from Manual tab header"
```

---

## Final Verification

- [ ] `pnpm dev:web` — web app works identically at `http://localhost:3000`
- [ ] `cd apps/ios && npx expo start --ios` — Expo app opens in simulator
- [ ] All 4 tabs navigate (Manual, Códigos, Vademécum, Mapa)
- [ ] Search works on all 3 content tabs (offline — no network request fired)
- [ ] Procedure detail opens and renders Markdown
- [ ] Drug detail opens with correct data
- [ ] Favorites toggle works and persists across app restarts
- [ ] Mapa tab shows Apple Maps with hospital pins
- [ ] Dark mode: toggle system dark mode in simulator Settings; all tabs adapt
- [ ] Swipe-back gesture works on all detail screens
- [ ] Fonts render (Instrument Serif in headings, IBM Plex Mono in labels)
