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
  const [originalDay, setOriginalDay] = useState(1)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const [updateVersion, setUpdateVersion] = useState('')
  const [checkingUpdate, setCheckingUpdate] = useState(false)

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

      // Store named listener references so removeListener can target them precisely
      const onResetUi = () => {
        setResetKey(prev => prev + 1)
        setCurrentScreen('prayer')
        setJustFinished(false)
        window.electron.ipcRenderer.invoke('get-settings').then(s => setSettings(s))
      }

      const onWindowShow = () => {
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
      }

      const onUpdateReady = (version) => {
        setUpdateReady(true)
        setUpdateVersion(version)
      }

      window.electron.ipcRenderer.on('reset-ui', onResetUi)
      window.electron.ipcRenderer.on('window-show', onWindowShow)
      window.electron.ipcRenderer.on('update-ready', onUpdateReady)

      return () => {
        window.electron.ipcRenderer.removeListener('reset-ui', onResetUi)
        window.electron.ipcRenderer.removeListener('window-show', onWindowShow)
        window.electron.ipcRenderer.removeListener('update-ready', onUpdateReady)
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

  const handleSaveSettings = (newSettings, { withFeedback = false } = {}) => {
    const updated = { ...settings, ...newSettings }
    
    // If the user changed the day or unlocked a completed day, 
    // we need to force the UI to reset to the beginning.
    const needsReset = (updated.currentPlanDay !== originalDay) || 
                       (currentScreen === 'complete' && updated.completedToday === false)
    
    setSettings(updated)
    if (window.electron) window.electron.ipcRenderer.invoke('save-settings', updated)
    
    if (needsReset) {
      setCurrentScreen('prayer')
      setResetKey(key => key + 1)
      setJustFinished(false)
    }
    
    if (withFeedback) {
      // Show "Saved" confirmation briefly before closing
      setSaveSuccess(true)
      setTimeout(() => {
        setSaveSuccess(false)
        setShowSettings(false)
      }, 800)
    } else {
      setShowSettings(false)
    }
  }

  return (
    <div className="relative w-full max-w-4xl max-h-[90vh] mx-auto animate-fade-in group">
      {/* App Container */}
      <div className="h-[750px] transition-all duration-700 bg-zinc-900/80 backdrop-blur-xl border border-zinc-700/50 rounded-3xl shadow-2xl overflow-hidden relative">
        
        {/* Settings Button + Update Badge */}
        {settings.hasCompletedOnboarding && (
          <div className="absolute bottom-6 left-6 z-[100]">
            <button 
              onClick={() => {
                if (!showSettings) setOriginalDay(settings.currentPlanDay)
                setShowSettings(!showSettings)
              }}
              className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
            >
              {showSettings ? <X size={20} /> : <Settings size={20} />}
            </button>
            {updateReady && !showSettings && (
              <div
                className="absolute -top-8 left-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/20 border border-green-500/40 text-green-400 text-[10px] font-medium whitespace-nowrap cursor-pointer animate-pulse"
                onClick={() => {
                  setOriginalDay(settings.currentPlanDay)
                  setShowSettings(true)
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0"></span>
                Update {updateVersion} ready
              </div>
            )}
          </div>
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

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2 font-serif">Plan Day Progression</label>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gold-500 text-sm"
                    value={settings.currentPlanDay || 1}
                    onChange={(e) => setSettings({...settings, currentPlanDay: parseInt(e.target.value) || 1, completedToday: false})}
                    min="1"
                    max="365"
                  />
                  <div className="px-3 py-2 bg-zinc-800/50 rounded-lg border border-zinc-700/30 text-[10px] text-zinc-500 flex items-center">
                    / 365
                  </div>
                </div>
                <p className="text-[10px] text-zinc-600 mt-2 px-1">Jumping to a day will unlock it if previously completed.</p>
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
                onClick={() => handleSaveSettings(settings, { withFeedback: true })}
                className={`w-full mt-4 px-4 py-3 font-medium rounded-lg transition-colors ${
                  saveSuccess
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-white text-black hover:bg-zinc-200'
                }`}
              >
                {saveSuccess ? '✓ Saved' : 'Save & Close'}
              </button>

              <div className="pt-4 flex items-center justify-between">
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Version {appVersion}</span>
                {updateReady ? (
                  <span className="text-[10px] text-green-400 font-medium animate-pulse">
                    v{updateVersion} downloaded — click Restart Now in the update dialog.
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      if (window.electron) {
                        setCheckingUpdate(true)
                        window.electron.ipcRenderer.invoke('check-for-updates').then(() => {
                          setTimeout(() => setCheckingUpdate(false), 4000)
                        })
                      }
                    }}
                    disabled={checkingUpdate}
                    className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-50"
                  >
                    {checkingUpdate ? 'Checking...' : 'Check for updates'}
                  </button>
                )}
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
              {currentScreen === 'word' && (
                <WordScreen 
                  settings={settings}
                  apiKey={settings.esvApiKey} 
                  aiApiKey={settings.aiApiKey}
                  onNext={() => handleNext('reflection')} 
                />
              )}
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
