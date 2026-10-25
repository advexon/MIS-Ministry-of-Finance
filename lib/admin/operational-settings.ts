export const OPERATIONAL_SETTINGS = [
  { key: 'direct_officer_submission', label: 'Direct bank-officer submission', unit: 'Enabled', kind: 'boolean', fallback: 'false', description: 'If disabled, a bank manager must submit the file. Applies to the next submission.' },
  { key: 'pipeline_max_guarantee_tjs', label: 'Maximum guarantee', unit: 'TJS (0 = no cap)', kind: 'number', fallback: '0', min: 0, max: 1e12, description: 'Stop-factor limit checked when an application is submitted or resubmitted.' },
  { key: 'committee_operations_members', label: 'Loan committee operations seats', unit: 'members', kind: 'number', fallback: '3', min: 2, max: 3, description: 'Two or three operational members; applies only to future sittings.' },
  { key: 'committee_director_threshold_tjs', label: 'Director participation threshold', unit: 'TJS', kind: 'number', fallback: '1000000', min: 0.01, max: 1e12, description: 'Director participation above this amount. Claims use original issued loan terms; existing sittings retain their threshold.' },
  { key: 'risk_review_threshold_usd', label: 'Mandatory Credit Risk threshold', unit: 'USD', kind: 'number', fallback: '10000', min: 0, max: 1e12, description: 'Higher exposures require Credit Risk review. Elevated/high risk and unknown exposure always require review.' },
  { key: 'assessment_sla_days', label: 'Assessment deadline', unit: 'calendar days', kind: 'number', fallback: '1', min: 1, max: 30, description: 'Recorded on the next assessment; existing assessment deadlines do not change.' },
  { key: 'committee_voting_days', label: 'Loan committee voting deadline', unit: 'working days', kind: 'number', fallback: '1', min: 1, max: 30, description: 'Applied to future loan sittings, excluding weekends. Does not rewrite existing deadlines.' },
  { key: 'notify_loan_submitted', label: 'Application assignment notifications', unit: 'Enabled', kind: 'boolean', fallback: 'true', description: 'Controls the in-app assignment alert, not the workflow task or required evidence.' },
  { key: 'notify_claim_submitted', label: 'Claim submission notifications', unit: 'Enabled', kind: 'boolean', fallback: 'true', description: 'Controls the in-app claim-submission alert to Fund operations staff.' },
  { key: 'notify_loan_reviewed', label: 'Application outcome notifications', unit: 'Enabled', kind: 'boolean', fallback: 'true', description: 'Controls in-app approval, rejection and issued-guarantee alerts to the bank.' },
] as const

export type OperationalSettings = Record<string, string>
export const OPERATIONAL_DEFAULTS: OperationalSettings = Object.fromEntries(OPERATIONAL_SETTINGS.map((setting) => [setting.key, setting.fallback]))

export function effectiveOperationalValues(raw: OperationalSettings): OperationalSettings {
  const result = { ...OPERATIONAL_DEFAULTS, ...raw }
  for (const setting of OPERATIONAL_SETTINGS) {
    if (setting.kind !== 'boolean' || result[setting.key] === 'true' || result[setting.key] === 'false') continue
    try { result[setting.key] = String((JSON.parse(result[setting.key]) as { enabled?: boolean }).enabled ?? true) }
    catch { result[setting.key] = setting.fallback }
  }
  return result
}

export function validateOperationalValue(key: string, value: string): boolean {
  const setting = OPERATIONAL_SETTINGS.find((item) => item.key === key)
  if (!setting) return false
  if (setting.kind === 'boolean') return value === 'true' || value === 'false'
  const number = Number(value)
  if (!value.trim() || !Number.isFinite(number) || number < setting.min || number > setting.max) return false
  return !['assessment_sla_days', 'committee_voting_days', 'committee_operations_members'].includes(key) || Number.isInteger(number)
}
