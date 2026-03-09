'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { useMissionControl } from '@/store'
import { useNavigateToPanel } from '@/lib/navigation'
import { SecurityScanCard } from './security-scan-card'

interface StepInfo {
  id: string
  title: string
  completed: boolean
}

interface OnboardingState {
  showOnboarding: boolean
  currentStep: number
  steps: StepInfo[]
}

interface DiagSecurityCheck {
  name: string
  pass: boolean
  detail: string
}

interface SystemCapabilities {
  claudeSessions: number
  agentCount: number
  gatewayConnected: boolean
  hasSkills: boolean
}

const STEPS = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'interface-mode', title: 'Interface' },
  { id: 'credentials', title: 'Credentials' },
  { id: 'gateway', title: 'Agent Setup' },
  { id: 'security', title: 'Security Scan' },
  { id: 'next-steps', title: 'Get Started' },
]

/** Mode-aware Tailwind classes — local=amber, gateway=cyan */
function modeColors(isGateway: boolean) {
  return isGateway
    ? { text: 'text-void-cyan', border: 'border-void-cyan/30', bg: 'bg-void-cyan', bgLight: 'bg-void-cyan/5', bgBtn: 'bg-void-cyan/20', hoverBg: 'hover:bg-void-cyan/30', hoverBorder: 'hover:border-void-cyan/30', hoverBgLight: 'hover:bg-void-cyan/10', dot: 'bg-void-cyan', dotDim: 'bg-void-cyan/40' }
    : { text: 'text-void-amber', border: 'border-void-amber/30', bg: 'bg-void-amber', bgLight: 'bg-void-amber/5', bgBtn: 'bg-void-amber/20', hoverBg: 'hover:bg-void-amber/30', hoverBorder: 'hover:border-void-amber/30', hoverBgLight: 'hover:bg-void-amber/10', dot: 'bg-void-amber', dotDim: 'bg-void-amber/40' }
}

export function OnboardingWizard() {
  const { showOnboarding, setShowOnboarding, dashboardMode, gatewayAvailable, interfaceMode, setInterfaceMode } = useMissionControl()
  const navigateToPanel = useNavigateToPanel()
  const [step, setStep] = useState(0)
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('left')
  const [animating, setAnimating] = useState(false)
  const [state, setState] = useState<OnboardingState | null>(null)
  const [credentialStatus, setCredentialStatus] = useState<{ authOk: boolean; apiKeyOk: boolean } | null>(null)
  const [closing, setClosing] = useState(false)
  const [capabilities, setCapabilities] = useState<SystemCapabilities>({
    claudeSessions: 0,
    agentCount: 0,
    gatewayConnected: false,
    hasSkills: false,
  })

  useEffect(() => {
    if (!showOnboarding) return
    fetch('/api/onboarding')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setState(data)
          setStep(data.currentStep)
        }
      })
      .catch(() => {})

    // Fetch system capabilities in parallel
    Promise.allSettled([
      fetch('/api/status?action=capabilities').then(r => r.ok ? r.json() : null),
      fetch('/api/agents?limit=1').then(r => r.ok ? r.json() : null),
    ]).then(([statusResult, agentsResult]) => {
      const statusData = statusResult.status === 'fulfilled' ? statusResult.value : null
      const agentsData = agentsResult.status === 'fulfilled' ? agentsResult.value : null
      setCapabilities({
        claudeSessions: statusData?.claudeSessions ?? 0,
        gatewayConnected: statusData?.gateway ?? false,
        agentCount: agentsData?.total ?? 0,
        hasSkills: false,
      })
    })
  }, [showOnboarding])

  useEffect(() => {
    if (step !== 2 || credentialStatus) return
    fetch('/api/diagnostics')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.security?.checks) {
          const checks = data.security.checks as DiagSecurityCheck[]
          const authOk = checks.find(c => c.name === 'Auth password secure')?.pass ?? false
          const apiKeyOk = checks.find(c => c.name === 'API key configured')?.pass ?? false
          setCredentialStatus({ authOk, apiKeyOk })
        }
      })
      .catch(() => {})
  }, [step, credentialStatus])

  const completeStep = useCallback(async (stepId: string) => {
    await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete_step', step: stepId }),
    }).catch(() => {})
  }, [])

  const finish = useCallback(async () => {
    setClosing(true)
    await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    }).catch(() => {})
    setTimeout(() => setShowOnboarding(false), 300)
  }, [setShowOnboarding])

  const skip = useCallback(async () => {
    setClosing(true)
    await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skip' }),
    }).catch(() => {})
    setTimeout(() => setShowOnboarding(false), 300)
  }, [setShowOnboarding])

  const goNext = useCallback(() => {
    const steps = state?.steps || []
    const currentId = steps[step]?.id
    if (currentId) completeStep(currentId)
    setSlideDir('left')
    setAnimating(true)
    setTimeout(() => {
      setStep(s => Math.min(s + 1, STEPS.length - 1))
      setAnimating(false)
    }, 150)
  }, [step, state, completeStep])

  const goBack = useCallback(() => {
    setSlideDir('right')
    setAnimating(true)
    setTimeout(() => {
      setStep(s => Math.max(s - 1, 0))
      setAnimating(false)
    }, 150)
  }, [])

  if (!showOnboarding || !state) return null

  const totalSteps = STEPS.length
  const isGateway = dashboardMode === 'full' || gatewayAvailable

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${closing ? 'opacity-0' : 'opacity-100'}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={skip} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-background border border-border/50 rounded-xl shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-0.5 bg-surface-2">
          <div
            className={`h-full transition-all duration-500 ${isGateway ? 'bg-void-cyan' : 'bg-void-amber'}`}
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {/* Step indicator */}
        <div className="flex flex-col items-center gap-1 pt-4 pb-2">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === step
                    ? (isGateway ? 'bg-void-cyan' : 'bg-void-amber')
                    : i < step
                      ? (isGateway ? 'bg-void-cyan/40' : 'bg-void-amber/40')
                      : 'bg-surface-2'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{STEPS[step]?.title}</span>
        </div>

        {/* Content */}
        <div className={`px-6 py-4 min-h-[320px] flex flex-col transition-all duration-150 ${
          animating
            ? `opacity-0 ${slideDir === 'left' ? '-translate-x-3' : 'translate-x-3'}`
            : 'opacity-100 translate-x-0'
        }`}>
          {step === 0 && (
            <StepWelcome isGateway={isGateway} capabilities={capabilities} onNext={goNext} onSkip={skip} />
          )}
          {step === 1 && (
            <StepInterfaceMode isGateway={isGateway} onNext={goNext} onBack={goBack} />
          )}
          {step === 2 && (
            <StepCredentials isGateway={isGateway} status={credentialStatus} onNext={goNext} onBack={goBack} navigateToPanel={navigateToPanel} onClose={() => setShowOnboarding(false)} />
          )}
          {step === 3 && (
            <StepGateway isGateway={isGateway} capabilities={capabilities} onNext={goNext} onBack={goBack} navigateToPanel={navigateToPanel} onClose={() => setShowOnboarding(false)} />
          )}
          {step === 4 && (
            <StepSecurity isGateway={isGateway} onNext={goNext} onBack={goBack} />
          )}
          {step === 5 && (
            <StepNextSteps isGateway={isGateway} onFinish={finish} onBack={goBack} navigateToPanel={navigateToPanel} onClose={() => setShowOnboarding(false)} />
          )}
        </div>
      </div>
    </div>
  )
}

function StepWelcome({ isGateway, capabilities, onNext, onSkip }: {
  isGateway: boolean
  capabilities: SystemCapabilities
  onNext: () => void
  onSkip: () => void
}) {
  const mc = modeColors(isGateway)

  return (
    <>
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-14 h-14 rounded-xl overflow-hidden bg-surface-1 border border-border/50 flex items-center justify-center shadow-lg">
          <img src="/brand/mc-logo-128.png" alt="Mission Control" className="w-full h-full object-cover" />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Welcome to Mission Control</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Your station for AI agents. When agents dock here, they gain persistent memory,
            task management, coordinated workflows, and full observability.
            We&apos;ve scanned your setup — here&apos;s what&apos;s online.
          </p>
        </div>

        {/* Live status chips */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <StatusChip
            ok={capabilities.claudeSessions > 0}
            label={capabilities.claudeSessions > 0
              ? `${capabilities.claudeSessions} active session${capabilities.claudeSessions !== 1 ? 's' : ''} detected`
              : 'No active Claude sessions'}
          />
          <StatusChip
            ok={capabilities.gatewayConnected}
            label={capabilities.gatewayConnected ? 'Gateway connected' : 'Local mode — no gateway'}
          />
          <StatusChip
            ok={capabilities.agentCount > 0}
            label={capabilities.agentCount > 0
              ? `${capabilities.agentCount} agent${capabilities.agentCount !== 1 ? 's' : ''} registered`
              : 'No agents yet'}
          />
        </div>

        {/* Mode cards — both visible, detected mode highlighted */}
        <div className="w-full">
          <p className="text-xs text-muted-foreground text-center mb-2">Available modes</p>
          <div className="grid grid-cols-2 gap-3">
            {/* Local mode card */}
            <div className={`relative p-3 rounded-lg border text-left transition-colors ${
              !isGateway
                ? 'border-void-amber/40 bg-void-amber/5 border-l-2 border-l-void-amber'
                : 'border-border/20 bg-surface-1/30 opacity-50'
            }`}>
              {!isGateway && (
                <span className="absolute -top-2 right-2 text-2xs px-1.5 py-0.5 rounded-full bg-void-amber/20 text-void-amber border border-void-amber/30">
                  Detected
                </span>
              )}
              <p className={`text-xs font-medium mb-1.5 ${!isGateway ? 'text-void-amber' : 'text-muted-foreground'}`}>
                Local Mode
              </p>
              <ul className={`text-2xs space-y-0.5 ${!isGateway ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
                <li>Monitor Claude Code sessions on this machine</li>
                <li>Task tracking and cost monitoring</li>
                <li>Session history</li>
              </ul>
              {isGateway && (
                <p className="text-2xs text-muted-foreground/40 mt-1.5 italic">Single-pilot ops</p>
              )}
            </div>

            {/* Gateway mode card */}
            <div className={`relative p-3 rounded-lg border text-left transition-colors ${
              isGateway
                ? 'border-void-cyan/40 bg-void-cyan/5 border-l-2 border-l-void-cyan'
                : 'border-border/20 bg-surface-1/30 opacity-50'
            }`}>
              {isGateway && (
                <span className="absolute -top-2 right-2 text-2xs px-1.5 py-0.5 rounded-full bg-void-cyan/20 text-void-cyan border border-void-cyan/30">
                  Detected
                </span>
              )}
              <p className={`text-xs font-medium mb-1.5 ${isGateway ? 'text-void-cyan' : 'text-muted-foreground'}`}>
                Gateway Mode
              </p>
              <ul className={`text-2xs space-y-0.5 ${isGateway ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
                <li>Orchestrate multiple agents across machines</li>
                <li>Memory, skills, and inter-agent comms</li>
                <li>Webhook integrations</li>
              </ul>
              {!isGateway && (
                <p className="text-2xs text-muted-foreground/40 mt-1.5 italic">Requires gateway</p>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between pt-4 border-t border-border/30">
        <Button variant="ghost" size="sm" onClick={onSkip} className="text-xs text-muted-foreground">
          Skip setup
        </Button>
        <Button onClick={onNext} size="sm" className={`${mc.bgBtn} ${mc.text} border ${mc.border} ${mc.hoverBg}`}>
          Get started
        </Button>
      </div>
    </>
  )
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-1 border border-border/30">
      <span className={`w-2 h-2 rounded-full ${ok ? 'bg-green-400' : 'bg-surface-2'}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

function StepInterfaceMode({ isGateway, onNext, onBack }: {
  isGateway: boolean
  onNext: () => void
  onBack: () => void
}) {
  const mc = modeColors(isGateway)
  const { interfaceMode, setInterfaceMode } = useMissionControl()
  const [selected, setSelected] = useState<'essential' | 'full'>(interfaceMode)

  const handleSelect = async (mode: 'essential' | 'full') => {
    setSelected(mode)
    setInterfaceMode(mode)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { 'general.interface_mode': mode } }),
      })
    } catch {}
  }

  return (
    <>
      <div className="flex-1">
        <h2 className="text-lg font-semibold mb-1">Choose Your Station Layout</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Essential shows the core panels operators need most. Full unlocks every system on the station — memory, automation, security auditing, and more. You can switch anytime.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {/* Essential card */}
          <button
            onClick={() => handleSelect('essential')}
            className={`relative p-4 rounded-lg border text-left transition-all ${
              selected === 'essential'
                ? `border-void-amber/50 bg-void-amber/5 border-l-2 border-l-void-amber ring-1 ring-void-amber/20`
                : 'border-border/30 bg-surface-1/30 hover:border-border/50'
            }`}
          >
            {selected === 'essential' && (
              <span className="absolute -top-2 right-2 text-2xs px-1.5 py-0.5 rounded-full bg-void-amber/20 text-void-amber border border-void-amber/30">
                Selected
              </span>
            )}
            <p className={`text-sm font-medium mb-2 ${selected === 'essential' ? 'text-void-amber' : 'text-foreground'}`}>
              Essential
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Streamlined ops — the panels you&apos;ll use daily: fleet overview, agents, tasks, chat, activity feed, logs, and settings.
            </p>
            <ul className="text-2xs text-muted-foreground/70 space-y-0.5">
              <li>Fleet overview, Agents, Tasks, Chat</li>
              <li>Activity feed, Logs, Settings</li>
              <li>7 panels total</li>
            </ul>
          </button>

          {/* Full card */}
          <button
            onClick={() => handleSelect('full')}
            className={`relative p-4 rounded-lg border text-left transition-all ${
              selected === 'full'
                ? `border-void-cyan/50 bg-void-cyan/5 border-l-2 border-l-void-cyan ring-1 ring-void-cyan/20`
                : 'border-border/30 bg-surface-1/30 hover:border-border/50'
            }`}
          >
            {selected === 'full' && (
              <span className="absolute -top-2 right-2 text-2xs px-1.5 py-0.5 rounded-full bg-void-cyan/20 text-void-cyan border border-void-cyan/30">
                Selected
              </span>
            )}
            <p className={`text-sm font-medium mb-2 ${selected === 'full' ? 'text-void-cyan' : 'text-foreground'}`}>
              Full
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Full station access — adds memory browser, cron scheduling, webhooks, alerts, security audit, cost tracking, and gateway config.
            </p>
            <ul className="text-2xs text-muted-foreground/70 space-y-0.5">
              <li>Everything in Essential plus</li>
              <li>Memory, Cron, Webhooks, Audit</li>
              <li>All station systems unlocked</li>
            </ul>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border/30">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-xs text-muted-foreground">Back</Button>
        <Button onClick={onNext} size="sm" className={`${mc.bgBtn} ${mc.text} border ${mc.border} ${mc.hoverBg}`}>
          Continue
        </Button>
      </div>
    </>
  )
}

function StepCredentials({
  isGateway,
  status,
  onNext,
  onBack,
  navigateToPanel,
  onClose,
}: {
  isGateway: boolean
  status: { authOk: boolean; apiKeyOk: boolean } | null
  onNext: () => void
  onBack: () => void
  navigateToPanel: (panel: string) => void
  onClose: () => void
}) {
  const mc = modeColors(isGateway)
  const allGood = status?.authOk && status?.apiKeyOk

  return (
    <>
      <div className="flex-1">
        <h2 className="text-lg font-semibold mb-1">Secure Your Station</h2>
        <p className="text-sm text-muted-foreground mb-4">
          The admin password protects your station console. The API key is a docking credential —
          agents present it when they register, so only authorized agents can dock.
        </p>

        {!status ? (
          <div className="py-4">
            <Loader variant="inline" label="Checking credentials..." />
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`flex items-start gap-3 p-3 rounded-lg border ${status.authOk ? 'border-green-400/20 bg-green-400/5' : 'border-red-400/20 bg-red-400/5'}`}>
              <span className={`font-mono text-sm mt-0.5 ${status.authOk ? 'text-green-400' : 'text-red-400'}`}>
                [{status.authOk ? '+' : 'x'}]
              </span>
              <div>
                <p className="text-sm font-medium">Admin Password</p>
                <p className="text-xs text-muted-foreground">
                  {status.authOk ? 'Password is strong and non-default' : 'Using a default or weak password — change AUTH_PASS in .env'}
                </p>
              </div>
            </div>

            <div className={`flex items-start gap-3 p-3 rounded-lg border ${status.apiKeyOk ? 'border-green-400/20 bg-green-400/5' : 'border-red-400/20 bg-red-400/5'}`}>
              <span className={`font-mono text-sm mt-0.5 ${status.apiKeyOk ? 'text-green-400' : 'text-red-400'}`}>
                [{status.apiKeyOk ? '+' : 'x'}]
              </span>
              <div>
                <p className="text-sm font-medium">API Key</p>
                <p className="text-xs text-muted-foreground">
                  {status.apiKeyOk
                    ? 'Configured — agents can dock using this key'
                    : 'Not set — agents won\'t be able to dock without a configured key. Run: bash scripts/generate-env.sh --force'}
                </p>
              </div>
            </div>

            {!allGood && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => { onClose(); navigateToPanel('settings') }}
              >
                Open Settings
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border/30">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-xs text-muted-foreground">Back</Button>
        <Button onClick={onNext} size="sm" className={`${mc.bgBtn} ${mc.text} border ${mc.border} ${mc.hoverBg}`}>
          {allGood ? 'Continue' : 'Continue anyway'}
        </Button>
      </div>
    </>
  )
}

function StepGateway({
  isGateway,
  capabilities,
  onNext,
  onBack,
  navigateToPanel,
  onClose,
}: {
  isGateway: boolean
  capabilities: SystemCapabilities
  onNext: () => void
  onBack: () => void
  navigateToPanel: (panel: string) => void
  onClose: () => void
}) {
  const mc = modeColors(isGateway)

  return (
    <>
      <div className="flex-1">
        <h2 className="text-lg font-semibold mb-1">What Agents Get When They Dock</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {isGateway
            ? 'Gateway online — full station capabilities active. Agents docking here get the complete feature set.'
            : 'Solo station — monitoring is active. Connect a gateway to unlock multi-agent orchestration.'}
        </p>

        <div className="grid grid-cols-2 gap-3">
          {/* Local features column */}
          <div className={`relative p-3 rounded-lg border space-y-1.5 ${
            !isGateway
              ? 'border-void-amber/40 bg-void-amber/5 border-l-2 border-l-void-amber'
              : 'border-border/20 bg-surface-1/30 opacity-50'
          }`}>
            {!isGateway && (
              <span className="absolute -top-2 right-2 text-2xs px-1.5 py-0.5 rounded-full bg-void-amber/20 text-void-amber border border-void-amber/30">
                Active
              </span>
            )}
            <p className={`text-xs font-medium ${!isGateway ? 'text-void-amber' : 'text-muted-foreground'}`}>
              Solo Station
            </p>
            <ul className={`text-2xs space-y-1 ${!isGateway ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
              <li>Session telemetry — agents report token usage and cost in real-time</li>
              <li>Task board — assign and track work items</li>
              <li>Session history — full activity log</li>
              <li>Security scanning — audit your station</li>
              <li>Diagnostics — system health</li>
            </ul>
          </div>

          {/* Gateway features column */}
          <div className={`relative p-3 rounded-lg border space-y-1.5 ${
            isGateway
              ? 'border-void-cyan/40 bg-void-cyan/5 border-l-2 border-l-void-cyan'
              : 'border-border/20 bg-surface-1/30 opacity-50 pointer-events-none'
          }`}>
            {isGateway && (
              <span className="absolute -top-2 right-2 text-2xs px-1.5 py-0.5 rounded-full bg-void-cyan/20 text-void-cyan border border-void-cyan/30">
                Active
              </span>
            )}
            {!isGateway && (
              <span className="absolute -top-2 right-2 text-2xs px-1.5 py-0.5 rounded-full bg-surface-1 border border-border/30 text-muted-foreground/50">
                Locked
              </span>
            )}
            <p className={`text-xs font-medium ${isGateway ? 'text-void-cyan' : 'text-muted-foreground'}`}>
              Fleet Station
            </p>
            <ul className={`text-2xs space-y-1 ${isGateway ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
              <li>Agent coordination — route tasks between docked agents</li>
              <li>Persistent memory — agents retain context across sessions</li>
              <li>Skills library — extend agent capabilities on demand</li>
              <li>Inter-agent chat — agents communicate directly</li>
              <li>Webhooks — trigger external systems on agent events</li>
            </ul>
          </div>
        </div>

        <div className="mt-3">
          {isGateway && capabilities.agentCount === 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-void-cyan/30 text-void-cyan hover:bg-void-cyan/10"
              onClick={() => { onClose(); navigateToPanel('agents') }}
            >
              Dock your first agent
            </Button>
          )}
          {!isGateway && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                if (capabilities.claudeSessions > 0) {
                  onClose(); navigateToPanel('claude')
                } else {
                  onClose(); navigateToPanel('gateways')
                }
              }}
            >
              {capabilities.claudeSessions > 0 ? 'View active sessions' : 'Set up fleet gateway'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border/30">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-xs text-muted-foreground">Back</Button>
        <Button onClick={onNext} size="sm" className={`${mc.bgBtn} ${mc.text} border ${mc.border} ${mc.hoverBg}`}>
          Continue
        </Button>
      </div>
    </>
  )
}

function StepSecurity({ isGateway, onNext, onBack }: { isGateway: boolean; onNext: () => void; onBack: () => void }) {
  const mc = modeColors(isGateway)

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-1">Station Security Sweep</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Docked agents run autonomously — a compromised station means compromised agents. This scan checks five systems:
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {['Credentials', 'Network', 'OpenClaw config', 'Runtime', 'OS hardening'].map(area => (
            <span key={area} className="text-2xs px-2 py-0.5 rounded-full bg-surface-1 border border-border/30 text-muted-foreground">{area}</span>
          ))}
        </div>
        <SecurityScanCard autoScan />
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border/30">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-xs text-muted-foreground">Back</Button>
        <Button onClick={onNext} size="sm" className={`${mc.bgBtn} ${mc.text} border ${mc.border} ${mc.hoverBg}`}>
          Continue
        </Button>
      </div>
    </>
  )
}

function StepNextSteps({
  isGateway,
  onFinish,
  onBack,
  navigateToPanel,
  onClose,
}: {
  isGateway: boolean
  onFinish: () => void
  onBack: () => void
  navigateToPanel: (panel: string) => void
  onClose: () => void
}) {
  const mc = modeColors(isGateway)
  const goTo = (panel: string) => { onClose(); navigateToPanel(panel) }

  const primaryAction = isGateway
    ? { label: 'Dock your first agent', panel: 'agents', desc: 'Register agents through the console or let them self-dock via POST /api/agents with your docking key' }
    : { label: 'View docked sessions', panel: 'claude', desc: 'See active Claude Code sessions, their output, token usage, and cost in real-time' }

  const secondaryActions = [
    { label: 'Explore the task board', panel: 'tasks', desc: 'Kanban board to create, assign, and track work items across your agents and team' },
    { label: 'Browse the skills hangar', panel: 'skills', desc: 'Pre-built capabilities your agents gain on install' },
    { label: 'Configure webhooks', panel: 'webhooks', desc: 'Set up outbound HTTP notifications for agent events — completions, errors, and status changes' },
    { label: 'Configure station settings', panel: 'settings', desc: 'Manage data retention, scheduled backups, security policies, and system configuration' },
  ]

  return (
    <>
      <div className="flex-1">
        <h2 className="text-lg font-semibold mb-1">Station Online</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Your station is ready for agents. Dock your first agent, or explore the systems below.
        </p>

        <div className="space-y-2">
          {/* Primary CTA */}
          <button
            onClick={() => goTo(primaryAction.panel)}
            className={`w-full flex items-start gap-3 p-3 rounded-lg border ${mc.border} ${mc.bgLight} ${mc.hoverBgLight} transition-colors text-left`}
          >
            <span className={`${mc.text} text-sm mt-0.5 font-mono`}>{'>'}</span>
            <div>
              <p className={`text-sm font-medium ${mc.text}`}>{primaryAction.label}</p>
              <p className="text-xs text-muted-foreground">{primaryAction.desc}</p>
            </div>
          </button>

          {/* Secondary actions */}
          {secondaryActions.map(item => (
            <button
              key={item.panel}
              onClick={() => goTo(item.panel)}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border border-border/30 ${mc.hoverBorder} hover:bg-surface-1/50 transition-colors text-left`}
            >
              <span className={`${mc.text} text-sm mt-0.5`}>-{'>'}</span>
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground/60 mt-3 p-2 rounded-lg bg-surface-1/30 border border-border/20">
          Tip: Agents self-dock via POST /api/agents using the X-Api-Key header.
          Share the docking key with teammates so their agents can join your station automatically.
        </p>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border/30">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-xs text-muted-foreground">Back</Button>
        <Button onClick={onFinish} size="sm" className={`${mc.bgBtn} ${mc.text} border ${mc.border} ${mc.hoverBg}`}>
          Finish Setup
        </Button>
      </div>
    </>
  )
}
