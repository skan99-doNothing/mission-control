'use client'

import { useState, useCallback } from 'react'
import { useMissionControl, Conversation } from '@/store'
import { useSmartPoll } from '@/lib/use-smart-poll'
import { createClientLogger } from '@/lib/client-logger'
import { Button } from '@/components/ui/button'

const log = createClientLogger('ConversationList')

function timeAgo(timestamp: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestamp
  if (diff <= 0) return 'now'
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

const STATUS_COLORS: Record<string, string> = {
  busy: 'bg-green-500',
  idle: 'bg-yellow-500',
  error: 'bg-red-500',
  offline: 'bg-muted-foreground/30',
}
const TAG_COLORS: Record<string, string> = {
  slate: 'bg-slate-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
  teal: 'bg-teal-500',
}

interface ConversationListProps {
  onNewConversation: (agentName: string) => void
}

export function ConversationList({ onNewConversation: _onNewConversation }: ConversationListProps) {
  const {
    conversations,
    setConversations,
    activeConversation,
    setActiveConversation,
    markConversationRead,
    dashboardMode,
  } = useMissionControl()
  const [search, setSearch] = useState('')
  const isGatewayMode = dashboardMode !== 'local'

  const loadConversations = useCallback(async () => {
    try {
      const sessionsUrl = dashboardMode === 'local'
        ? '/api/sessions?include_local=1'
        : '/api/sessions'
      const requests: Promise<Response>[] = [fetch(sessionsUrl)]
      if (dashboardMode === 'local') {
        requests.push(fetch('/api/chat/session-prefs'))
      }

      const [sessionsRes, prefsRes] = await Promise.all(requests)
      const sessionsData = sessionsRes.ok ? await sessionsRes.json() : { sessions: [] }
      const prefsPayload = prefsRes?.ok ? await prefsRes.json().catch(() => ({ prefs: {} })) : { prefs: {} }
      const prefs = (prefsPayload?.prefs && typeof prefsPayload.prefs === 'object') ? prefsPayload.prefs : {}

      const providerSessions = (sessionsData.sessions || [])
        .filter((s: any) => {
          if (dashboardMode === 'local') {
            return s?.source === 'local' && (s?.kind === 'claude-code' || s?.kind === 'codex-cli')
          }
          return s?.source === 'gateway'
        })
        .map((s: any, idx: number) => {
          const lastActivityMs = Number(s.lastActivity || s.startTime || 0)
          const updatedAt = lastActivityMs > 1_000_000_000_000
            ? Math.floor(lastActivityMs / 1000)
            : lastActivityMs
          const kindLabel = s.kind === 'codex-cli'
            ? 'Codex'
            : s.kind === 'claude-code'
              ? 'Claude'
              : 'Gateway'
          const prefKey = `${s.kind}:${s.id}`
          const pref = prefs[prefKey] || {}
          const sessionName = dashboardMode === 'local'
            ? (pref.name || `${kindLabel} • ${s.key || s.id}`)
            : `${s.agent || 'Gateway'} • ${s.key || s.id}`
          const sessionKind = s.kind === 'claude-code' || s.kind === 'codex-cli' ? s.kind : 'gateway'

          return {
            id: `session:${s.kind}:${s.id}`,
            name: sessionName,
            kind: s.kind,
            source: 'session' as const,
            session: {
              prefKey: dashboardMode === 'local' ? prefKey : undefined,
              sessionId: String(s.id),
              sessionKind,
              displayName: sessionName,
              colorTag: dashboardMode === 'local' && typeof pref.color === 'string' ? pref.color : undefined,
              model: s.model,
              tokens: s.tokens,
              workingDir: s.workingDir || null,
              lastUserPrompt: s.lastUserPrompt || null,
              active: !!s.active,
              age: s.age,
            },
            participants: [],
            lastMessage: {
              id: Date.now() + idx,
              conversation_id: `session:${s.kind}:${s.id}`,
              from_agent: 'system',
              to_agent: null,
              content: `${s.model || kindLabel} • ${s.tokens || ''}`.trim(),
              message_type: 'system' as const,
              created_at: updatedAt || Math.floor(Date.now() / 1000),
            },
            unreadCount: 0,
            updatedAt,
          }
        })

      setConversations(
        providerSessions.sort((a: Conversation, b: Conversation) => b.updatedAt - a.updatedAt)
      )
    } catch (err) {
      log.error('Failed to load conversations:', err)
    }
  }, [dashboardMode, setConversations])

  useSmartPoll(loadConversations, 30000, { pauseWhenSseConnected: true })

  const handleSelect = (convId: string) => {
    setActiveConversation(convId)
    markConversationRead(convId)
  }

  const filteredConversations = conversations.filter((c) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      c.id.toLowerCase().includes(s) ||
      (c.name || '').toLowerCase().includes(s) ||
      c.lastMessage?.from_agent.toLowerCase().includes(s) ||
      c.lastMessage?.content.toLowerCase().includes(s)
    )
  })

  const gatewayRows = filteredConversations.filter((c) => c.source === 'session' && c.session?.sessionKind === 'gateway')
  const claudeRows = filteredConversations.filter((c) => c.source === 'session' && c.session?.sessionKind === 'claude-code')
  const codexRows = filteredConversations.filter((c) => c.source === 'session' && c.session?.sessionKind === 'codex-cli')

  function renderConversationItem(conv: Conversation) {
    const displayName = conv.name || conv.id.replace('agent_', '')
    const isSessionRow = conv.id.startsWith('session:')
    const isActive = activeConversation === conv.id

    return (
      <Button
        key={conv.id}
        onClick={() => handleSelect(conv.id)}
        variant="ghost"
        className={`w-full justify-start h-auto px-3 py-2.5 rounded-none ${
          isActive
            ? 'bg-accent/60 border-l-2 border-primary'
            : 'border-l-2 border-transparent'
        }`}
      >
        <div className="flex items-center gap-2 w-full">
          {/* Mini avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-7 h-7 rounded-full bg-surface-2 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
              {displayName.charAt(0).toUpperCase()}
            </div>
            {!isSessionRow && (
              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${STATUS_COLORS.offline}`} />
            )}
          </div>

          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                {conv.session?.colorTag && TAG_COLORS[conv.session.colorTag] && (
                  <span className={`h-2 w-2 rounded-full ${TAG_COLORS[conv.session.colorTag]}`} />
                )}
                <span className="text-xs font-medium text-foreground truncate">
                  {displayName}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                {conv.unreadCount > 0 && (
                  <span className="bg-primary text-primary-foreground text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-medium">
                    {conv.unreadCount}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground/40">
                  {conv.updatedAt ? timeAgo(conv.updatedAt) : ''}
                </span>
              </div>
            </div>
            {conv.lastMessage && (
              <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
                {conv.lastMessage.from_agent === 'human'
                  ? `You: ${conv.lastMessage.content}`
                  : conv.lastMessage.content}
              </p>
            )}
          </div>
        </div>
      </Button>
    )
  }

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="p-3 border-b border-border flex-shrink-0">
        <div className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
      {isGatewayMode ? 'Gateway Sessions' : 'Sessions'}
        </div>
        <div className="relative">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50">
            <circle cx="7" cy="7" r="4" />
            <path d="M14 14l-3-3" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-surface-1 rounded-md pl-7 pr-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground/50">
            No conversations yet
          </div>
        ) : (
          <>
            {dashboardMode === 'local' && claudeRows.length > 0 && (
              <div>
                <div className="px-3 pt-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  Claude Sessions
                </div>
                {claudeRows.map(renderConversationItem)}
              </div>
            )}
            {dashboardMode === 'local' && codexRows.length > 0 && (
              <div>
                <div className="px-3 pt-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  Codex Sessions
                </div>
                {codexRows.map(renderConversationItem)}
              </div>
            )}
            {isGatewayMode && gatewayRows.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  Gateway Sessions
                </div>
                {gatewayRows.map(renderConversationItem)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
