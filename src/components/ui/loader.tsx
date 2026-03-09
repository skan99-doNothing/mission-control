'use client'

import Image from 'next/image'
import { APP_VERSION } from '@/lib/version'

function ClaudeMark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Vertical spoke */}
      <line x1="24" y1="8" x2="24" y2="40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {/* 60-degree spoke */}
      <line x1="10.14" y1="32" x2="37.86" y2="16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {/* 120-degree spoke */}
      <line x1="10.14" y1="16" x2="37.86" y2="32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function CodexMark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* OpenAI-style hexagon */}
      <path d="M24 6L40 15V33L24 42L8 33V15L24 6Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      <path d="M24 6V42M8 15L40 33M40 15L8 33" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

function HermesMark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Caduceus / staff symbol */}
      <line x1="24" y1="8" x2="24" y2="42" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      {/* Wings */}
      <path d="M24 14C20 14 14 11 12 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M24 14C28 14 34 11 36 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Left serpent */}
      <path d="M24 18C20 18 18 22 22 24C26 26 18 30 18 34C18 36 20 38 24 38" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Right serpent */}
      <path d="M24 18C28 18 30 22 26 24C22 26 30 30 30 34C30 36 28 38 24 38" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

interface InitStep {
  key: string
  label: string
  status: 'pending' | 'done'
}

interface LoaderProps {
  variant?: 'page' | 'panel' | 'inline'
  label?: string
  steps?: InitStep[]
}

function LoaderDots({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dotSize = size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5'
  return (
    <div className="flex items-center gap-1.5">
      <div className={`${dotSize} rounded-full bg-void-cyan animate-pulse`} style={{ animationDelay: '0ms' }} />
      <div className={`${dotSize} rounded-full bg-void-cyan animate-pulse`} style={{ animationDelay: '200ms' }} />
      <div className={`${dotSize} rounded-full bg-void-cyan animate-pulse`} style={{ animationDelay: '400ms' }} />
    </div>
  )
}

function PageLoader({ steps }: { steps?: InitStep[] }) {
  const doneCount = steps?.filter(s => s.status === 'done').length ?? 0
  const totalCount = steps?.length ?? 1
  const progress = steps ? (doneCount / totalCount) * 100 : 0
  const allDone = steps ? doneCount === totalCount : false

  const activeStep = steps?.find(s => s.status === 'pending')

  return (
    <div
      className={`flex items-center justify-center min-h-screen bg-background void-bg transition-opacity duration-300 ${allDone ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="flex flex-col items-center gap-8 w-64">
        {/* Animated logo sequence: OpenClaw + Claude converge → morph into MC mark */}
        <div className="relative flex items-center justify-center h-28 w-full">
          {/* Ambient glow */}
          <div
            className="absolute w-28 h-28 rounded-full bg-primary/8 blur-2xl animate-glow-pulse"
            style={{ animationDelay: '2.2s' }}
          />
          {/* Phase 1: Four logos converge from cardinal directions (fades out at 1.8s) */}
          <div className="absolute inset-0 flex items-center justify-center animate-pair-fade-out">
            <div className="relative w-28 h-28">
              {/* Top: Claude */}
              <div className="absolute left-1/2 top-0 -translate-x-1/2 opacity-0 animate-converge-top">
                <ClaudeMark className="w-9 h-9" style={{ color: 'hsl(25, 95%, 53%)' }} />
              </div>
              {/* Left: OpenClaw */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 animate-converge-left">
                <Image
                  src="/brand/openclaw-logo.png"
                  alt="OpenClaw"
                  width={36}
                  height={36}
                  className="w-9 h-9 rounded-lg"
                />
              </div>
              {/* Right: Codex */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 animate-converge-right">
                <CodexMark className="w-9 h-9" style={{ color: 'hsl(152, 69%, 47%)' }} />
              </div>
              {/* Bottom: Hermes */}
              <div className="absolute left-1/2 bottom-0 -translate-x-1/2 opacity-0 animate-converge-bottom">
                <HermesMark className="w-9 h-9" style={{ color: 'hsl(263, 90%, 66%)' }} />
              </div>
              {/* Center burst */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-primary opacity-0 animate-converge-burst" />
            </div>
          </div>
          {/* Phase 2: MC mark emerges (fades in at 2.0s) */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 animate-mc-fade-in">
            <div className="animate-float" style={{ animationDelay: '2.7s' }}>
              <Image
                src="/brand/mc-logo-128.png"
                alt="Mission Control"
                width={56}
                height={56}
                className="w-14 h-14"
              />
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="flex flex-col items-center gap-1">
          <h1 className="font-mono text-sm tracking-[0.2em] uppercase text-foreground font-medium">
            Mission Control
          </h1>
          <p className="text-2xs text-muted-foreground/60">
            Agent Orchestration
          </p>
        </div>

        {/* Progress section — appears after logo animation, only while loading */}
        {steps ? (
          <div
            className="w-full flex flex-col items-center gap-3 opacity-0"
            style={{ animation: 'mcFadeIn 0.6s ease-out 2.4s forwards' }}
          >
            {/* Progress bar */}
            <div className="w-full h-0.5 bg-border/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary shimmer-bar rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Active step label — crossfades on step change */}
            <div className="h-5 flex items-center justify-center">
              {activeStep && (
                <div
                  key={activeStep.key}
                  className="flex items-center gap-2"
                  style={{ animation: 'fadeIn 0.3s ease-out' }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="font-mono text-2xs tracking-wide text-muted-foreground">
                    {activeStep.label}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* SSR fallback — no progress data yet */
          <LoaderDots />
        )}

        {/* Version */}
        <span className="text-2xs font-mono text-muted-foreground/40">
          v{APP_VERSION}
        </span>
      </div>
    </div>
  )
}

export function Loader({ variant = 'panel', label, steps }: LoaderProps) {
  if (variant === 'page') {
    return <PageLoader steps={steps} />
  }

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2">
        <LoaderDots size="sm" />
        {label && <span className="text-sm text-muted-foreground">{label}</span>}
      </div>
    )
  }

  // panel (default)
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-3">
        <LoaderDots />
        {label && <span className="text-sm text-muted-foreground">{label}</span>}
      </div>
    </div>
  )
}
