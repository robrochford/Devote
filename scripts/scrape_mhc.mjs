import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const plan = JSON.parse(fs.readFileSync(path.join(root, 'resources', 'reading_plan.json'), 'utf8'))
const jsonPath = path.join(root, 'resources', 'matthew_henry_concise.json')
const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))

const missing = []
const seen = new Set()
for (const p of plan) {
  const key = `${p.book} ${p.startChapter}`
  if (!existing[key] && !seen.has(key)) {
    missing.push({ key, book: p.book, chapter: p.startChapter })
    seen.add(key)
  }
}

console.log(`Need to scrape ${missing.length} entries...`)

const delay = ms => new Promise(r => setTimeout(r, ms))

async function scrapeBibleHub(book, chapter) {
  const formattedBook = book.toLowerCase().replace(/\s+/g, '_')
  const url = `https://biblehub.com/commentaries/mhc/${formattedBook}/${chapter}.htm`
  
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status}`)
  
  const html = await res.text()
  
  // BibleHub stores the commentary within: <div class="comm">...</div>
  // Chapters have multiple comm blocks (grouped by verses)
  const matches = [...html.matchAll(/class="comm">([\s\S]*?)<\/div>/ig)]
  if (!matches || matches.length === 0) throw new Error('Could not find text block')
  
  // Combine all commentary blocks for the chapter
  let text = matches.map(m => m[1]).join('\n\n')
  
  // Clean HTML
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<p[\s\S]*?>/gi, '\n\n')
  text = text.replace(/<[^>]*>?/gm, '') // Strip tags
  text = text.replace(/&#\d+;/g, "'") // Decode simple entities
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/\n\s*\n/g, '\n\n') // Collapse newlines
  
  return text.trim()
}

let completed = 0

for (const { key, book, chapter } of missing) {
  if (existing[key]) continue

  try {
    const text = await scrapeBibleHub(book, chapter)
    existing[key] = text
    fs.writeFileSync(jsonPath, JSON.stringify(existing, null, 2))
    completed++
    console.log(`[${completed}/${missing.length}] ✓ Scraped ${key}`)
  } catch (e) {
    console.error(`[${completed}/${missing.length}] ✗ Failed ${key}: ${e.message}`)
  }
  
  await delay(200) // 5 reqs per second is very polite
}

console.log('\nFinished scraping!')
