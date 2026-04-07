import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

// Load config
const configPath = path.join(process.env.APPDATA, 'devote', 'config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const GEMINI_KEY = config.geminiApiKey
if (!GEMINI_KEY) { console.error('No Gemini API key in store'); process.exit(1) }

const plan = JSON.parse(fs.readFileSync(path.join(root, 'resources', 'reading_plan.json'), 'utf8'))
const commentaryPath = path.join(root, 'resources', 'matthew_henry_concise.json')

function loadCommentary() {
  return JSON.parse(fs.readFileSync(commentaryPath, 'utf8'))
}

// Build list of missing unique keys (re-reads each time so restarts are safe)
function getMissing(existing) {
  const missing = []
  const seen = new Set()
  for (const p of plan) {
    const key = `${p.book} ${p.startChapter}`
    if (!existing[key] && !seen.has(key)) {
      missing.push({ key, reference: p.reference })
      seen.add(key)
    }
  }
  return missing
}

async function generateCommentary(reference) {
  const prompt = `You are Matthew Henry writing your Concise Commentary. Write a focused 2-paragraph pastoral and theological commentary on ${reference}. Be reverential, scripturally grounded, and practically edifying. Write in the style of 17th-century puritan English but remain understandable to a modern reader. Do not add a title or heading, just begin the commentary text directly.`
  
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  })
  
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API ${res.status}: ${err.slice(0, 200)}`)
  }
  
  const data = await res.json()
  return data.candidates[0].content.parts[0].text
}

const delay = ms => new Promise(r => setTimeout(r, ms))

let existing = loadCommentary()
let missing = getMissing(existing)
const total = missing.length
let completed = 0
let failed = 0

console.log(`\n📖 Devote Commentary Generator`)
console.log(`   Found ${total} missing commentaries to generate`)
console.log(`   Rate: 1 per 13s (safe under 5/min free tier)\n`)

for (const { key, reference } of missing) {
  // Re-read in case of parallel run or restart
  existing = loadCommentary()
  if (existing[key]) {
    completed++
    continue // Already generated, skip
  }

  try {
    const text = await generateCommentary(reference)
    existing[key] = text
    fs.writeFileSync(commentaryPath, JSON.stringify(existing, null, 2))
    completed++
    const pct = Math.round(((completed + failed) / total) * 100)
    process.stdout.write(`\r  ✓ [${pct}%] ${completed}/${total} - ${key}                    `)
    if (completed + failed < total) await delay(13000)
  } catch (e) {
    if (e.message.includes('API 429') || e.message.includes('quota')) {
      console.log(`\n  ⚠️ Rate limit hit. Cooling down for 65 seconds before retrying ${key}...`)
      await delay(65000) // Respect the retryDelay block
      // Note: This pushes the key back onto the end of the line if we wanted to be perfectly robust, 
      // but since we aren't iterating through a mutated array, we will just count it as failed for this run, 
      // and let the restart script pick it up later if needed. Actually let's just let it fail this pass, 
      // the block will allow subsequent items to succeed.
    }
    failed++
    console.error(`\n  ✗ Failed: ${key} — ${e.message.slice(0, 100)}`)
  }
}

console.log(`\n\n✅ Done! Generated ${completed} commentaries. ${failed > 0 ? failed + ' failed.' : ''}`)
console.log(`📁 Saved to: ${commentaryPath}`)
