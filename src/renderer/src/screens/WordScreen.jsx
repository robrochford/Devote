import React, { useState, useEffect, useRef } from 'react'
import { Headphones, Book, ChevronRight, Loader2 } from 'lucide-react'

export default function WordScreen({ settings, apiKey, aiApiKey, onNext }) {
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
        const reading = await window.electron.ipcRenderer.invoke('get-today-reading')
        setTodayReading(reading)

        // 2. If we haven't received the apiKey prop yet (due to settings loading race),
        // we bail but keep the loader spinning until it arrives.
        if (!apiKey) {
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
          setPassageHtml(data.passages[0])
          const q2 = encodeURIComponent(reading.reference)
          setAudioUrl(`http://127.0.0.1:45678/?q=${q2}`)
        } else {
          console.log('No cache found or day mismatch, fetching fresh...')
          const q = encodeURIComponent(reading.reference)
          const data = await window.electron.ipcRenderer.invoke('fetch-esv', {
            url: `https://api.esv.org/v3/passage/html/?q=${q}&include-footnotes=false&include-audio-link=false&include-headings=true`,
            apiKey: apiKey
          })
          
          if (data && data.passages && data.passages.length > 0) {
            setPassageHtml(data.passages[0])
            const q2 = encodeURIComponent(reading.reference)
            setAudioUrl(`http://127.0.0.1:45678/?q=${q2}`)
          } else {
            setError('The ESV API returned no passage content for this reference.')
          }
        }

        // Commentary Logic — check custom/AI-generated first, then bundled MHC
        const customStore = await window.electron.ipcRenderer.invoke('get-custom-commentaries')
        const commentaryKey = `${reading.book} ${reading.startChapter}`
        
        if (customStore[commentaryKey]) {
          // AI-generated or user-edited commentaries take priority
          setCommentaryText(customStore[commentaryKey])
        } else {
          const mhcText = await window.electron.ipcRenderer.invoke('get-mhc-entry', commentaryKey)
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
  }, [apiKey, retryKey])

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
    setShowCommentary(!showCommentary)
    
    if (!showCommentary && !commentaryText) {
      setCommentaryText("No commentary available for this passage.")
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden animate-slide-in-right relative">
      
      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col transition-all duration-500 p-8 ${showCommentary ? 'w-2/3 pr-4 border-r border-zinc-800' : 'w-full'}`}>
        
        {/* Header Bar */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-zinc-800">
          <div>
            <h2 className="text-sm text-gold-500 font-medium tracking-widest uppercase mb-1">
              Day {todayReading.day}
            </h2>
            <h1 className="text-2xl font-serif text-white">
              {todayReading.reference}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {audioUrl && (
              <button 
                onClick={toggleAudio}
                className={`p-2 rounded-full transition-colors ${isPlaying ? 'bg-gold-500 text-black' : 'bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700'}`}
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
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${showCommentary ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700'}`}
            >
              <Book size={16} />
              Study
            </button>
          </div>
        </div>

        {/* Text Area */}
        <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="animate-spin text-zinc-500" size={32} />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
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
              className="prose prose-invert prose-p:text-zinc-300 prose-p:leading-loose prose-h2:text-gold-400 prose-h2:font-serif max-w-none pb-20"
              dangerouslySetInnerHTML={{ __html: passageHtml }}
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-6 border-t border-zinc-800 flex justify-end">
          <button 
            onClick={onNext}
            className="flex items-center gap-2 px-6 py-2.5 bg-white text-black font-medium rounded-full hover:bg-zinc-200 transition-colors"
          >
            Continue to Reflection <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Commentary Side Panel */}
      {showCommentary && (
        <div className="w-1/3 bg-zinc-950/50 p-6 overflow-y-auto custom-scrollbar border-l border-zinc-800 animate-slide-in-right flex flex-col">
          <h3 className="text-gold-500 font-serif text-xl mb-4 border-b border-zinc-800 pb-2">Matthew Henry's Commentary</h3>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {(() => {
                // If the text naturally has newlines (e.g. from AI), just use those
                if (commentaryText.includes('\n')) {
                  return commentaryText.split('\n').filter(p => p.trim().length > 0)
                }
                // Otherwise, artificially chunk it into paragraphs so it isn't a wall of text
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
                <p key={idx} className="text-zinc-400 leading-relaxed text-sm mb-5">
                  {paragraph.trim()}
                </p>
              ))}
            </div>
        </div>
      )}

    </div>
  )
}
