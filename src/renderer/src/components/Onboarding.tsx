/**
 * First-run onboarding (Phase 4): a full-screen, dismissible tutorial shown
 * once until the user completes it (persisted via the `onboarded` setting).
 */
import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ClipboardList, FolderTree, Keyboard, Link2, Sparkles, X } from 'lucide-react'
import { useT, type TranslationKey } from '../i18n'
import { hotkeyLabel } from '../../../shared/hotkey'
import { Button } from './ui'
import { cn } from '../lib'

const STEPS: Array<{ titleKey: TranslationKey; bodyKey: TranslationKey; icon: React.ComponentType<{ className?: string }> }> = [
  { titleKey: 'onboarding.welcomeTitle', bodyKey: 'onboarding.welcomeBody', icon: Sparkles },
  { titleKey: 'onboarding.pasteTitle', bodyKey: 'onboarding.pasteBody', icon: Link2 },
  { titleKey: 'onboarding.qualityTitle', bodyKey: 'onboarding.qualityBody', icon: ClipboardList },
  { titleKey: 'onboarding.organizeTitle', bodyKey: 'onboarding.organizeBody', icon: FolderTree },
  { titleKey: 'onboarding.hotkeyTitle', bodyKey: 'onboarding.hotkeyBody', icon: Keyboard }
]

export function Onboarding({
  platform,
  onComplete
}: {
  platform: string
  onComplete: () => void
}): React.JSX.Element {
  const t = useT()
  const [step, setStep] = useState(0)
  const total = STEPS.length
  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === total - 1

  const next = (): void => {
    if (isLast) onComplete()
    else setStep(step + 1)
  }

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-sc64-border bg-sc64-panel shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-sc64-border px-6 py-4">
          <div className="flex items-center gap-2 text-sm font-bold text-sc64-text">
            <Icon className="h-4 w-4 text-sc64-accent" />
            {t(current.titleKey)}
          </div>
          <button
            type="button"
            onClick={onComplete}
            className="rounded-md p-1 text-sc64-muted transition-colors hover:bg-sc64-panel2 hover:text-sc64-text"
            title={t('onboarding.skip')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-6">
          <div className="mb-4 flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div
                key={s.titleKey}
                className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= step ? 'bg-sc64-accent' : 'bg-sc64-borderlight')}
              />
            ))}
          </div>
          <p className="text-sm leading-relaxed text-sc64-muted">
            {t(current.bodyKey, current.titleKey === 'onboarding.hotkeyTitle' ? { hotkey: hotkeyLabel(platform) } : undefined)}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-sc64-border px-6 py-4">
          <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)}>
            <ArrowLeft className="h-3.5 w-3.5" /> {t('onboarding.back')}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onComplete}>
              {t('onboarding.skip')}
            </Button>
            <Button variant="primary" size="sm" onClick={next}>
              {isLast ? (
                <>
                  <Check className="h-3.5 w-3.5" /> {t('onboarding.getStarted')}
                </>
              ) : (
                <>
                  {t('onboarding.next')} <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
