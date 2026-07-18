#!/usr/bin/env node

/**
 * Migration helper to move components into feature-based structure.
 *
 * This script handles FILE MOVES ONLY.
 * Import path updates are MANUAL via IDE find-and-replace.
 *
 * Why manual imports?
 * - First migration is small (~20-30 imports)
 * - Forces review of every connection
 * - IDE refactoring tools handle this well
 * - Avoids debugging complex AST rewriting
 *
 * Usage:
 *   node scripts/migrate-to-features.js <feature-name> <component-paths...>
 *
 * Example:
 *   node scripts/migrate-to-features.js my-feature src/components/MyComponent.tsx
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..')

const featureName = process.argv[2]
const componentPaths = process.argv.slice(3)

if (!featureName || componentPaths.length === 0) {
  console.error(
    'Usage: node scripts/migrate-to-features.js <feature-name> <component-paths...>'
  )
  console.error(
    '\nExample: node scripts/migrate-to-features.js my-feature src/components/MyComponent.tsx'
  )
  console.error(
    '\nNote: This script moves files only. Update imports manually using IDE refactoring.'
  )
  process.exit(1)
}

const featureDir = path.join(ROOT, 'src', 'features', featureName)
const componentsDir = path.join(featureDir, 'components')
const servicesDir = path.join(featureDir, 'services')
const hooksDir = path.join(featureDir, 'hooks')
const typesDir = path.join(featureDir, 'types')

// Create feature directory structure
const dirs = [featureDir, componentsDir, servicesDir, hooksDir, typesDir]
for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    console.log(`Created: ${path.relative(ROOT, dir)}/`)
  }
}

// Move component files
const movedFiles = []
for (const componentPath of componentPaths) {
  const fullPath = path.resolve(ROOT, componentPath)
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${componentPath}`)
    continue
  }

  const fileName = path.basename(fullPath)
  const targetPath = path.join(componentsDir, fileName)

  fs.copyFileSync(fullPath, targetPath)
  movedFiles.push(path.basename(fileName, path.extname(fileName)))
  console.log(`Copied: ${componentPath} -> ${path.relative(ROOT, targetPath)}`)
}

// Create barrel export
const indexPath = path.join(featureDir, 'index.ts')
if (!fs.existsSync(indexPath)) {
  const exports = movedFiles
    .map(name => `export { default as ${name} } from './components/${name}'`)
    .join('\n')

  const content = `/**\n * ${featureName} Feature - Public API\n *\n * Outside code MUST import from this file, never from internal paths.\n */\n\n${exports}\n`
  fs.writeFileSync(indexPath, content)
  console.log(`Created barrel export: ${path.relative(ROOT, indexPath)}`)
}

// Create placeholder service
const servicePath = path.join(
  servicesDir,
  `${featureName.replace(/-/g, '')}Service.ts`
)
if (!fs.existsSync(servicePath)) {
  const content = `/**\n * ${featureName} Service - Plain Exported Async Functions\n *\n * Owns ALL Tauri IPC calls for this feature.\n * Components/hooks NEVER call Tauri commands directly.\n */\n\nimport { commands } from '@/lib/tauri-bindings'\nimport { logger } from '@/lib/logger'\n\n// Add service functions here\n`
  fs.writeFileSync(servicePath, content)
  console.log(`Created service template: ${path.relative(ROOT, servicePath)}`)
}

// Create placeholder types
const typesPath = path.join(typesDir, 'index.ts')
if (!fs.existsSync(typesPath)) {
  const content = `/**\n * ${featureName} Types\n */\n\n// Add feature-specific types here\n`
  fs.writeFileSync(typesPath, content)
  console.log(`Created types template: ${path.relative(ROOT, typesPath)}`)
}

console.log(`\nFile migration complete!`)
console.log(`\nNEXT STEPS (MANUAL):`)
console.log(`1. Update import paths across codebase:`)
console.log(`   OLD: import { X } from '@/components/...'`)
console.log(`   NEW: import { X } from '@/features/${featureName}'`)
console.log(`2. Use IDE "Find and Replace" or refactoring tools`)
console.log(`3. Delete old source files after confirming imports work`)
console.log(`4. Run 'npm run check:all' to verify`)
