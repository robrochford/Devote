import React, { useState, useEffect, useRef } from 'react'
import { Headphones, Book, ChevronRight, Loader2, X } from 'lucide-react'
import * as platform from '../services/platform'

export default function WordScreen({ settings, apiKey, aiApiKey, onNext, onPassageLoaded }) {
  const [passageHtml, setPassageHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [showCommentary, setShowCommentary] = useState(false)
  const [commentaryText, setCommentaryText] = useState('')
  const [todayReading, setTodayReading] = useState({ day: '', reference: '' })
  const [retryKey, setRetryKey] = useState(0) // Increment to re-run loadData without a full app reload
  const audioRef = useRef(null)

  useEffect(() => {
    async function loadData() {
      setError('')
      setLoading(true)
      
      try {
        // 1. Fetch the reading reference immediately regardless of API key
        // This ensures the header (Day 2, etc) is always correct
        const reading = await platform.getTodayReading()
        setTodayReading(reading)

        // 2. Use effective API key (fall back to settings or default key)
        const effectiveKey = apiKey || settings.esvApiKey || 'd49a24d6323c36fa875b320a42e2ef0c86476c4c'
        if (!effectiveKey) {
          return
        }

        // ESV specific fetch
        // CHECK CACHE FIRST: If we have today's reading pre-fetched, use it instantly!
        // Validate both day AND reference to guard against stale cache after a plan change.
        if (settings.cachedReading &&
            settings.cachedReading.day === reading.day &&
            settings.cachedReading.reference === reading.reference) {
          console.log('Using cached reading for Day', reading.day)
          const data = settings.cachedReading.data
          const html = data.passages[0]
          setPassageHtml(html)
          // Strip HTML so ReflectionScreen has clean text for AI prompt
          if (onPassageLoaded) onPassageLoaded(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
          const audio = await platform.getAudioUrl(reading.reference, effectiveKey)
          setAudioUrl(audio)
        } else {
          console.log('No cache found or day mismatch, fetching fresh...')
          const q = encodeURIComponent(reading.reference)
          const data = await platform.fetchEsv({
            url: `https://api.esv.org/v3/passage/html/?q=${q}&include-footnotes=false&include-audio-link=false&include-headings=true`,
            apiKey: effectiveKey
          })
          
          if (data && data.passages && data.passages.length > 0) {
            const html = data.passages[0]
            setPassageHtml(html)
            // Strip HTML so ReflectionScreen has clean text for AI prompt
            if (onPassageLoaded) onPassageLoaded(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
            const audio = await platform.getAudioUrl(reading.reference, effectiveKey)
            setAudioUrl(audio)
          } else {
            setError('The ESV API returned no passage content for this reference.')
          }
        }

        // Commentary Logic — check custom/AI-generated first, then bundled MHC
        const customStore = await platform.getCustomCommentaries()
        const commentaryKey = `${reading.book} ${reading.startChapter}`
        
        if (customStore[commentaryKey]) {
          // AI-generated or user-edited commentaries take priority
          setCommentaryText(customStore[commentaryKey])
        } else {
          const mhcText = await platform.getMhcEntry(commentaryKey)
          if (mhcText) {
            setCommentaryText(mhcText)
          } else {
            setCommentaryText('')
          }
        }

        setLoading(false)
      } catch (err) {
        console.error('WordScreen load error:', err)
        setError(err.message || 'Could not fetch the daily reading.')
        setLoading(false)
      }
    }

    loadData()
  }, [apiKey, settings.esvApiKey, retryKey])

  // Pause audio whenever the page becomes hidden (Win+Tab, Alt+Tab, minimize, snooze — everything)
  useEffect(() => {
    const handleVisibility = () => {
      if (!audioRef.current) return
      if (document.hidden) {
        audioRef.current.pause()
        setIsPlaying(false)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const toggleAudio = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    // Note: isPlaying state is driven by the audio element's onPlay/onPause events below,
    // not toggled here — ensures correctness when audio is paused externally (e.g. from main process).
  }

  const handleStudyClick = async () => {
    setShowCommentary(true)
    if (!commentaryText) {
      setCommentaryText("No commentary available for this passage.")
    }
  }

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-hidden animate-slide-in-right relative">
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col w-full h-full p-5 sm:p-8 overflow-hidden">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-zinc-800 shrink-0">
          <div className="pl-10 md:pl-0">
            <h2 className="text-xs sm:text-sm text-gold-500 font-medium tracking-widest uppercase mb-0.5">
              Day {todayReading.day}
            </h2>
            <h1 className="text-xl sm:text-2xl font-serif text-white">
              {todayReading.reference}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {audioUrl && (
              <button 
                onClick={toggleAudio}
                className={`p-2 sm:p-2.5 rounded-full transition-colors ${isPlaying ? 'bg-gold-500 text-black' : 'bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700'}`}
                title="Play Audio"
              >
                <Headphones size={18} />
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  className="hidden"
                />
              </button>
            )}

            <button 
              onClick={handleStudyClick}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700`}
            >
              <Book size={16} />
              Study
            </button>
          </div>
        </div>

        {/* Text Area */}
        <div className="flex-1 overflow-y-auto pr-2 sm:pr-4 custom-scrollbar relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="animate-spin text-zinc-500" size={32} />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
              <p className="text-red-400 text-sm leading-relaxed">{error}</p>
              <button
                onClick={() => { setError(''); setRetryKey(k => k + 1) }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div 
              className="prose prose-invert prose-p:text-zinc-300 prose-p:leading-loose prose-h2:text-gold-400 prose-h2:font-serif max-w-none pb-12"
              dangerouslySetInnerHTML={{ __html: passageHtml }}
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 pb-2 sm:pb-0 sm:pt-6 border-t border-zinc-800 flex justify-end shrink-0">
          <button 
            onClick={onNext}
            className="flex items-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 bg-white text-black font-medium rounded-full hover:bg-zinc-200 transition-all text-sm sm:text-base active:scale-95 shadow-lg"
          >
            Continue to Reflection <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Commentary Overlay Modal (Full-width on mobile, overlay drawer on desktop) */}
      {showCommentary && (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-md flex flex-col justify-end md:justify-center p-0 md:p-6 animate-fade-in">
          <div className="bg-zinc-950 border border-zinc-800 rounded-t-3xl md:rounded-2xl max-h-[85vh] md:max-h-[80vh] flex flex-col w-full md:max-w-2xl md:mx-auto shadow-2xl overflow-hidden animate-slide-up">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <Book className="text-gold-500" size={20} />
                <h3 className="text-gold-500 font-serif text-lg sm:text-xl font-medium">Matthew Henry's Commentary</h3>
              </div>
              <button
                onClick={() => setShowCommentary(false)}
                className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                title="Close Commentary"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
              {(() => {
                if (commentaryText.includes('\n')) {
                  return commentaryText.split('\n').filter(p => p.trim().length > 0)
                }
                const sentences = commentaryText.match(/[^.!?]+[.!?]+[\])'"`’”]*\s*/g) || [commentaryText]
                const paragraphs = []
                let currentP = ''
                sentences.forEach((s, i) => {
                  currentP += s
                  if ((i + 1) % 4 === 0 || i === sentences.length - 1) {
                    paragraphs.push(currentP.trim())
                    currentP = ''
                  }
                })
                return paragraphs
              })().map((paragraph, idx) => (
                <p key={idx} className="text-zinc-300 leading-relaxed text-sm sm:text-base">
                  {paragraph.trim()}
                </p>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-800/80 flex justify-end bg-zinc-900/50">
              <button
                onClick={() => setShowCommentary(false)}
                className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
