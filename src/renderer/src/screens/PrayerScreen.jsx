import React from 'react'
import { BookOpen } from 'lucide-react'

export default function PrayerScreen({ onNext }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-fade-in relative overflow-hidden">
      
      {/* Background soft glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gold-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-8">
        <BookOpen className="text-white/70" size={32} />
      </div>

      <h1 className="text-4xl font-serif text-white mb-6 tracking-wide">
        Be Still
      </h1>
      
      <p className="text-zinc-400 text-lg max-w-md mb-12 leading-relaxed">
        Before you begin your day, take a deep breath. Quiet your mind. Ask the Holy Spirit to guide your heart as you read the Word today.
      </p>

      <button 
        onClick={onNext}
        className="px-8 py-3 bg-white text-black font-medium rounded-full hover:bg-zinc-200 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
      >
        I'm Ready
      </button>

    </div>
  )
}
