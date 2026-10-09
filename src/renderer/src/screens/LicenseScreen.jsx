import { useState } from 'react'
import { KeyRound, ExternalLink, HelpCircle, AlertCircle, CheckCircle2, Loader2, Monitor } from 'lucide-react'
import * as platform from '../services/platform'

export default function LicenseScreen({ onActivated, currentLicense }) {
  const [rawInput, setRawInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorInfo, setErrorInfo] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')

  // Format user input as DVT-XXXX-XXXX-XXXX-XXXX with uppercase and auto-dashes
  const handleInputChange = (e) => {
    setErrorInfo(null)
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    
    // Auto insert dashes
    let formatted = ''
    if (val.startsWith('DVT')) {
      const rest = val.slice(3)
      formatted = 'DVT'
      for (let i = 0; i < rest.length && i < 16; i++) {
        if (i % 4 === 0) formatted += '-'
        formatted += rest[i]
      }
    } else {
      // User started typing or pasted without DVT prefix
      formatted = 'DVT'
      for (let i = 0; i < val.length && i < 16; i++) {
        if (i % 4 === 0) formatted += '-'
        formatted += val[i]
      }
    }
    setRawInput(formatted)
  }

  const handleActivate = async (e) => {
    e?.preventDefault()
    if (!rawInput.trim()) return

    setIsLoading(true)
    setErrorInfo(null)
    setSuccessMsg('')

    try {
      const result = await platform.activateLicense(rawInput)
      if (result.success) {
        setSuccessMsg(result.message || 'License activated successfully!')
        setTimeout(() => {
          if (onActivated) onActivated(result)
        }, 900)
      } else {
        setErrorInfo({
          code: result.code,
          message: result.message || 'Activation failed. Please check your key and try again.'
        })
      }
    } catch (err) {
      setErrorInfo({
        code: 'ERROR',
        message: err.message || 'An unexpected error occurred during activation.'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenPricing = () => {
    window.open('https://devote.electrodedigital.co.uk/#pricing', '_blank')
  }

  const handleOpenSupport = () => {
    window.location.href = 'mailto:support@electrodedigital.co.uk?subject=Devote%20License%20Support'
  }

  // Explanatory banner if locked due to offline or expired past_due
  const isExpired = currentLicense?.status === 'offline_expired' || currentLicense?.status === 'past_due_expired' || currentLicense?.status === 'cancelled'

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-center items-center px-6 sm:px-12 text-white animate-fade-in overflow-y-auto py-10 bg-zinc-950/95 backdrop-blur-3xl">
      <div className="max-w-md w-full mx-auto flex flex-col items-center text-center">
        
        {/* Amber Icon Badge */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-700/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-6 shadow-lg shadow-amber-500/5">
          <KeyRound size={30} className="stroke-[1.75]" />
        </div>

        <h1 className="text-3xl font-serif text-white mb-2">Activate Devote</h1>
        <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
          Enter your license key to unlock your daily distraction-free devotional journey.
        </p>

        {/* Status / Expiration Alert if present */}
        {isExpired && (
          <div className="w-full mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-xs flex items-start text-left gap-3">
            <AlertCircle size={18} className="shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="font-medium text-amber-300">
                {currentLicense.status === 'offline_expired' ? 'Connection Required' : 'Subscription Update Needed'}
              </p>
              <p className="mt-0.5 text-zinc-300 text-[11px] leading-relaxed">
                {currentLicense.reason || 'Please activate an active subscription key to continue.'}
              </p>
            </div>
          </div>
        )}

        {/* License Input Form */}
        <form onSubmit={handleActivate} className="w-full space-y-4">
          <div className="text-left">
            <label className="block text-xs uppercase tracking-wider text-zinc-400 font-medium mb-1.5 ml-1">
              License Key
            </label>
            <div className="relative">
              <input
                type="text"
                value={rawInput}
                onChange={handleInputChange}
                placeholder="DVT-XXXX-XXXX-XXXX-XXXX"
                maxLength={24}
                disabled={isLoading}
                autoFocus
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-4 py-3.5 text-white font-mono text-center tracking-wider focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all text-sm placeholder:text-zinc-600 disabled:opacity-60"
              />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1.5 ml-1">
              Found on your order confirmation page and email receipt.
            </p>
          </div>

          {/* Feedback messages */}
          {errorInfo && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs text-left flex items-start gap-2.5 animate-fade-in">
              <AlertCircle size={16} className="shrink-0 text-red-400 mt-0.5" />
              <div className="flex-1">
                <p className="leading-relaxed">{errorInfo.message}</p>
                {errorInfo.code === 'DEVICE_LIMIT_REACHED' && (
                  <p className="mt-2 text-zinc-400 text-[11px]">
                    Tip: Open Devote on another device, go to Settings &gt; License, and click &ldquo;Deactivate this device&rdquo;.
                  </p>
                )}
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-center justify-center gap-2 animate-fade-in">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !rawInput.trim()}
            className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin text-zinc-950" />
                <span>Activating...</span>
              </>
            ) : (
              <span>Activate Devote</span>
            )}
          </button>
        </form>

        {/* Pricing Info Card matching website exact copy */}
        <div className="w-full mt-6 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 text-left">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-300 mb-2">
            <Monitor size={14} className="text-amber-400" />
            <span>One license works on 3 devices</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed mb-3">
            Includes 14-day free trial (card required at checkout, cancel anytime before it ends).
          </p>
          <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-800/60">
            <div>
              <span className="font-semibold text-white">£4.50</span>
              <span className="text-zinc-500 text-[10px]">/month</span>
            </div>
            <span className="text-zinc-600 text-[10px]">or</span>
            <div>
              <span className="font-semibold text-white">£2.99</span>
              <span className="text-zinc-500 text-[10px]">/mo (£35.88/yr)</span>
            </div>
          </div>
        </div>

        {/* Links / Actions */}
        <div className="flex items-center justify-between w-full mt-6 text-xs text-zinc-400">
          <button
            onClick={handleOpenPricing}
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <span>Buy a license</span>
            <ExternalLink size={12} />
          </button>
          
          <button
            onClick={handleOpenSupport}
            className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors text-zinc-500"
          >
            <HelpCircle size={13} />
            <span>Need help?</span>
          </button>
        </div>

      </div>
    </div>
  )
}
