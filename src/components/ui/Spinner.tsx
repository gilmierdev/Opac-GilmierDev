import { Loader2 } from 'lucide-react'

interface SpinnerProps {
  label?: string
  full?: boolean
}

export default function Spinner({ label, full = false }: SpinnerProps) {
  return (
    <div
      className={`flex items-center justify-center gap-2 text-muted ${full ? 'py-16' : 'py-8'}`}
      role="status"
    >
      <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}