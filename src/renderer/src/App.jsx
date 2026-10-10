import { useState, useEffect } from 'react'
import { Settings, X, KeyRound, AlertTriangle, CheckCircle2, ShieldCheck, Mail, Laptop } from 'lucide-react'
import PrayerScreen from './screens/PrayerScreen'
import WordScreen from './screens/WordScreen'
import ReflectionScreen from './screens/ReflectionScreen'
import CompletionScreen from './screens/CompletionScreen'
import WelcomeScreen from './screens/WelcomeScreen'
import PlanCompleteScreen from './screens/PlanCompleteScreen'
import LicenseScreen from './screens/LicenseScreen'
import * as platform from './services/platform'
import { App as CapApp } from '@capacitor/app'

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
  const [passageText, setPassageText] = useState('')
  const [licenseInfo, setLicenseInfo] = useState(null)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [isCheckingLicense, setIsCheckingLicense] = useState(false)
  const [licenseFeedback, setLicenseFeedback] = useState('')

  useEffect(() => {
    // Load version and initial settings via platform abstraction
    platform.getVersion().then(v => setAppVersion(v))
    platform.getSettings().then(s => {
      // Migrate old geminiApiKey to generic aiApiKey if found
      if (s.geminiApiKey && !s.aiApiKey) {
        s.aiApiKey = s.geminiApiKey
      }

      // Migration cleanup: If they were accidentally marked as onboarded by the 
      // lastOpenedDate bug but haven't finished a devotion, reset them.
      if (s.hasCompletedOnboarding && s.lastCompletedDate === null && !s.planType) {
         s.hasCompletedOnboarding = false;
      }

      // Silent migration for users before v1.1
      if (!s.hasCompletedOnboarding && s.lastCompletedDate !== null) {
         s.hasCompletedOnboarding = true;
         platform.saveSettings({ hasCompletedOnboarding: true })
      }

      setSettings(s)
      // If today's devotion is already done, jump straight to the completion screen
      if (s.completedToday) {
        setCurrentScreen('complete')
      }
    })

    // Load initial license status
    platform.getLicenseStatus().then(status => {
      setLicenseInfo(status)
    })

    // Electron specific IPC listeners
    if (platform.isElectron()) {
      const onResetUi = () => {
        setResetKey(prev => prev + 1)
        setCurrentScreen('prayer')
        setJustFinished(false)
        platform.getSettings().then(s => setSettings(s))
      }

      const onWindowShow = () => {
        platform.getLicenseStatus().then(lic => setLicenseInfo(lic))
        platform.getSettings().then(s => {
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

      const onLicenseChanged = (updated) => {
        setLicenseInfo(updated)
      }

      window.electron.ipcRenderer.on('reset-ui', onResetUi)
      window.electron.ipcRenderer.on('window-show', onWindowShow)
      window.electron.ipcRenderer.on('update-ready', onUpdateReady)
      window.electron.ipcRenderer.on('license-status-changed', onLicenseChanged)

      return () => {
        window.electron.ipcRenderer.removeListener('reset-ui', onResetUi)
        window.electron.ipcRenderer.removeListener('window-show', onWindowShow)
        window.electron.ipcRenderer.removeListener('update-ready', onUpdateReady)
        window.electron.ipcRenderer.removeListener('license-status-changed', onLicenseChanged)
      }
    }

    // Android hardware back button handler
    if (platform.isCapacitor()) {
      const backListener = CapApp.addListener('backButton', () => {
        if (showSettings) {
          setShowSettings(false)
          return
        }
        if (currentScreen === 'reflection') {
          setCurrentScreen('word')
          return
        }
        if (currentScreen === 'word') {
          setCurrentScreen('prayer')
          return
        }
        CapApp.exitApp()
      })

      return () => {
        backListener.then(l => l.remove()).catch(() => {})
      }
    }
  }, [showSettings, currentScreen])

  useEffect(() => {
    // Keep frosted glass
    document.body.className = "overflow-hidden antialiased bg-black/80 backdrop-blur-3xl"
  }, [])

  const getProvider = (key) => {
    if (!key) return 'Any AI Key (Gemini, OpenAI, Claude)'
    const cleanKey = key.trim()
    if (cleanKey.startsWith('sk-ant')) return 'Detected: Anthropic (Claude 4.5 Haiku)'
    if (cleanKey.startsWith('sk-')) return 'Detected: OpenAI (GPT-4o mini)'
    return 'Detected: Google (Gemini 3 Flash)'
  }

  const handleNext = (screen) => {
    if (screen === 'complete') setJustFinished(true)
    if (screen !== 'word') setPassageText('') // Clear between days
    setCurrentScreen(screen)
  }

  const handleSnooze = () => {
    platform.snooze()
  }

  const handleSkip = () => {
    platform.skipToday()
  }

  const handleSaveSettings = (newSettings, { withFeedback = false } = {}) => {
    const dayChanged = (newSettings.currentPlanDay !== undefined && newSettings.currentPlanDay !== originalDay) ||
                       (settings.currentPlanDay !== undefined && settings.currentPlanDay !== originalDay)
    
    // When changing day or unlocking, clear lastCompletedDate and completedToday
    const patch = { ...newSettings }
    if (dayChanged) {
      patch.completedToday = false
      patch.lastCompletedDate = null
    }

    const updated = { ...settings, ...patch }
    
    // If the user changed the day or unlocked a completed day, 
    // we need to force the UI to reset to the beginning.
    const needsReset = dayChanged || 
                       (currentScreen === 'complete' && updated.completedToday === false)

    const apiKeyChanged = (newSettings.esvApiKey !== undefined && newSettings.esvApiKey !== settings.esvApiKey) ||
                          (newSettings.aiApiKey !== undefined && newSettings.aiApiKey !== settings.aiApiKey)
    
    setSettings(updated)
    platform.saveSettings(updated)
    
    if (needsReset) {
      setCurrentScreen('prayer')
      setResetKey(key => key + 1)
      setJustFinished(false)
      setOriginalDay(updated.currentPlanDay)
    } else if (apiKeyChanged) {
      // Force children screens to reload data with the new key without losing current screen position
      setResetKey(key => key + 1)
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
    <div className="relative w-full h-full md:h-[750px] md:max-w-4xl md:m-auto animate-fade-in group flex flex-col">
      {/* App Container */}
      <div className="flex-1 w-full h-full transition-all duration-700 bg-zinc-900/90 backdrop-blur-xl md:border md:border-zinc-700/50 md:rounded-3xl shadow-2xl overflow-hidden relative flex flex-col">
        
        {/* Settings Button + Update Badge */}
        {settings.hasCompletedOnboarding && (
          <div className="absolute top-4 left-4 z-[100] md:top-auto md:bottom-6 md:left-6">
            <button 
              onClick={() => {
                if (!showSettings) setOriginalDay(settings.currentPlanDay)
                setShowSettings(!showSettings)
              }}
              className="p-2.5 rounded-full text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-white/10 transition-colors opacity-90 md:opacity-0 md:group-hover:opacity-100 shadow-md border border-zinc-700/50 md:border-transparent"
              title="Settings"
            >
              {showSettings ? <X size={20} /> : <Settings size={20} />}
            </button>
            {updateReady && !showSettings && (
              <div
                className="absolute top-12 left-0 md:top-auto md:-top-8 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/20 border border-green-500/40 text-green-400 text-[10px] font-medium whitespace-nowrap cursor-pointer animate-pulse"
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
          <div className="absolute inset-0 bg-black/80 md:bg-black/40 backdrop-blur-2xl z-[150] p-6 sm:p-10 animate-fade-in flex flex-col justify-start md:justify-center overflow-y-auto custom-scrollbar">
            <div className="w-full max-w-md mx-auto pt-12 md:pt-0 pb-10">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-serif text-white">Settings</h2>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors md:hidden"
                >
                  <X size={20} />
                </button>
              </div>
            
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

              {/* License Panel */}
              <div className="p-4 rounded-xl bg-zinc-800/60 border border-zinc-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-medium text-sm">
                    <ShieldCheck size={16} className="text-amber-400" />
                    <span>Devote Subscription</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${
                    licenseInfo?.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : licenseInfo?.status === 'past_due'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'bg-red-500/15 text-red-300 border border-red-500/30'
                  }`}>
                    {licenseInfo?.status || 'Unknown'}
                  </span>
                </div>

                <div className="text-xs space-y-1.5 text-zinc-400">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 text-[11px]">Key</span>
                    <span className="font-mono text-white text-[11px]">{licenseInfo?.maskedKey || '••••-••••-••••-••••'}</span>
                  </div>
                  {licenseInfo?.customer?.email && (
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500 text-[11px]">Account</span>
                      <span className="text-zinc-300 text-[11px] truncate max-w-[200px]">{licenseInfo.customer.email}</span>
                    </div>
                  )}
                  {licenseInfo?.lastCheckedAt && (
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500 text-[11px]">Last Verified</span>
                      <span className="text-zinc-400 text-[10px]">{new Date(licenseInfo.lastCheckedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                  <p className="text-[10px] text-zinc-500 pt-1">
                    1 license works on up to 3 devices simultaneously.
                  </p>
                </div>

                {licenseFeedback && (
                  <p className="text-[11px] text-amber-300 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                    {licenseFeedback}
                  </p>
                )}

                <div className="pt-2 flex flex-col sm:flex-row gap-2 border-t border-zinc-700/40">
                  <button
                    type="button"
                    disabled={isDeactivating}
                    onClick={async () => {
                      if (confirm('Deactivate Devote on this device? You can activate it again later with your license key.')) {
                        setIsDeactivating(true)
                        try {
                          await platform.deactivateLicense()
                          setLicenseInfo({ isLicensed: false, status: 'unlicensed' })
                          setShowSettings(false)
                        } finally {
                          setIsDeactivating(false)
                        }
                      }
                    }}
                    className="flex-1 py-1.5 px-3 text-[11px] bg-zinc-800 hover:bg-red-950/40 hover:text-red-300 text-zinc-400 rounded-lg border border-zinc-700 transition-colors"
                  >
                    {isDeactivating ? 'Deactivating...' : 'Deactivate this device'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowSettings(false)
                      setLicenseInfo({ isLicensed: false, status: 'unlicensed' })
                    }}
                    className="flex-1 py-1.5 px-3 text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 transition-colors"
                  >
                    Change key
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      setLicenseFeedback('Opening billing portal...')
                      try {
                        const res = await platform.openCustomerPortal()
                        if (res && !res.success) {
                          setLicenseFeedback(res.message || 'Could not open portal')
                          // Fallback to mailto if portal could not be created (e.g. offline or manual key)
                          setTimeout(() => {
                            window.location.href = 'mailto:support@electrodedigital.co.uk?subject=Devote%20Subscription%20Support'
                          }, 800)
                        } else {
                          setLicenseFeedback('')
                        }
                      } catch {
                        window.location.href = 'mailto:support@electrodedigital.co.uk?subject=Devote%20Subscription%20Support'
                      }
                    }}
                    className="flex-1 py-1.5 px-3 text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 transition-colors"
                  >
                    Manage subscription
                  </button>
                </div>
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

              <div className="pt-2 flex items-center gap-3">
                <input 
                  type="checkbox"
                  id="startup-toggle"
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-gold-500 focus:ring-gold-500 focus:ring-offset-zinc-900"
                  checked={settings.launchAtStartup !== false}
                  onChange={(e) => {
                    const enabled = e.target.checked
                    setSettings({...settings, launchAtStartup: enabled})
                    if (window.electron) {
                      window.electron.ipcRenderer.invoke('set-startup-status', enabled)
                    }
                  }}
                />
                <label htmlFor="startup-toggle" className="text-xs text-zinc-400 cursor-pointer select-none">
                  Launch Devote automatically on computer startup
                </label>
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
          </div>
        )}

        {/* Non-blocking Past Due Billing Banner */}
        {licenseInfo?.isLicensed && licenseInfo?.status === 'past_due' && licenseInfo?.inGracePeriod && (
          <div className="w-full bg-amber-500/20 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs text-amber-200 z-[90]">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-400 shrink-0" />
              <span>
                <strong>Payment issue:</strong> please update your billing. {licenseInfo.daysRemainingInGrace} days remaining in grace period.
              </span>
            </div>
            <button
              onClick={async () => {
                try {
                  const res = await platform.openCustomerPortal()
                  if (!res?.success) {
                    window.location.href = 'mailto:support@electrodedigital.co.uk?subject=Devote%20Billing%20Update'
                  }
                } catch {
                  window.location.href = 'mailto:support@electrodedigital.co.uk?subject=Devote%20Billing%20Update'
                }
              }}
              className="underline text-amber-300 hover:text-white font-medium"
            >
              Update Billing
            </button>
          </div>
        )}

        {/* Screen Controller (Only if Licensed & Onboarded) */}
        {licenseInfo?.isLicensed && settings.hasCompletedOnboarding && (
          <div key={resetKey} className="flex-1 w-full h-full relative overflow-hidden flex flex-col">
            <div className={currentScreen === 'prayer' ? 'absolute inset-0 flex' : 'hidden'}>
               <PrayerScreen onNext={() => handleNext('word')} />
            </div>
            
            <div className={currentScreen === 'word' ? 'absolute inset-0 flex' : 'hidden'}>
              {currentScreen === 'word' && (
                <WordScreen 
                  settings={settings}
                  apiKey={settings.esvApiKey} 
                  aiApiKey={settings.aiApiKey}
                  onPassageLoaded={(text) => setPassageText(text)}
                  onNext={() => handleNext('reflection')} 
                />
              )}
            </div>
            
            <div className={currentScreen === 'reflection' ? 'absolute inset-0 flex' : 'hidden'}>
               <ReflectionScreen 
                  isActive={currentScreen === 'reflection'} 
                  apiKey={settings.aiApiKey} 
                  esvApiKey={settings.esvApiKey}
                  passageText={passageText}
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
        {/* 1. Unlicensed Gate: Shown whenever not licensed (fresh install, expired grace, or offline limit) */}
        {licenseInfo !== null && !licenseInfo.isLicensed && (
          <LicenseScreen
            currentLicense={licenseInfo}
            onActivated={(result) => {
              platform.getLicenseStatus().then(status => setLicenseInfo(status))
            }}
          />
        )}

        {/* 2. Onboarding Gate: Shown after license is active if user hasn't onboarded yet */}
        {licenseInfo?.isLicensed && !settings.hasCompletedOnboarding && Object.keys(settings).length > 0 && (
          <WelcomeScreen onComplete={handleSaveSettings} />
        )}

        {/* 3. Plan Completion */}
        {licenseInfo?.isLicensed && settings.currentPlanDay > 365 && settings.hasCompletedOnboarding && (
          <PlanCompleteScreen onResetPlan={handleSaveSettings} />
        )}

      </div>
    </div>
  )
}
