import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Network as NetworkIcon,
  Server as ServerIcon,
  Play,
  Square,
  RotateCcw,
  KeyRound,
  ShieldCheck,
  Link2,
  Copy,
  Check,
  Globe,
  Users,
  Database,
  RefreshCcw
} from 'lucide-react'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import Input from '../../components/ui/Input'
import type { ServerStatus, NetworkAccessInfo, ApiTokenInfo } from '@shared/types'
import { errorMessage, serverLabel } from '../../lib/utils'

const DEFAULT_PORT = 47821

export default function Network() {
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [access, setAccess] = useState<NetworkAccessInfo | null>(null)
  const [tokenInfo, setTokenInfo] = useState<ApiTokenInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [portInput, setPortInput] = useState(String(DEFAULT_PORT))
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [server, firewall, token] = await Promise.all([
        window.api.network.status(),
        window.api.network.firewall(),
        window.api.network.tokenInfo()
      ])
      setStatus(server)
      setAccess(firewall)
      setTokenInfo(token)
      if (tokenInfo === null) setPortInput(String(server.apiPort || DEFAULT_PORT))
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }, [tokenInfo])

  useEffect(() => {
    void refresh()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [refresh])

  useEffect(() => {
    if (status?.running) {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => {
          window.api.network.status().then(setStatus).catch(() => undefined)
        }, 5000)
      }
    } else if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [status?.running])

  useEffect(() => {
    if (status) setPortInput(String(status.apiPort || DEFAULT_PORT))
  }, [status?.apiPort]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (op: () => Promise<ServerStatus | void>) => {
    setBusy(true)
    setMsg(null)
    try {
      await op()
      setRevealedToken(null)
      await refresh()
      setMsg({ type: 'ok', text: 'Server updated.' })
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const applyPort = () => {
    const port = Math.min(65535, Math.max(1, Number.parseInt(portInput, 10)))
    if (Number.isNaN(port)) {
      setMsg({ type: 'error', text: 'Enter a valid port number.' })
      return
    }
    void run(() => window.api.network.setPort(port))
  }

  const regenerateToken = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await window.api.network.regenerateToken()
      setRevealedToken(res.token)
      setTokenInfo(res.info)
      setMsg({ type: 'ok', text: 'New access token generated. Copy it now — it will not be shown again.' })
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setMsg({ type: 'error', text: 'Could not copy to clipboard.' })
    }
  }

  if (loading) return <Spinner label="Loading server status…" full />

  const running = status?.running === true
  const connectLabel = status ? serverLabel(status.host || '127.0.0.1', status.apiPort) : ''

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <NetworkIcon className="h-6 w-6 text-primary-500" /> Network Server
          </h1>
          <p className="text-sm text-muted">Share this library catalog with User computers on your network.</p>
        </div>
        {running ? <Badge tone="success" icon={ServerIcon}>Online</Badge> : <Badge tone="danger" icon={Square}>Offline</Badge>}
      </div>

      {msg && (
        <p className={`rounded-lg px-4 py-3 text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300'}`}>
          {msg.text}
        </p>
      )}

      {/* Status */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon={Database} label="Database" value={status?.databaseConnected ? 'Connected' : 'Disconnected'} ok={status?.databaseConnected} />
        <StatTile icon={Globe} label="API Version" value={status?.apiVersion ?? '—'} ok />
        <StatTile icon={Users} label="Connected Users" value={running ? String(status?.connectedUsers ?? 0) : '—'} ok={running} />
        <StatTile icon={ServerIcon} label="Library" value={status?.library ?? '—'} ok={running} />
      </section>

      {/* Controls */}
      <section className="rounded-xl border border-slate-200 bg-surface p-6 shadow-card dark:border-slate-700">
        <h2 className="mb-4 text-base font-semibold text-foreground">Server Controls</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void run(() => window.api.network.start())}
            loading={busy}
            disabled={running}
            icon={<Play className="h-4 w-4" />}
          >
            Start Server
          </Button>
          <Button variant="outline" onClick={() => void run(() => window.api.network.stop())} loading={busy} disabled={!running} icon={<Square className="h-4 w-4" />}>
            Stop
          </Button>
          <Button variant="secondary" onClick={() => void run(() => window.api.network.restart())} loading={busy} disabled={!running} icon={<RotateCcw className="h-4 w-4" />}>
            Restart
          </Button>
          <Button variant="ghost" onClick={() => void refresh()} icon={<RefreshCcw className="h-4 w-4" />}>
            Refresh
          </Button>
        </div>

        {running && (
          <div className="mt-5 space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-foreground">Port</p>
              <div className="flex max-w-xs items-center gap-2">
                <Input type="number" min={1} max={65535} value={portInput} onChange={(e) => setPortInput(e.target.value)} className="font-mono" />
                <Button size="sm" onClick={applyPort} loading={busy}>Apply</Button>
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-foreground">Addresses</p>
              <ul className="space-y-1">
                {status?.lanAddresses.map((addr) => (
                  <li key={addr} className="flex items-center gap-2 font-mono text-sm text-foreground">
                    <Link2 className="h-3.5 w-3.5 text-primary-500" />
                    {addr}
                    <button
                      type="button"
                      onClick={() => void copyText(serverLabel(addr, status.apiPort))}
                      className="ring-focus rounded p-1 text-muted hover:bg-slate-100 dark:hover:bg-slate-800"
                      aria-label={`Copy ${addr}`}
                      title="Copy connection address"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                User computers connect using <span className="font-mono">{connectLabel}</span> and the access token below.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Access token */}
      <section className="rounded-xl border border-slate-200 bg-surface p-6 shadow-card dark:border-slate-700">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-foreground">
          <KeyRound className="h-4 w-4 text-primary-500" /> Access Token
        </h2>
        <p className="mb-4 text-sm text-muted">
          User computers must present this token to connect. Regenerate it if you think it has been compromised — existing
          connections will stop working.
        </p>

        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">Status:</span>
            {access?.accessTokenConfigured ? (
              <Badge tone="success" icon={ShieldCheck}>Configured{tokenInfo?.label ? ` · ${tokenInfo.label}` : ''}</Badge>
            ) : (
              <Badge tone="danger">Not configured yet</Badge>
            )}
          </div>

          {tokenInfo?.created_at && (
            <p className="text-xs text-muted">
              Created {new Date(tokenInfo.created_at).toLocaleString()}
              {tokenInfo.last_used_at ? ` · last used ${new Date(tokenInfo.last_used_at).toLocaleString()}` : ' · never used'}
            </p>
          )}

          {revealedToken && (
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70">
              <p className="mb-1 text-xs font-semibold text-foreground">New access token (shown once)</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all font-mono text-sm text-primary-700 dark:text-primary-300">{revealedToken}</code>
                <button type="button" onClick={() => void copyText(revealedToken)} className="ring-focus shrink-0 rounded-md p-1.5 text-muted hover:bg-slate-200 dark:hover:bg-slate-700" aria-label="Copy token">
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          <Button onClick={regenerateToken} loading={busy} icon={<KeyRound className="h-4 w-4" />} variant={access?.accessTokenConfigured ? 'outline' : 'primary'}>
            {access?.accessTokenConfigured ? 'Regenerate Token' : 'Generate Token'}
          </Button>
        </div>
      </section>

      {/* Firewall */}
      <section className="rounded-xl border border-slate-200 bg-surface p-6 shadow-card dark:border-slate-700">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary-500" /> Windows Firewall
        </h2>
        <p className="mb-4 text-sm text-muted">
          To let other computers connect, allow inbound traffic on the server port. Run the following command in an
          <span className="font-medium text-foreground"> elevated</span> terminal:
        </p>
        {access?.suggestedFirewallCommand ? (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70">
            <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">{access.suggestedFirewallCommand}</code>
            <button type="button" onClick={() => void copyText(access.suggestedFirewallCommand!)} className="ring-focus shrink-0 rounded-md p-1.5 text-muted hover:bg-slate-200 dark:hover:bg-slate-700" aria-label="Copy firewall command">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">No firewall command available while the server is using dynamic settings.</p>
        )}
      </section>
    </div>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  ok
}: {
  icon: React.ElementType
  label: string
  value: string
  ok?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-surface p-4 shadow-card dark:border-slate-700">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted">{label}</p>
        <Icon className="h-4 w-4 text-primary-500" />
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-foreground">{value}</p>
      {ok !== undefined && <p className={`mt-0.5 text-xs font-medium ${ok ? 'text-green-600' : 'text-red-500'}`}>{ok ? '●' : '○'}</p>}
    </div>
  )
}