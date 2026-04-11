import React, { useState, useEffect, useRef } from 'react'
import { Sparkles, Loader2, Check, ArrowLeft } from 'lucide-react'

export default function ReflectionScreen({ isActive, apiKey, esvApiKey, onNext, onBack }) {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Store the day number we last fetched for, not just a boolean.
  // This ensures a new set of questions is generated each calendar day,
  // even when the component stays mounted in the tray across midnight.
  const fetchedForDay = useRef(null)

  useEffect(() => {
    // If no keys, bail — the JSX will show a friendly "add your key" message
    if (!apiKey || !esvApiKey) {
      setLoading(false)
      return
    }

    async function generateQuestions() {
      setLoading(true)
      try {
        const todayReading = await window.electron.ipcRenderer.invoke('get-today-reading')

        // Guard: only generate once per day, even across tray sleep cycles
        if (fetchedForDay.current === todayReading.day) return

        // Fetch passage text first (simplified for prompt)
        const passageTextData = await window.electron.ipcRenderer.invoke('fetch-esv', {
          url: `https://api.esv.org/v3/passage/text/?q=${encodeURIComponent(todayReading.reference)}&include-passage-references=false&include-footnotes=false&include-headings=false`,
          apiKey: esvApiKey
        })
        const text = passageTextData.passages[0]

        const prompt = `You are a thoughtful pastoral assistant. Read the following passage: ${text}. Generate exactly two deep, thought-provoking reflection questions focusing on personal application, spiritual growth, and deep contemplation based on this text. Do not include introductory text, just provide the two questions formatted clearly.`

        const textResponse = await window.electron.ipcRenderer.invoke('fetch-ai', {
          prompt: prompt
        })
        
        // Parse into array, stripping any markdown bullets or numbers like "1. " or "* "
        const qArray = textResponse.split('\n')
          .filter(q => q.trim().length > 5)
          .map(q => q.replace(/\*\*/g, '').replace(/^[\d\.\-\*\s]+/, '').trim())
        setQuestions(qArray.slice(0, 2))

        // Record the day we fetched for so we don't re-fetch until tomorrow
        fetchedForDay.current = todayReading.day
        
      } catch (err) {
        console.error(err)
        setError(`Error: ${err.message || 'Unknown error occurred'}`)
      }
      setLoading(false)
    }

    generateQuestions()
  }, [apiKey])

  return (
    <div className="flex-1 flex flex-col items-center p-12 animate-slide-in-right relative h-full overflow-hidden">
      
      <button 
        onClick={onBack}
        className="absolute top-8 left-8 p-3 rounded-full bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-all z-10 hidden sm:flex"
        title="Go back to passage"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/5 rounded-full blur-[80px] pointer-events-none"></div>

      <div className="mb-6 p-3 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 shrink-0 mt-8">
        <Sparkles className="text-gold-400" size={24} />
      </div>

      <h2 className="text-3xl font-serif text-white mb-2 shrink-0">Guided Reflection</h2>
      <p className="text-zinc-500 mb-8 shrink-0">Consider these questions as you prepare for the day ahead.</p>

      {!apiKey ? (
        <div className="flex flex-col items-center justify-center flex-1 space-y-4 mb-8">
          <p className="text-zinc-500 mb-2 max-w-sm text-center">To get personalised reflection questions based on today's reading, please add your AI API key in the settings panel (bottom left).</p>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center flex-1 space-y-4 mb-8">
          <Loader2 className="animate-spin text-gold-500 mb-2" size={32} />
          <p className="text-zinc-400 text-sm">Generating reflections...</p>
        </div>
      ) : error ? (
        <div className="text-red-400 mb-8 flex-1 flex items-center justify-center">{error}</div>
      ) : (
        <div className="space-y-6 max-w-2xl w-full flex-1 overflow-y-auto px-4 mb-8 [mask-image:linear-gradient(to_bottom,transparent,black_5%,black_95%,transparent)] pt-4 pb-4">
          {questions.map((q, i) => (
            <div key={i} className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 relative group transition-colors hover:border-gold-500/30 shrink-0">
              <span className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-serif text-gold-500">
                {i + 1}
              </span>
              <p className="text-zinc-300 leading-relaxed text-lg pt-2">{q}</p>
            </div>
          ))}
        </div>
      )}

      <button 
        onClick={onNext}
        className="shrink-0 flex items-center gap-2 px-8 py-3 rounded-full bg-white text-black hover:bg-zinc-200 shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all mb-4"
      >
        <Check size={18} /> I have finished my devotion
      </button>

    </div>
  )
}
