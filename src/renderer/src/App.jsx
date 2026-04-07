import { useState, useEffect } from 'react'
import { Settings, X } from 'lucide-react'
import PrayerScreen from './screens/PrayerScreen'
import WordScreen from './screens/WordScreen'
import ReflectionScreen from './screens/ReflectionScreen'
import CompletionScreen from './screens/CompletionScreen'
import WelcomeScreen from './screens/WelcomeScreen'
import PlanCompleteScreen from './screens/PlanCompleteScreen'

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('prayer')
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState({})
  const [justFinished, setJustFinished] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    // Load initial settings
    if (window.electron) {
      window.electron.ipcRenderer.invoke('get-version').then(v => setAppVersion(v))
      window.electron.ipcRenderer.invoke('get-settings').then(s => {
        // Migrate old geminiApiKey to generic aiApiKey if found
        if (s.geminiApiKey && !s.aiApiKey) {
          s.aiApiKey = s.geminiApiKey
        }

        // Silent migration for users before v1.1
        if (!s.hasCompletedOnboarding && (s.lastCompletedDate !== null || s.lastOpenedDate)) {
           s.hasCompletedOnboarding = true;
           window.electron.ipcRenderer.invoke('save-settings', { hasCompletedOnboarding: true })
        }

        setSettings(s)
        // If today's devotion is already done, jump straight to the completion screen
        if (s.completedToday) {
          setCurrentScreen('complete')
        }
      })

      window.electron.ipcRenderer.on('reset-ui', () => {
        setResetKey(prev => prev + 1)
        setCurrentScreen('prayer')
        setJustFinished(false)
        window.electron.ipcRenderer.invoke('get-settings').then(s => setSettings(s))
      })

      window.electron.ipcRenderer.on('window-show', () => {
        window.electron.ipcRenderer.invoke('get-settings').then(s => {
          setSettings(s)
          setCurrentScreen(prev => {
            if (!s.completedToday && prev === 'complete') {
              setResetKey(key => key + 1)
              setJustFinished(false)
              return 'prayer'
            }
            if (s.completedToday && !justFinished) {
              return 'complete'
            }
            return prev
          })
        })
      })

      return () => {
        window.electron.ipcRenderer.removeAllListeners('reset-ui')
        window.electron.ipcRenderer.removeAllListeners('window-show')
      }
    }
  }, [])

  useEffect(() => {
    // Keep frosted glass
    document.body.className = "overflow-hidden antialiased bg-black/80 backdrop-blur-3xl"
  }, [])

  const getProvider = (key) => {
    if (!key) return 'Any AI Key (Gemini, OpenAI, Claude)'
    if (key.startsWith('sk-ant')) return 'Detected: Anthropic (Claude 3.5 Haiku)'
    if (key.startsWith('sk-')) return 'Detected: OpenAI (GPT-4o mini)'
    return 'Detected: Google (Gemini 3 Flash)'
  }

  const handleNext = (screen) => {
    if (screen === 'complete') setJustFinished(true)
    setCurrentScreen(screen)
  }

  const handleSnooze = () => {
    if (window.electron) window.electron.ipcRenderer.send('snooze')
  }

  const handleSkip = () => {
    if (window.electron) window.electron.ipcRenderer.send('skip-today')
  }

  const handleSaveSettings = (newSettings) => {
    const updated = { ...settings, ...newSettings }
    setSettings(updated)
    if (window.electron) window.electron.ipcRenderer.invoke('save-settings', updated)
    setShowSettings(false)
  }

  return (
    <div className="relative w-full max-w-4xl max-h-[90vh] mx-auto animate-fade-in group">
      {/* App Container */}
      <div className="h-[750px] transition-all duration-700 bg-zinc-900/80 backdrop-blur-xl border border-zinc-700/50 rounded-3xl shadow-2xl overflow-hidden relative">
        
        {/* Settings Button */}
        {settings.hasCompletedOnboarding && (
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="absolute bottom-6 left-6 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors z-[100] opacity-0 group-hover:opacity-100"
          >
            {showSettings ? <X size={20} /> : <Settings size={20} />}
          </button>
        )}

        {/* Settings Panel */}
        {showSettings && settings.hasCompletedOnboarding && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-2xl z-40 p-10 animate-fade-in flex flex-col justify-center">
            <h2 className="text-2xl font-serif text-white mb-8">Settings</h2>
            
            <div className="space-y-6 max-w-md">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">ESV API Key</label>
                <input 
                  type="password" 
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gold-500"
                  value={settings.esvApiKey || ''}
                  onChange={(e) => setSettings({...settings, esvApiKey: e.target.value})}
                  placeholder="Token [Key]"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  AI API Key <span className="text-[10px] text-gold-500/60 ml-2 uppercase tracking-widest">{getProvider(settings.aiApiKey)}</span>
                </label>
                <input 
                  type="password" 
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gold-500"
                  value={settings.aiApiKey || ''}
                  onChange={(e) => setSettings({...settings, aiApiKey: e.target.value})}
                  placeholder="Paste your API key here..."
                />
                <p className="text-[10px] text-zinc-500 mt-2 px-1">Initial set-up: Leave ESV key as default. Just paste an AI key to enable reflections.</p>
              </div>

              <div className="pt-6 flex gap-4 border-t border-zinc-800">
                <button 
                  onClick={handleSnooze}
                  className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                >
                  Snooze 1h
                </button>
                <button 
                  onClick={handleSkip}
                  className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                >
                  Skip Today
                </button>
              </div>

              <div className="pt-2 flex gap-4">
                <button 
                  onClick={() => {
                    handleSaveSettings({ hasCompletedOnboarding: false })
                  }}
                  className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 hover:text-white text-zinc-400 rounded-lg transition-colors border border-zinc-700 text-sm"
                >
                  Configure Study Plan (Restart Year)
                </button>
              </div>

              <button 
                onClick={() => handleSaveSettings(settings)}
                className="w-full mt-4 px-4 py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition-colors"
              >
                Save & Close
              </button>

              <div className="pt-4 text-center">
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Version {appVersion}</span>
              </div>
            </div>
          </div>
        )}

        {/* Screen Controller */}
        {settings.hasCompletedOnboarding && (
          <div key={resetKey} className="h-[750px] relative w-full overflow-hidden">
            <div className={currentScreen === 'prayer' ? 'absolute inset-0 flex' : 'hidden'}>
               <PrayerScreen onNext={() => handleNext('word')} />
            </div>
            
            <div className={currentScreen === 'word' ? 'absolute inset-0 flex' : 'hidden'}>
               <WordScreen 
                  apiKey={settings.esvApiKey} 
                  aiApiKey={settings.aiApiKey} 
                  onNext={() => handleNext('reflection')} 
               />
            </div>
            
            <div className={currentScreen === 'reflection' ? 'absolute inset-0 flex' : 'hidden'}>
               <ReflectionScreen 
                  isActive={currentScreen === 'reflection'} 
                  apiKey={settings.aiApiKey} 
                  esvApiKey={settings.esvApiKey}
                  onNext={() => handleNext('complete')} 
                  onBack={() => handleNext('word')}
               />
            </div>
            
            <div className={currentScreen === 'complete' ? 'absolute inset-0 flex' : 'hidden'}>
              <CompletionScreen 
                streak={settings.currentStreak} 
                isActive={currentScreen === 'complete'} 
                alreadyCompleted={settings.completedToday && !justFinished}
              />
            </div>
          </div>
        )}

        {/* Overlays for special states */}
        {!settings.hasCompletedOnboarding && Object.keys(settings).length > 0 && (
          <WelcomeScreen onComplete={handleSaveSettings} />
        )}

        {settings.currentPlanDay > 365 && settings.hasCompletedOnboarding && (
          <PlanCompleteScreen onResetPlan={handleSaveSettings} />
        )}

      </div>
    </div>
  )
}
