import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import PlanSelector from '../components/PlanSelector'
import * as platform from '../services/platform'

export default function WelcomeScreen({ onComplete }) {
  const [step, setStep] = useState(1)
  const [planType, setPlanType] = useState('devote')
  const [customBooks, setCustomBooks] = useState([])
  const [allBooks, setAllBooks] = useState([])
  const [aiApiKey, setAiApiKey] = useState('')
  const [dailyAlertTime, setDailyAlertTime] = useState('07:00')
  const [alertEnabled, setAlertEnabled] = useState(true)
  const [isFinishing, setIsFinishing] = useState(false)

  useEffect(() => {
    platform.getAllBooks().then(books => {
      setAllBooks(books)
    })
    // Pre-populate any existing API key and alert settings so they aren't wiped on plan reset
    platform.getSettings().then(s => {
      if (s.aiApiKey) setAiApiKey(s.aiApiKey)
      if (s.dailyAlertTime) setDailyAlertTime(s.dailyAlertTime)
      if (s.alertEnabled !== undefined) setAlertEnabled(s.alertEnabled)
    })
  }, [])

  const toggleBook = (b) => {
    if (customBooks.includes(b)) {
      setCustomBooks(customBooks.filter(x => x !== b))
    } else {
      setCustomBooks([...customBooks, b])
    }
  }

  const handleFinish = async () => {
    setIsFinishing(true)
    
    if (planType === 'custom') {
      try {
        await platform.prefetchMhcCommentaries({
          customBooks: customBooks,
          startDay: 1
        })
      } catch (e) {
        console.error("Prefetch failed", e)
      }
    }

    onComplete({
      planType,
      customBooks: planType === 'devote' ? [] : customBooks,
      aiApiKey,
      dailyAlertTime,
      alertEnabled,
      hasCompletedOnboarding: true,
      currentPlanDay: 1
    })
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col px-6 sm:px-12 text-white animate-fade-in overflow-y-auto pb-16">
      {/* Top Drag Handle + Controls */}
      <div className="h-16 shrink-0 w-full flex items-center justify-end" style={{ WebkitAppRegion: 'drag' }}>
         {step === 2 && (
         <button 
           className="px-5 py-2.5 flex items-center justify-center text-gold-500 hover:text-gold-400 transition-colors text-xs font-bold tracking-widest uppercase bg-gold-500/10 border border-gold-500/30 rounded-full hover:bg-gold-500/20"
           style={{ WebkitAppRegion: 'no-drag' }}
           onClick={(e) => {
              e.stopPropagation()
              if (window.electron) window.electron.ipcRenderer.send('minimize-window') 
           }}
           title="Minimize Devote (to grab API Key)"
         >
           Minimize app to get your AI API token
         </button>
         )}
      </div>
      
      {step === 1 && (
        <div className="max-w-2xl mx-auto w-full flex flex-col mt-6 sm:mt-10">
          <h1 className="text-3xl sm:text-4xl font-serif mb-4 text-gold-500">Welcome to Devote</h1>
          <p className="text-zinc-400 text-base sm:text-lg mb-8 sm:mb-10 leading-relaxed">
            A distraction-free, daily bible reader. Before we begin, let's set up your reading curriculum for the next 365 days.
          </p>

          <h3 className="text-lg sm:text-xl font-medium mb-4">Choose your track:</h3>
          
          <PlanSelector
            planType={planType}
            setPlanType={setPlanType}
            customBooks={customBooks}
            toggleBook={toggleBook}
            allBooks={allBooks}
          />

          <button 
            onClick={() => setStep(2)}
            disabled={planType === 'custom' && customBooks.length === 0}
            className="self-end px-8 py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 mt-6"
          >
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="max-w-xl mx-auto w-full flex flex-col mt-10 sm:mt-20 animate-fade-in">
           <h1 className="text-2xl sm:text-3xl font-serif mb-4 text-white">AI Reflection Engine</h1>
           <p className="text-zinc-400 text-sm sm:text-base mb-8 leading-relaxed">
             Devote can generate deep, pastoral questions tailored to the exact text you read each day. 
             To enable this, paste an API key below (OpenAI, Anthropic, or Google Gemini).
           </p>

           <input 
              type="password" 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold-500 mb-2"
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              placeholder="sk-..."
            />
            <p className="text-xs text-zinc-500 mb-10">You can always leave this blank to just use the standard reader, and add it in Settings later.</p>
            
            <div className="flex justify-between">
              <button 
                onClick={() => setStep(1)}
                className="px-6 py-3 text-zinc-400 hover:text-white transition-colors"
              >
                Back
              </button>
              <button 
                onClick={() => setStep(3)}
                className="px-8 py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition-colors"
              >
                Next
              </button>
            </div>
        </div>
      )}

      {step === 3 && (
        <div className="max-w-xl mx-auto w-full flex flex-col mt-10 sm:mt-20 animate-fade-in">
           <h1 className="text-2xl sm:text-3xl font-serif mb-4 text-gold-500">Daily Quiet Time</h1>
           <p className="text-zinc-400 text-sm sm:text-base mb-8 leading-relaxed">
             Devote protects your daily rhythm. Choose what time each morning Devote should notify or prompt you to spend quiet time with the Word.
           </p>

           <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-2xl p-6 mb-8 space-y-5">
             <div className="flex items-center justify-between">
               <div>
                 <span className="text-sm font-medium text-white block">Morning Devotion Prompt</span>
                 <span className="text-xs text-zinc-400">Wake up and begin the day with God</span>
               </div>
               <input 
                 type="checkbox"
                 id="welcome-alert-toggle"
                 className="w-5 h-5 rounded border-zinc-700 bg-zinc-800 text-gold-500 focus:ring-gold-500 cursor-pointer"
                 checked={alertEnabled}
                 onChange={(e) => setAlertEnabled(e.target.checked)}
               />
             </div>

             {alertEnabled && (
               <div className="pt-2 border-t border-zinc-700/40 flex items-center justify-between">
                 <label htmlFor="welcome-time-picker" className="text-sm text-zinc-300">
                   Daily Alert Time
                 </label>
                 <input 
                   type="time"
                   id="welcome-time-picker"
                   value={dailyAlertTime}
                   onChange={(e) => setDailyAlertTime(e.target.value)}
                   className="bg-zinc-900 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-500"
                 />
               </div>
             )}
           </div>

           <div className="flex justify-between">
             <button 
               onClick={() => setStep(2)}
               className="px-6 py-3 text-zinc-400 hover:text-white transition-colors"
             >
               Back
             </button>
             <button 
               onClick={handleFinish}
               disabled={isFinishing}
               className="px-8 py-3 bg-gold-500 text-black font-medium rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
             >
               {isFinishing ? (
                 <>
                   <Loader2 className="animate-spin text-black" size={20} />
                   Preparing...
                 </>
               ) : (
                 'Start Devotion'
               )}
             </button>
           </div>
        </div>
      )}

    </div>
  )
}
