import fs from 'fs'
import path from 'path'
import archiver from 'archiver'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

const SNAPSHOTS_DIR = path.join(ROOT_DIR, '.snapshots')
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR)
}

const now = new Date()
// Format: YYYY-MM-DD_HH-mm-ss
const timestamp = now.getFullYear() +
  '-' + String(now.getMonth() + 1).padStart(2, '0') +
  '-' + String(now.getDate()).padStart(2, '0') +
  '_' + String(now.getHours()).padStart(2, '0') +
  '-' + String(now.getMinutes()).padStart(2, '0') +
  '-' + String(now.getSeconds()).padStart(2, '0')

const outputFileName = `devote_src_snapshot_${timestamp}.zip`
const outputPath = path.join(SNAPSHOTS_DIR, outputFileName)

const output = fs.createWriteStream(outputPath)
const archive = archiver('zip', {
  zlib: { level: 9 } // Maximum compression
})

output.on('close', function() {
  console.log(`\n✅ Snapshot created successfully!`)
  console.log(`📁 File: .snapshots/${outputFileName}`)
  console.log(`📊 Size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`)

  // Rotation logic: Limit to 20 snapshots
  try {
    const files = fs.readdirSync(SNAPSHOTS_DIR)
      .filter(f => f.endsWith('.zip'))
      .map(f => ({
        name: f,
        path: path.join(SNAPSHOTS_DIR, f),
        time: fs.statSync(path.join(SNAPSHOTS_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => a.time - b.time)

    if (files.length > 20) {
      const toDeleteCount = files.length - 20
      console.log(`\n🧹 Rotation Policy: Keeping latest 20 snapshots.`)
      for (let i = 0; i < toDeleteCount; i++) {
        fs.unlinkSync(files[i].path)
        console.log(`🗑️ Removed oldest snapshot: ${files[i].name}`)
      }
    }
  } catch (err) {
    console.error('Snapshot rotation failed:', err)
  }
})

archive.on('error', function(err) {
  throw err
})

archive.pipe(output)

console.log('Creating codebase snapshot...')
// Add the entire root directory, but ignore specific folders
archive.glob('**/*', {
  cwd: ROOT_DIR,
  ignore: [
    'node_modules/**',
    '.git/**',
    '.snapshots/**',
    'out/**',
    'dist/**',
    'build/**',
    'tmp/**',
    '*.zip'
  ],
  dot: true // Include hidden files like .env and .gitignore
})

archive.finalize()
