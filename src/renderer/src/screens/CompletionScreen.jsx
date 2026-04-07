import React, { useEffect } from 'react'
import { Flame, CheckCircle2, Sun } from 'lucide-react'

export default function CompletionScreen({ streak, isActive, alreadyCompleted }) {
  useEffect(() => {
    if (!isActive || alreadyCompleted) return // Don't re-fire if just viewing the 'completed' state
    // Tell main process we are done so it updates settings
    if (window.electron) {
      window.electron.ipcRenderer.send('complete-devotion')
      
      // Auto close after 5 seconds
      const timer = setTimeout(() => {
        window.electron.ipcRenderer.send('close-kiosk')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [isActive, alreadyCompleted])

  const displayStreak = alreadyCompleted ? streak : streak + 1

  if (alreadyCompleted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-fade-in relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-gold-500/5 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="relative mb-8">
          <div className="relative w-24 h-24 rounded-full bg-zinc-900 border-2 border-gold-500/30 flex items-center justify-center shadow-[0_0_30px_rgba(234,179,8,0.1)]">
            <Sun className="text-gold-500" size={40} />
          </div>
        </div>

        <h1 className="text-4xl font-serif text-white mb-4">
          Already Complete
        </h1>
        
        <p className="text-zinc-400 text-lg mb-10 max-w-sm">
          You've already spent time with God today. Well done — come back tomorrow.
        </p>

        {displayStreak > 0 && (
          <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-zinc-900 border border-zinc-800">
            <Flame className="text-gold-500" size={20} />
            <span className="text-white font-medium">{displayStreak} Day Streak</span>
          </div>
        )}

        <button 
          onClick={() => { if (window.electron) window.electron.ipcRenderer.send('close-kiosk') }}
          className="mt-12 text-xs text-zinc-500 hover:text-white transition-colors uppercase tracking-widest"
        >
          Close
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-fade-in relative overflow-hidden">
      
      {/* Background celebration glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse-glow"></div>

      <div className="relative mb-8">
        <div className="absolute inset-0 bg-green-500/20 rounded-full blur-xl animate-streak-pop"></div>
        <div className="relative w-24 h-24 rounded-full bg-zinc-900 border-2 border-green-500/50 flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.2)] animate-streak-pop">
          <CheckCircle2 className="text-green-400" size={40} />
        </div>
      </div>

      <h1 className="text-4xl font-serif text-white mb-4">
        Go In Peace
      </h1>
      
      <p className="text-zinc-400 text-lg mb-10 max-w-sm">
        "The Lord bless you and keep you; the Lord make his face shine on you and be gracious to you."
      </p>

      {displayStreak > 1 && (
        <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-zinc-900 border border-zinc-800 animate-slide-up" style={{animationDelay: '0.4s', animationFillMode: 'both'}}>
          <Flame className="text-gold-500" size={20} />
          <span className="text-white font-medium">{displayStreak} Day Streak</span>
        </div>
      )}

      <p className="text-zinc-600 text-sm mt-12 animate-fade-in" style={{animationDelay: '1s', animationFillMode: 'both'}}>
        Closing automatically...
      </p>
      
      <button 
        onClick={() => { if (window.electron) window.electron.ipcRenderer.send('close-kiosk') }}
        className="mt-4 text-xs text-zinc-500 hover:text-white transition-colors uppercase tracking-widest"
      >
        Close Now
      </button>
    </div>
  )
}
