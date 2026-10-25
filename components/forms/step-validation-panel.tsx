import { AlertCircle } from "lucide-react"
import type { StepStatus } from "@/lib/hooks/use-loan-form-validation"

interface StepValidationPanelProps {
  step: StepStatus["step"]
  stepsStatus: readonly StepStatus[]
  hasTouchedFields: boolean
}

// Per-step validation panel rendered inside each tab.
export function StepValidationPanel({ step, stepsStatus, hasTouchedFields }: StepValidationPanelProps) {
  const status = stepsStatus.find((entry) => entry.step === step)
  if (!status || status.errors.length === 0 || !hasTouchedFields) return null

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="text-sm font-semibold">
          {status.errors.length === 1
            ? "Please complete this required field"
            : `Please complete these ${status.errors.length} required fields`}
        </span>
      </div>
      <ul className="flex flex-col gap-1 pl-6">
        {status.errors.map((error) => (
          <li key={error.field} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
            <span>
              <span className="font-medium text-destructive">{error.label}:</span>{" "}
              <span className="text-destructive/80">{error.error}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
