// Validates public/schedule.json and public/operators.json. Exits 1 on any problem.
// Run with: npm run validate:config   (deploy.sh runs this before building)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { validateConfig } from '../src/config/validate'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function load(file: string): unknown {
  const path = join(root, 'public', file)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    console.error(`✗ Could not read ${file}: ${(e as Error).message}`)
    process.exit(1)
  }
}

const errors = validateConfig(load('schedule.json'), load('operators.json'))
if (errors.length) {
  console.error(`✗ Config is invalid (${errors.length} problem${errors.length > 1 ? 's' : ''}):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log('✓ schedule.json and operators.json are valid')
