'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GraphCanvas, GraphCanvasRef, type Theme, type GraphNode as ReagraphNode, type GraphEdge as ReagraphEdge, type InternalGraphNode } from 'reagraph'
import { Button } from '@/components/ui/button'
import { useMissionControl } from '@/store'

// --- Data interfaces (match API response) ---

interface AgentFileInfo {
  path: string
  chunks: number
  textSize: number
}

interface AgentGraphData {
  name: string
  dbSize: number
  totalChunks: number
  totalFiles: number
  files: AgentFileInfo[]
}

// --- Color palette ---

const AGENT_COLORS = [
  '#22d3ee', // cyan
  '#f59e0b', // amber
  '#a78bfa', // violet
  '#34d399', // mint
  '#f87171', // crimson
  '#60a5fa', // blue
  '#f472b6', // pink
  '#4ade80', // green
  '#facc15', // yellow
  '#c084fc', // purple
  '#fb923c', // orange
  '#2dd4bf', // teal
  '#a3e635', // lime
  '#e879f9', // fuchsia
  '#38bdf8', // sky
  '#818cf8', // indigo
  '#fbbf24', // gold
]

function getFileColor(filePath: string): string {
  if (filePath.startsWith('sessions/') || filePath.includes('/sessions/')) return '#22d3ee'
  if (filePath.startsWith('memory/') || filePath.includes('/memory/')) return '#34d399'
  if (filePath.startsWith('knowledge') || filePath.includes('/knowledge')) return '#818cf8'
  if (filePath.endsWith('.md')) return '#f59e0b'
  if (filePath.endsWith('.json') || filePath.endsWith('.jsonl')) return '#a78bfa'
  return '#60a5fa'
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// --- Obsidian-style theme ---

const obsidianTheme: Theme = {
  canvas: {
    background: '#0a0e14',
    fog: '#0a0e14',
  },
  node: {
    fill: '#6366f1',
    activeFill: '#a78bfa',
    opacity: 1,
    selectedOpacity: 1,
    inactiveOpacity: 0.08,
    label: {
      color: '#e2e8f0',
      stroke: '#000000',
      activeColor: '#ffffff',
    },
  },
  ring: {
    fill: '#6366f1',
    activeFill: '#a78bfa',
  },
  edge: {
    fill: '#334155',
    activeFill: '#a78bfa',
    opacity: 0.12,
    selectedOpacity: 0.6,
    inactiveOpacity: 0.03,
    label: {
      color: '#94a3b8',
      activeColor: '#e2e8f0',
    },
  },
  arrow: {
    fill: '#334155',
    activeFill: '#a78bfa',
  },
  lasso: {
    background: 'rgba(99, 102, 241, 0.1)',
    border: 'rgba(99, 102, 241, 0.3)',
  },
}

// --- Component ---

export function MemoryGraph() {
  const { memoryGraphAgents, setMemoryGraphAgents } = useMissionControl()
  const agents = memoryGraphAgents || []
  const [selectedAgent, setSelectedAgent] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(memoryGraphAgents === null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFile, setSelectedFile] = useState<AgentFileInfo | null>(null)
  const [actives, setActives] = useState<string[]>([])

  const graphRef = useRef<GraphCanvasRef | null>(null)

  // Fetch data
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/memory/graph?agent=all')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setMemoryGraphAgents(data.agents || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setIsLoading(false)
    }
  }, [setMemoryGraphAgents])

  useEffect(() => {
    // Skip fetch if we already have cached data from a previous mount
    if (memoryGraphAgents !== null) return
    fetchData()
  }, [fetchData, memoryGraphAgents])

  // Stats
  const stats = useMemo(() => {
    const totalAgents = agents.length
    const totalFiles = agents.reduce((s, a) => s + a.totalFiles, 0)
    const totalChunks = agents.reduce((s, a) => s + a.totalChunks, 0)
    const totalSize = agents.reduce((s, a) => s + a.dbSize, 0)
    return { totalAgents, totalFiles, totalChunks, totalSize }
  }, [agents])

  // Build reagraph nodes/edges from API data
  const { graphNodes, graphEdges } = useMemo(() => {
    if (!agents.length) return { graphNodes: [], graphEdges: [] }

    const nodes: ReagraphNode[] = []
    const edges: ReagraphEdge[] = []

    if (selectedAgent === 'all') {
      agents.forEach((agent, i) => {
        const color = AGENT_COLORS[i % AGENT_COLORS.length]
        const hubSize = Math.max(5, Math.min(15, 4 + Math.sqrt(agent.totalChunks) * 0.8))

        nodes.push({
          id: `hub-${agent.name}`,
          label: agent.name,
          subLabel: `${agent.totalChunks} chunks`,
          fill: color,
          size: hubSize,
        })

        const maxFiles = 30
        const files = agent.files.slice(0, maxFiles)
        files.forEach((file, fi) => {
          const fileSize = Math.max(2, Math.min(6, 1.5 + Math.sqrt(file.chunks) * 0.7))
          const fileColor = getFileColor(file.path)
          const nodeId = `file-${agent.name}-${fi}`

          nodes.push({
            id: nodeId,
            label: file.path.split('/').pop() || file.path,
            fill: fileColor,
            size: fileSize,
            data: { filePath: file.path, chunks: file.chunks, textSize: file.textSize, agentName: agent.name },
          })

          edges.push({
            id: `edge-hub-${agent.name}-${nodeId}`,
            source: `hub-${agent.name}`,
            target: nodeId,
            fill: color,
          })
        })
      })
    } else {
      const agent = agents.find((a) => a.name === selectedAgent)
      if (!agent) return { graphNodes: [], graphEdges: [] }

      const agentIdx = agents.indexOf(agent)
      const color = AGENT_COLORS[agentIdx % AGENT_COLORS.length]
      const hubSize = Math.max(6, Math.min(18, 5 + Math.sqrt(agent.totalChunks) * 0.8))

      nodes.push({
        id: `hub-${agent.name}`,
        label: agent.name,
        subLabel: `${agent.totalChunks} chunks / ${agent.totalFiles} files`,
        fill: color,
        size: hubSize,
      })

      let files = agent.files
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        files = files.filter((f) => f.path.toLowerCase().includes(q))
      }

      const maxFiles = 120
      const displayFiles = files.slice(0, maxFiles)

      displayFiles.forEach((file, fi) => {
        const fileSize = Math.max(2, Math.min(8, 2 + Math.sqrt(file.chunks) * 0.8))
        const fileColor = getFileColor(file.path)
        const nodeId = `file-${agent.name}-${fi}`

        nodes.push({
          id: nodeId,
          label: file.path.split('/').pop() || file.path,
          fill: fileColor,
          size: fileSize,
          data: { filePath: file.path, chunks: file.chunks, textSize: file.textSize, agentName: agent.name },
        })

        edges.push({
          id: `edge-hub-${agent.name}-${nodeId}`,
          source: `hub-${agent.name}`,
          target: nodeId,
          fill: color,
        })
      })

      // Weak inter-file edges for same-directory clustering
      const dirMap = new Map<string, string[]>()
      displayFiles.forEach((file, fi) => {
        const dir = file.path.split('/').slice(0, -1).join('/')
        if (!dir) return
        const nodeId = `file-${agent.name}-${fi}`
        if (!dirMap.has(dir)) dirMap.set(dir, [])
        dirMap.get(dir)!.push(nodeId)
      })
      for (const ids of dirMap.values()) {
        for (let i = 0; i < ids.length - 1 && i < 5; i++) {
          edges.push({
            id: `edge-dir-${ids[i]}-${ids[i + 1]}`,
            source: ids[i],
            target: ids[i + 1],
          })
        }
      }
    }

    return { graphNodes: nodes, graphEdges: edges }
  }, [agents, selectedAgent, searchQuery])

  // Interaction handlers
  const handleNodeClick = useCallback((node: InternalGraphNode) => {
    const id = node.id
    if (id.startsWith('hub-') && selectedAgent === 'all') {
      const agentName = id.replace('hub-', '')
      setSelectedAgent(agentName)
      setSelectedFile(null)
      setSearchQuery('')
      setActives([])
    } else if (id.startsWith('file-') && node.data) {
      const { filePath, chunks, textSize } = node.data as { filePath: string; chunks: number; textSize: number }
      setSelectedFile({ path: filePath, chunks, textSize })
    }
  }, [selectedAgent])

  const handleNodeHover = useCallback((node: InternalGraphNode) => {
    setActives([node.id])
  }, [])

  const handleNodeUnhover = useCallback(() => {
    setActives([])
  }, [])

  const handleCanvasClick = useCallback(() => {
    setActives([])
    setSelectedFile(null)
  }, [])

  // --- Render ---

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        <span className="ml-3 text-muted-foreground">Loading memory graph...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <span className="text-red-400 mb-2">Failed to load memory graph</span>
        <span className="text-sm">{error}</span>
        <Button onClick={fetchData} className="mt-4" variant="secondary" size="sm">
          Retry
        </Button>
      </div>
    )
  }

  if (!agents.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <span>No memory databases found</span>
        <span className="text-xs mt-1">OpenClaw memory SQLite files not detected</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Controls bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground font-mono">AGENT:</label>
          <select
            value={selectedAgent}
            onChange={(e) => {
              setSelectedAgent(e.target.value)
              setSelectedFile(null)
              setSearchQuery('')
              setActives([])
            }}
            className="px-2 py-1 text-sm bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            <option value="all">All Agents ({stats.totalAgents})</option>
            {agents.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name} ({a.totalChunks} chunks)
              </option>
            ))}
          </select>
        </div>

        {selectedAgent !== 'all' && (
          <>
            <Button
              onClick={() => {
                setSelectedAgent('all')
                setSelectedFile(null)
                setSearchQuery('')
                setActives([])
              }}
              variant="secondary"
              size="sm"
            >
              Back to Overview
            </Button>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter files..."
              className="px-2 py-1 text-sm bg-surface-1 border border-border rounded-md text-foreground placeholder-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 w-48"
            />
          </>
        )}

        <span className="text-[10px] text-muted-foreground/50 font-mono ml-auto">
          hover to highlight / click hub to drill in / scroll to zoom
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-surface-1 border border-border rounded-md px-3 py-2">
          <div className="text-lg font-bold text-foreground font-mono">{stats.totalAgents}</div>
          <div className="text-xs text-muted-foreground">Agents</div>
        </div>
        <div className="bg-surface-1 border border-border rounded-md px-3 py-2">
          <div className="text-lg font-bold text-foreground font-mono">{stats.totalFiles.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Source Files</div>
        </div>
        <div className="bg-surface-1 border border-border rounded-md px-3 py-2">
          <div className="text-lg font-bold text-foreground font-mono">{stats.totalChunks.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Total Chunks</div>
        </div>
        <div className="bg-surface-1 border border-border rounded-md px-3 py-2">
          <div className="text-lg font-bold text-foreground font-mono">{formatBytes(stats.totalSize)}</div>
          <div className="text-xs text-muted-foreground">DB Size</div>
        </div>
      </div>

      {/* Graph canvas */}
      <div className="relative flex-1 min-h-0 border border-border rounded-lg overflow-hidden" style={{ minHeight: '400px' }}>
        <GraphCanvas
          ref={graphRef}
          nodes={graphNodes}
          edges={graphEdges}
          theme={obsidianTheme}
          layoutType="forceDirected2d"
          layoutOverrides={{
            linkDistance: 100,
            nodeStrength: -80,
          }}
          labelType="auto"
          edgeArrowPosition="none"
          animated={true}
          draggable={true}
          defaultNodeSize={5}
          minNodeSize={2}
          maxNodeSize={15}
          cameraMode="pan"
          actives={actives}
          onNodeClick={handleNodeClick}
          onNodePointerOver={handleNodeHover}
          onNodePointerOut={handleNodeUnhover}
          onCanvasClick={handleCanvasClick}
        />
      </div>

      {/* Selected file detail */}
      {selectedFile && (
        <div className="bg-surface-1 border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground font-mono">{selectedFile.path}</h3>
            <Button onClick={() => setSelectedFile(null)} variant="ghost" size="sm">
              Close
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Chunks:</span>{' '}
              <span className="text-foreground font-mono">{selectedFile.chunks}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Text Size:</span>{' '}
              <span className="text-foreground font-mono">{formatBytes(selectedFile.textSize)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
