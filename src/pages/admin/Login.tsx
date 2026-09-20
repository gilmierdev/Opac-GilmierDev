import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Lock, KeyRound, UserRound, Eye, EyeOff, ShieldCheck, LibraryBig } from 'lucide-react'
import { useAppStore } from '../../stores/app'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { imageUrl, errorMessage } from '../../lib/utils'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }
  const settings = useAppStore((s) => s.settings)

  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'loading' | 'setup' | 'login'>('loading')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.auth
      .needsSetup()
      .then((needsSetup) => setMode(needsSetup ? 'setup' : 'login'))
      .catch(() => setMode('login'))
      .finally(() => setLoading(false))
  }, [])

  const logo = imageUrl(settings.library_logo)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'setup') {
        if (password.length < 8) {
          setError('Password must be at least 8 characters.')
          return
        }
        if (password !== confirm) {
          setError('Passwords do not match.')
          return
        }
        const user = await window.api.auth.setup({ username, password, full_name: fullName || null })
        useAppStore.getState().setUser(user)
      } else {
        const user = await window.api.auth.login(username, password)
        useAppStore.getState().setUser(user)
      }
      navigate(location.state?.from ?? '/admin', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <Spinner label="Loading..." />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {logo ? (
            <img src={logo} alt="Library logo" className="h-16 w-16 rounded-2xl object-cover shadow-card" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 shadow-card">
              <LibraryBig className="h-8 w-8 text-white" />
            </div>
          )}
          <h1 className="mt-3 text-xl font-bold text-foreground">{settings.library_name}</h1>
          <p className="text-sm text-muted">
            {mode === 'setup' ? 'Create the administrator account' : 'Administrator sign in'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-surface p-6 shadow-lifted dark:border-slate-700"
        >
          {mode === 'setup' && (
            <Input
              label="Full Name"
              name="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Librarian name (optional)"
              autoComplete="name"
            />
          )}
          <Input
            label="Username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            required
            autoComplete="username"
            icon={<UserRound className="h-4 w-4" />}
          />
          <div className="relative">
            <Input
              label="Password"
              name="password"
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'setup' ? 'At least 8 characters' : '••••••••'}
              required
              autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
              icon={<KeyRound className="h-4 w-4" />}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="ring-focus absolute right-3 top-[34px] text-muted hover:text-foreground"
              aria-label={showPass ? 'Hide password' : 'Show password'}
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {mode === 'setup' && (
            <Input
              label="Confirm Password"
              name="confirm"
              type={showPass ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
              required
              autoComplete="new-password"
            />
          )}

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}

          <Button type="submit" className="mt-4 w-full" disabled={busy} icon={<ShieldCheck className="h-4 w-4" />}>
            {busy ? 'Please wait…' : mode === 'setup' ? 'Create Account & Continue' : 'Sign In'}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          <Link to="/" className="ring-focus inline-flex items-center gap-1 hover:text-foreground">
            <Lock className="h-3 w-3" /> Back to catalog
          </Link>
        </p>
      </div>
    </div>
  )
}