import { useEffect, useState } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'
import Button from './Button'

interface GitHubConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void> | void
  title: string
  description?: string
  matchText: string
  confirmButtonText?: string
}

export default function GitHubConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  matchText,
  confirmButtonText = 'Delete'
}: GitHubConfirmModalProps) {
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTyped('')
      setError(null)
      setLoading(false)
    }
  }, [open])

  if (!open) return null

  const isMatch = typed.trim() === matchText.trim()

  const handleConfirm = async () => {
    if (!isMatch || loading) return
    setLoading(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="animate-fade-in w-full max-w-lg overflow-hidden rounded-2xl border border-red-200 bg-surface shadow-lifted"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-red-100 bg-red-50/70 px-6 py-4">
          <div className="flex items-center gap-2.5 text-red-700">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <h3 className="text-base font-bold text-red-900">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            className="ring-focus rounded-lg p-1.5 text-muted hover:bg-red-100/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 px-6 py-5">
          <div className="rounded-xl border border-red-100 bg-red-50/40 p-3.5 text-sm text-red-800">
            <p className="font-semibold">This action cannot be undone.</p>
            <p className="mt-1 text-xs text-red-700/90 leading-relaxed">
              {description || `This will permanently delete this item and remove all of its associated records.`}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Please type <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-bold text-red-600 select-all border border-slate-200">{matchText}</span> to confirm:
            </label>
            <input
              type="text"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={loading}
              placeholder={`Type "${matchText}"`}
              className="ring-focus mt-2 w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:border-red-500 focus:ring-red-500/20"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={!isMatch || loading}
            loading={loading}
            onClick={handleConfirm}
            icon={<Trash2 className="h-4 w-4" />}
          >
            {confirmButtonText}
          </Button>
        </div>
      </div>
    </div>
  )
}
