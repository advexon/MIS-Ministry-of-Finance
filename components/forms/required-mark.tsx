export function RequiredMark({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-destructive">
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  )
}

export function missingFieldsMessage(labels: string[]) {
  return `Please fill in the required field${labels.length > 1 ? "s" : ""}: ${labels.join(", ")}`
}
