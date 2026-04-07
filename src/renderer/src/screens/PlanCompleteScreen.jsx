import { useState, useEffect } from 'react'

export default function PlanCompleteScreen({ onResetPlan }) {
  const [step, setStep] = useState(1)
  const [planType, setPlanType] = useState('devote')
  const [customBooks, setCustomBooks] = useState([])
  const [allBooks, setAllBooks] = useState([])

  useEffect(() => {
    if (window.electron) {
      window.electron.ipcRenderer.invoke('get-all-books').then(books => {
        setAllBooks(books)
      })
    }
  }, [])

  const toggleBook = (b) => {
    if (customBooks.includes(b)) {
      setCustomBooks(customBooks.filter(x => x !== b))
    } else {
      setCustomBooks([...customBooks, b])
    }
  }

  const handleFinish = () => {
    onResetPlan({
      planType,
      customBooks: planType === 'devote' ? [] : customBooks,
      currentPlanDay: 1
    })
  }

  return (
    <div className="absolute inset-0 bg-black z-40 flex flex-col pt-16 px-12 text-white animate-fade-in overflow-y-auto pb-16">
      
      {step === 1 && (
        <div className="max-w-2xl mx-auto w-full flex flex-col text-center mt-20">
          <div className="w-24 h-24 bg-gold-500/20 text-gold-500 rounded-full flex items-center justify-center mx-auto mb-8 border border-gold-500/50 shadow-[0_0_50px_rgba(212,175,55,0.3)]">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"></path></svg>
          </div>
          <h1 className="text-4xl font-serif mb-4 text-white">A Year Completed</h1>
          <p className="text-zinc-400 text-lg mb-10 leading-relaxed max-w-xl mx-auto">
            You have faithfully completed 365 days of reading and reflection. A remarkable achievement. As you begin a new year, let's prepare your next curriculum.
          </p>

          <button 
            onClick={() => setStep(2)}
            className="px-8 py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition-colors inline-flex self-center"
          >
            Set Up Year 2
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="max-w-2xl mx-auto w-full flex flex-col mt-10 animate-fade-in">
          <h3 className="text-xl font-medium mb-4">Choose your track:</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <button 
              onClick={() => setPlanType('devote')}
              className={`p-6 rounded-xl border text-left transition-all ${planType === 'devote' ? 'border-gold-500 bg-gold-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
            >
              <h4 className="text-lg font-bold text-white mb-2">Devote's Recommendation</h4>
              <p className="text-sm text-zinc-400">Restart the core plan: Alternating daily between the New Testament and the Psalms.</p>
            </button>

            <button 
              onClick={() => setPlanType('custom')}
              className={`p-6 rounded-xl border text-left transition-all ${planType === 'custom' ? 'border-gold-500 bg-gold-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
            >
              <h4 className="text-lg font-bold text-white mb-2">Custom Library</h4>
              <p className="text-sm text-zinc-400">Pick specific books of the Bible to focus on. Devote will distribute them evenly across 365 days.</p>
            </button>
          </div>

          {planType === 'custom' && (
            <div className="mb-8 animate-fade-in">
              <h3 className="text-md font-medium mb-3 text-zinc-300">Select your books:</h3>
              <div className="flex flex-wrap gap-2">
                {allBooks.map(b => (
                  <button 
                    key={b}
                    onClick={() => toggleBook(b)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${customBooks.includes(b) ? 'bg-gold-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button 
              onClick={() => setStep(1)}
              className="px-6 py-3 text-zinc-400 hover:text-white transition-colors"
            >
              Back
            </button>
            <button 
              onClick={handleFinish}
              disabled={planType === 'custom' && customBooks.length === 0}
              className="px-8 py-3 bg-gold-500 text-black font-medium rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50"
            >
              Start New Plan
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
