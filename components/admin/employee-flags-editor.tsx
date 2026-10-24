"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export interface EmployeeFlags {
  specialist_level: "specialist" | "chief_specialist" | null
  department: string | null
  is_department_head: boolean
  is_loan_committee_member: boolean
  is_claims_committee_member: boolean
  is_committee_secretary: boolean
  product_tags: string[]
}

export function employeeFlagsFromProfile(profile: Partial<EmployeeFlags>): EmployeeFlags {
  return {
    specialist_level: profile.specialist_level ?? null,
    department: profile.department ?? null,
    is_department_head: profile.is_department_head ?? false,
    is_loan_committee_member: profile.is_loan_committee_member ?? false,
    is_claims_committee_member: profile.is_claims_committee_member ?? false,
    is_committee_secretary: profile.is_committee_secretary ?? false,
    product_tags: profile.product_tags ?? [],
  }
}

const toggles = [
  ["is_department_head", "Department head"],
  ["is_loan_committee_member", "Loan committee member"],
  ["is_claims_committee_member", "Claims committee member"],
  ["is_committee_secretary", "Committee secretary"],
] as const

export function EmployeeFlagsEditor({ value, onChange, tagsText, onTagsChange, disabled }: {
  value: EmployeeFlags
  onChange: (value: EmployeeFlags) => void
  tagsText: string
  onTagsChange: (value: string) => void
  disabled: boolean
}) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">Employee responsibilities</legend>
      <p className="text-sm text-muted-foreground">These flags supplement the employee&apos;s role. Only a different system administrator can change them.</p>
      <Label htmlFor="employee-department">Department</Label>
      <Input id="employee-department" maxLength={100} value={value.department ?? ""} onChange={(e) => onChange({ ...value, department: e.target.value || null })} />
      <Label htmlFor="employee-level">Specialist level</Label>
      <Select disabled={disabled} value={value.specialist_level ?? "none"} onValueChange={(level) => onChange({ ...value, specialist_level: level === "none" ? null : level as EmployeeFlags["specialist_level"] })}>
        <SelectTrigger id="employee-level"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>
          <SelectItem value="none">Not specified</SelectItem>
          <SelectItem value="specialist">Specialist</SelectItem>
          <SelectItem value="chief_specialist">Chief specialist</SelectItem>
        </SelectGroup></SelectContent>
      </Select>
      {toggles.map(([key, label]) => (
        <div key={key} className="flex items-center justify-between gap-4">
          <Label htmlFor={`employee-${key}`}>{label}</Label>
          <Switch id={`employee-${key}`} disabled={disabled} checked={value[key]} onCheckedChange={(checked) => onChange({ ...value, [key]: checked })} />
        </div>
      ))}
      <Label htmlFor="employee-products">Product tags</Label>
      <Input id="employee-products" value={tagsText} onChange={(e) => onTagsChange(e.target.value)} aria-describedby="employee-products-help" />
      <p id="employee-products-help" className="text-sm text-muted-foreground">Separate tags with commas. Maximum 30 tags, 80 characters each.</p>
    </fieldset>
  )
}
