import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Server, KeyRound, PlugZap, CheckCircle2, XCircle, Loader2, LibraryBig } from 'lucide-react'
import { useAppStore } from '../../stores/app'
import { cleanServerHost, errorMessage, serverLabel } from '../../lib/utils'
import type { ConnectionStatus } from '@shared/types'

const DEFAULT_PORT = 47821

export default function Connect() {
  const navigate = useNavigate()
  const savedConnection = useAppStore((s) => s.connection)

  const [host, setHost] = useState(() => savedConnection?.host ?? '127.0.0.1')
  const [port, setPort] = useState(() => String(savedConnection?.port ?? DEFAULT_PORT))
  const [token, setToken] = useState(() => savedConnection?.token ?? '')
  const [testing, setTesting] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parsedPort = Math.min(65535, Math.max(1, Number.parseInt(port, 10) || DEFAULT_PORT))
  const canSubmit = cleanServerHost(host).length > 0 && token.trim().length > 0 && !testing && !connecting

  const validate = (): boolean => {
    if (!cleanServerHost(host)) {
      setError('Please enter the library server address.')
      return false
    }
    if (readyStatus()) {
      return true
    }
    if (!token.trim()) {
      setError('Please enter the access token provided by the library administrator.')
      return false
    }
    return true
  }

  function readyStatus(): boolean {
    return status?.ok === true
  }

  useEffect(() => {
    setStatus(null)
    setError(null)
  }, [host, port, token])

  const handleTest = async () => {
    setTesting(true)
    setError(null)
    setStatus(null)
    try {
      const result = await window.api.connection.test({
        host: cleanServerHost(host),
        port: parsedPort,
        token: token.trim()
      })
      setStatus(result)
      if (!result.ok) {
        setError(result.error ?? 'Could not reach the library server.')
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setTesting(false)
    }
  }

  const handleConnect = async () => {
    if (!validate()) return
    setConnecting(true)
    setError(null)
    try {
      await window.api.connection.save({
        host: cleanServerHost(host),
        port: parsedPort,
        token: token.trim()
      })
      useAppStore.getState().setConnection({
        host: cleanServerHost(host),
        port: parsedPort,
        token: token.trim()
      })
      navigate('/catalog', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-app px-6">
      <div className="animate-fade-in w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 shadow-lifted">
            <LibraryBig className="h-8 w-8 text-white" />
          </span>
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight text-foreground">Connect to your library</h1>
        <p className="mt-2 text-center text-sm text-muted">
          This computer runs the <span className="font-medium text-foreground">User</span> edition. Enter the details of
          your library&apos;s Admin server to browse its catalog.
        </p>

        <div className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-surface p-6 shadow-card dark:border-slate-700">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Server className="h-3.5 w-3.5 text-primary-500" /> Server address
            </span>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.10"
              className="ring-focus w-full rounded-lg border border-slate-300 bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-slate-400 focus:border-primary-500 dark:border-slate-600"
            />
          </label>

          <div className="grid grid-cols-[110px_1fr] gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-foreground">Port</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="ring-focus w-full rounded-lg border border-slate-300 bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary-500 dark:border-slate-600"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <KeyRound className="h-3.5 w-3.5 text-primary-500" /> Access token
              </span>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token from the library admin"
                className="ring-focus w-full rounded-lg border border-slate-300 bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-slate-400 focus:border-primary-500 dark:border-slate-600"
              />
            </label>
          </div>

          {status?.ok && (
            <div className="flex items-start gap-2 rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Connected to {status.library_name ?? 'your library'}</p>
                <p className="text-xs">
                  API {status.api_version ?? 'v1'}
                  {status.library_address ? ` · ${status.library_address}` : ''}
                </p>
              </div>
            </div>
          )}

          {status && !status.ok && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">
              <XCircle className="h-4 w-4 shrink-0" />
              {status.error ?? 'Could not reach the library server.'}
            </div>
          )}

          {error && !status?.ok && (
            <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleTest}
              disabled={!cleanServerHost(host) || testing || connecting}
              className="ring-focus inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-surface px-4 py-3 text-sm font-semibold text-foreground shadow-card transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              Test
            </button>
            <button
              type="button"
              onClick={handleConnect}
              disabled={!canSubmit}
              className="ring-focus inline-flex flex-[2] items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-card transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect to library'}
            </button>
          </div>

          {savedConnection && (
            <p className="pt-1 text-center text-xs text-muted">
              Currently connected to{' '}
              <span className="font-medium text-foreground">{serverLabel(savedConnection.host, savedConnection.port)}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}