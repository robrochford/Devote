export default function PlanSelector({ planType, setPlanType, customBooks, toggleBook, allBooks }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <button 
          onClick={() => setPlanType('devote')}
          className={`p-6 rounded-xl border text-left transition-all ${planType === 'devote' ? 'border-gold-500 bg-gold-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
        >
          <h4 className="text-lg font-bold text-white mb-2">Devote's Recommendation</h4>
          <p className="text-sm text-zinc-400">Alternating daily between the New Testament and the Psalms. Disperses the Gospels evenly.</p>
        </button>

        <button 
          onClick={() => setPlanType('custom')}
          className={`p-6 rounded-xl border text-left transition-all ${planType === 'custom' ? 'border-gold-500 bg-gold-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
        >
          <h4 className="text-lg font-bold text-white mb-2">Custom Library</h4>
          <p className="text-sm text-zinc-400">Pick specific books of the Bible to focus on. Devote will distribute them evenly across your year.</p>
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
          {/* Fix #E: Explain why the Next button is disabled when no books are selected */}
          {customBooks.length === 0 && (
            <p className="text-xs text-amber-500/80 mt-3 px-1">
              Please select at least one book to continue.
            </p>
          )}
        </div>
      )}
    </>
  )
}
