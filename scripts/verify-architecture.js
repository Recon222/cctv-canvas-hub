#!/usr/bin/env node

/**
 * Verifies feature-based architecture rules are being followed.
 *
 * Checks:
 * 1. All frontend features have barrel exports (index.ts)
 * 2. No invoke() calls in feature components
 * 3. All Rust features have mod.rs
 * 4. No deep feature imports in non-feature code
 *
 * Usage: node scripts/verify-architecture.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..')

const errors = []
const warnings = []

// --- Helpers ---

function getDirectories(dirPath) {
  if (!fs.existsSync(dirPath)) return []
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
}

function getFilesRecursive(dirPath, extensions) {
  const results = []
  if (!fs.existsSync(dirPath)) return results

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath)
      }
    }
  }

  walk(dirPath)
  return results
}

// --- Check 1: All frontend features have barrel exports ---

console.log('Checking frontend feature barrel exports...')
const featuresDir = path.join(ROOT, 'src', 'features')
const features = getDirectories(featuresDir)

for (const feature of features) {
  const indexPath = path.join(featuresDir, feature, 'index.ts')
  if (!fs.existsSync(indexPath)) {
    errors.push(`Missing barrel export: src/features/${feature}/index.ts`)
  }
}

// --- Check 2: No invoke() calls in feature components ---

console.log('Checking for direct invoke() calls in components...')
for (const feature of features) {
  const componentsDir = path.join(featuresDir, feature, 'components')
  const componentFiles = getFilesRecursive(componentsDir, ['.ts', '.tsx'])

  for (const file of componentFiles) {
    const content = fs.readFileSync(file, 'utf8')
    const relativePath = path.relative(ROOT, file)

    if (content.includes('invoke(')) {
      errors.push(`Direct invoke() call in component: ${relativePath}`)
    }

    // Also check for direct commands.* imports (should use service layer)
    if (
      content.includes("from '@/lib/tauri-bindings'") ||
      content.includes("from '@/lib/bindings'")
    ) {
      warnings.push(
        `Direct tauri-bindings import in component: ${relativePath} (should use service layer)`
      )
    }
  }
}

// --- Check 3: All Rust features have mod.rs ---

console.log('Checking Rust feature modules...')
const rustFeaturesDir = path.join(ROOT, 'src-tauri', 'src', 'features')
const rustFeatures = getDirectories(rustFeaturesDir)

for (const feature of rustFeatures) {
  const modPath = path.join(rustFeaturesDir, feature, 'mod.rs')
  if (!fs.existsSync(modPath)) {
    errors.push(
      `Missing Rust module file: src-tauri/src/features/${feature}/mod.rs`
    )
  }
}

// --- Check 4: No deep feature imports in shared code ---

console.log('Checking for deep feature imports...')
const sharedDirs = [
  path.join(ROOT, 'src', 'components'),
  path.join(ROOT, 'src', 'lib'),
  path.join(ROOT, 'src', 'hooks'),
  path.join(ROOT, 'src', 'store'),
]

const deepImportPattern =
  /from\s+['"]@\/features\/[^'"]+\/(components|hooks|services|store|types|utils)\//

for (const dir of sharedDirs) {
  const files = getFilesRecursive(dir, ['.ts', '.tsx'])
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    const relativePath = path.relative(ROOT, file)

    if (deepImportPattern.test(content)) {
      warnings.push(`Deep feature import in shared code: ${relativePath}`)
    }
  }
}

// --- Report ---

console.log('')

if (warnings.length > 0) {
  console.warn(`\u26A0\uFE0F  ${warnings.length} warning(s):`)
  warnings.forEach(w => console.warn(`  - ${w}`))
  console.log('')
}

if (errors.length > 0) {
  console.error(`\u274C ${errors.length} architecture violation(s) found:`)
  errors.forEach(err => console.error(`  - ${err}`))
  process.exit(1)
} else {
  console.log(
    `\u2705 Architecture verification passed (${features.length} frontend features, ${rustFeatures.length} Rust features)`
  )
}
