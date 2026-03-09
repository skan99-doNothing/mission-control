import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { config } from '@/lib/config'
import { logger } from '@/lib/logger'
import { getDetectedGatewayToken } from '@/lib/gateway-runtime'

const gatewayInternalUrl = `http://${config.gatewayHost}:${config.gatewayPort}`

function gatewayHeaders(): Record<string, string> {
  const token = getDetectedGatewayToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GatewayData = any

interface ChannelStatus {
  configured: boolean
  linked?: boolean
  running: boolean
  connected?: boolean
  lastConnectedAt?: number | null
  lastMessageAt?: number | null
  lastStartAt?: number | null
  lastError?: string | null
  authAgeMs?: number | null
  mode?: string | null
  baseUrl?: string | null
  publicKey?: string | null
  probe?: GatewayData
  profile?: GatewayData
}

interface ChannelAccount {
  accountId: string
  name?: string | null
  configured?: boolean | null
  linked?: boolean | null
  running?: boolean | null
  connected?: boolean | null
  lastConnectedAt?: number | null
  lastInboundAt?: number | null
  lastOutboundAt?: number | null
  lastError?: string | null
  lastStartAt?: number | null
  mode?: string | null
  probe?: GatewayData
  publicKey?: string | null
  profile?: GatewayData
}

interface ChannelsSnapshot {
  channels: Record<string, ChannelStatus>
  channelAccounts: Record<string, ChannelAccount[]>
  channelOrder: string[]
  channelLabels: Record<string, string>
  connected: boolean
  updatedAt?: number
}

function transformGatewayChannels(data: GatewayData): ChannelsSnapshot {
  const rawChannels = data.channels || {}
  const rawAccounts = data.channelAccounts || {}
  const channelLabels = data.channelLabels || {}
  const order: string[] = data.channelOrder || Object.keys(rawChannels)

  const channels: Record<string, ChannelStatus> = {}
  const channelAccounts: Record<string, ChannelAccount[]> = {}

  for (const key of order) {
    const ch = rawChannels[key]
    if (!ch) continue

    channels[key] = {
      configured: !!ch.configured,
      linked: ch.linked ?? undefined,
      running: !!ch.running,
      connected: ch.connected ?? undefined,
      lastConnectedAt: ch.lastConnectedAt ?? null,
      lastMessageAt: ch.lastMessageAt ?? null,
      lastStartAt: ch.lastStartAt ?? null,
      lastError: ch.lastError ?? null,
      authAgeMs: ch.authAgeMs ?? null,
      mode: ch.mode ?? null,
      baseUrl: ch.baseUrl ?? null,
      publicKey: ch.publicKey ?? null,
      probe: ch.probe ?? null,
      profile: ch.profile ?? null,
    }

    const accounts = rawAccounts[key] || []
    const accountEntries = (Array.isArray(accounts) ? accounts : Object.values(accounts)) as GatewayData[]
    channelAccounts[key] = accountEntries.map((acct: GatewayData) => ({
      accountId: acct.accountId || 'default',
      name: acct.name ?? null,
      configured: acct.configured ?? null,
      linked: acct.linked ?? null,
      running: acct.running ?? null,
      connected: acct.connected ?? null,
      lastConnectedAt: acct.lastConnectedAt ?? null,
      lastInboundAt: acct.lastInboundAt ?? null,
      lastOutboundAt: acct.lastOutboundAt ?? null,
      lastError: acct.lastError ?? null,
      lastStartAt: acct.lastStartAt ?? null,
      mode: acct.mode ?? null,
      probe: acct.probe ?? null,
      publicKey: acct.publicKey ?? null,
      profile: acct.profile ?? null,
    }))
  }

  return {
    channels,
    channelAccounts,
    channelOrder: order,
    channelLabels,
    connected: true,
    updatedAt: data.ts,
  }
}

async function isGatewayReachable(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(`${gatewayInternalUrl}/api/health`, {
      headers: gatewayHeaders(),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

/**
 * GET /api/channels - Fetch channel status from the gateway
 * Supports ?action=probe&channel=<name> to probe a specific channel
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  // Probe a specific channel
  if (action === 'probe') {
    const channel = searchParams.get('channel')
    if (!channel) {
      return NextResponse.json({ error: 'channel parameter required' }, { status: 400 })
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const res = await fetch(`${gatewayInternalUrl}/api/channels/probe`, {
        method: 'POST',
        headers: gatewayHeaders(),
        body: JSON.stringify({ channel }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const data = await res.json()
      return NextResponse.json(data)
    } catch (err) {
      logger.warn({ err, channel }, 'Channel probe failed')
      return NextResponse.json(
        { ok: false, error: 'Gateway unreachable' },
        { status: 502 },
      )
    }
  }

  // Default: fetch all channel statuses
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(`${gatewayInternalUrl}/api/channels/status`, {
      headers: gatewayHeaders(),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const data = await res.json()
    return NextResponse.json(transformGatewayChannels(data))
  } catch (err) {
    logger.warn({ err }, 'Gateway unreachable for channel status')
    const reachable = await isGatewayReachable()
    return NextResponse.json({
      channels: {},
      channelAccounts: {},
      channelOrder: [],
      channelLabels: {},
      connected: reachable,
    } satisfies ChannelsSnapshot)
  }
}

/**
 * POST /api/channels - Platform-specific actions
 * Body: { action: string, ...params }
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => null)
  if (!body || !body.action) {
    return NextResponse.json({ error: 'action required' }, { status: 400 })
  }

  const { action } = body

  try {
    switch (action) {
      case 'whatsapp-link': {
        const force = body.force === true
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 30000)
        const res = await fetch(`${gatewayInternalUrl}/api/channels/whatsapp/link`, {
          method: 'POST',
          headers: gatewayHeaders(),
          body: JSON.stringify({ force }),
          signal: controller.signal,
        })
        clearTimeout(timeout)
        const data = await res.json()
        return NextResponse.json(data)
      }

      case 'whatsapp-wait': {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 120000)
        const res = await fetch(`${gatewayInternalUrl}/api/channels/whatsapp/wait`, {
          method: 'POST',
          headers: gatewayHeaders(),
          signal: controller.signal,
        })
        clearTimeout(timeout)
        const data = await res.json()
        return NextResponse.json(data)
      }

      case 'whatsapp-logout': {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000)
        const res = await fetch(`${gatewayInternalUrl}/api/channels/whatsapp/logout`, {
          method: 'POST',
          headers: gatewayHeaders(),
          signal: controller.signal,
        })
        clearTimeout(timeout)
        const data = await res.json()
        return NextResponse.json(data)
      }

      case 'nostr-profile-save': {
        const accountId = body.accountId || 'default'
        const profile = body.profile
        if (!profile) {
          return NextResponse.json({ error: 'profile required' }, { status: 400 })
        }
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000)
        const res = await fetch(
          `${gatewayInternalUrl}/api/channels/nostr/${encodeURIComponent(accountId)}/profile`,
          {
            method: 'PUT',
            headers: gatewayHeaders(),
            body: JSON.stringify(profile),
            signal: controller.signal,
          },
        )
        clearTimeout(timeout)
        const data = await res.json()
        return NextResponse.json(data, { status: res.ok ? 200 : res.status })
      }

      case 'nostr-profile-import': {
        const accountId = body.accountId || 'default'
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000)
        const res = await fetch(
          `${gatewayInternalUrl}/api/channels/nostr/${encodeURIComponent(accountId)}/profile/import`,
          {
            method: 'POST',
            headers: gatewayHeaders(),
            body: JSON.stringify({ autoMerge: true }),
            signal: controller.signal,
          },
        )
        clearTimeout(timeout)
        const data = await res.json()
        return NextResponse.json(data, { status: res.ok ? 200 : res.status })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    logger.warn({ err, action }, 'Channel action failed')
    return NextResponse.json(
      { ok: false, error: 'Gateway unreachable' },
      { status: 502 },
    )
  }
}
