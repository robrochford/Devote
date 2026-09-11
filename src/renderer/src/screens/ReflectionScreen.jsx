import React, { useState, useEffect, useRef } from 'react'
import { Sparkles, Loader2, Check, ArrowLeft } from 'lucide-react'
import * as platform from '../services/platform'

export default function ReflectionScreen({ isActive, apiKey, passageText, onNext, onBack }) {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Store the day number we last fetched for, not just a boolean.
  // This ensures a new set of questions is generated each calendar day,
  // even when the component stays mounted in the tray across midnight.
  const fetchedForDay = useRef(null)

  useEffect(() => {
    // If no AI key, bail — the JSX will show a friendly "add your key" message
    if (!apiKey) {
      setLoading(false)
      return
    }

    // Start generation as soon as we have passage text, even if not active yet.
    // This preloads the questions in the background while the user is reading.
    if (!passageText) return

    async function generateQuestions() {
      setLoading(true)
      try {
        const todayReading = await platform.getTodayReading()

        // Guard: only generate once per day, even across tray sleep cycles
        if (fetchedForDay.current === todayReading.day) {
          setLoading(false)
          return
        }

        // Use passage text passed from WordScreen — no second network call needed
        const text = passageText || todayReading.reference

        const prompt = `You are a thoughtful pastoral assistant. Read the following passage: ${text}. 

Generate exactly two deep, thought-provoking reflection questions focusing on personal application, spiritual growth, and deep contemplation based on this text. 

CRITICAL: Return ONLY the questions. No headers (like "# Questions"), no labels (like "Question 1:"), no introductory text, and no conversational filler. Just the two questions, one per line.`

        const textResponse = await platform.fetchAi({
          prompt: prompt,
          apiKey: apiKey
        })
        
        // Robust parsing: Filter out headers, labels, and empty lines, then strip numbering
        const qArray = textResponse.split('\n')
          .map(q => q.trim())
          .filter(q => {
            if (q.length < 5) return false
            if (q.startsWith('#')) return false // Skip markdown headers
            if (/^question\s*\d+\s*:?\s*$/i.test(q)) return false // Skip "Question 1:" solo labels
            return true
          })
          .map(q => q
            .replace(/\*\*/g, '') // Strip bold
            .replace(/^[\d\.\-\*\s]+/, '') // Strip leading numbers/bullets like "1. " or "* "
            .replace(/^Question\s*\d+\s*:?\s*/i, '') // Strip "Question 1: " prefix if embedded
            .trim()
          )
        setQuestions(qArray.slice(0, 2))

        // Record the day we fetched for so we don't re-fetch until tomorrow
        fetchedForDay.current = todayReading.day
        
      } catch (err) {
        console.error(err)
        let msg = err.message || 'Unknown error occurred'
        if (msg.includes('Error invoking remote method')) {
          msg = msg.split(':').slice(2).join(':').trim() // Strip "Error invoking remote method '...':"
        }
        setError(msg)
      }
      setLoading(false)
    }

    generateQuestions()
  }, [apiKey, passageText, isActive])

  return (
    <div className="flex-1 flex flex-col items-center p-5 sm:p-12 animate-slide-in-right relative h-full w-full overflow-hidden">
      
      <button 
        onClick={onBack}
        className="absolute top-4 left-4 sm:top-8 sm:left-8 p-2.5 sm:p-3 rounded-full bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700/80 transition-all z-10 flex"
        title="Go back to passage"
      >
        <ArrowLeft size={18} />
      </button>

      <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/5 rounded-full blur-[80px] pointer-events-none"></div>

      <div className="mb-3 sm:mb-6 p-2.5 sm:p-3 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 shrink-0 mt-4 sm:mt-8">
        <Sparkles className="text-gold-400" size={20} />
      </div>

      <h2 className="text-2xl sm:text-3xl font-serif text-white mb-1 sm:mb-2 shrink-0 text-center">Guided Reflection</h2>
      <p className="text-zinc-500 text-xs sm:text-sm mb-4 sm:mb-8 shrink-0 text-center px-4">Consider these questions as you prepare for the day ahead.</p>

      {!apiKey ? (
        <div className="flex flex-col items-center justify-center flex-1 space-y-4 mb-4 sm:mb-8 px-4">
          <p className="text-zinc-400 text-sm mb-2 max-w-sm text-center">To get personalised reflection questions based on today's reading, please add your AI API key in the settings panel (top left cog).</p>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center flex-1 space-y-4 mb-4 sm:mb-8">
          <Loader2 className="animate-spin text-gold-500 mb-2" size={32} />
          <p className="text-zinc-400 text-sm">Generating reflections...</p>
        </div>
      ) : error ? (
        <div className="text-red-400 mb-4 sm:mb-8 flex-1 flex items-center justify-center text-sm px-6 text-center">{error}</div>
      ) : (
        <div className="space-y-4 sm:space-y-6 max-w-2xl w-full flex-1 overflow-y-auto px-2 sm:px-4 mb-4 sm:mb-8 custom-scrollbar pt-2 pb-2">
          {questions.map((q, i) => (
            <div key={i} className="p-4 sm:p-6 rounded-2xl bg-zinc-900 border border-zinc-800 relative group transition-colors hover:border-gold-500/30 shrink-0">
              <span className="absolute -top-3 -left-2 sm:-left-3 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs sm:text-sm font-serif text-gold-500">
                {i + 1}
              </span>
              <p className="text-zinc-300 leading-relaxed text-base sm:text-lg pt-1">{q}</p>
            </div>
          ))}
        </div>
      )}

      <div className="shrink-0 pt-2 pb-2 w-full flex justify-center">
        <button 
          onClick={onNext}
          className="flex items-center justify-center gap-2 px-6 py-3 sm:px-8 sm:py-3.5 rounded-full bg-white text-black font-medium hover:bg-zinc-200 shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all text-sm sm:text-base active:scale-95"
        >
          <Check size={18} /> I have finished my devotion
        </button>
      </div>

    </div>
  )
}
