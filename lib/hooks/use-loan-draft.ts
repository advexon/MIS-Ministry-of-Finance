"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"

export interface LoanDraft {
  id: string
  user_id: string
  draft_name: string
  form_data: Record<string, any>
  current_step: string
  completion_percentage: number
  created_at: string
  updated_at: string
  expires_at: string
  is_auto_saved: boolean
}

export interface UseLoanDraftOptions {
  autoSaveInterval?: number // milliseconds
  autoSaveEnabled?: boolean
  onAutoSave?: () => void
  onError?: (error: string) => void
}

export function useLoanDraft(options: UseLoanDraftOptions = {}) {
  const {
    autoSaveInterval = 30000, // 30 seconds
    autoSaveEnabled = true,
    onAutoSave,
    onError,
  } = options

  const supabase = createClient()
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [drafts, setDrafts] = useState<LoanDraft[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null)
  const formDataRef = useRef<Record<string, any>>({})
  const currentStepRef = useRef<string>("borrower")

  // Calculate completion percentage based on filled required fields.
  // Derived from the form's own validation config so the percentage can
  // actually reach 100% and never counts fields that are optional.
  const calculateCompletion = useCallback((formData: Record<string, any>): number => {
    if (REQUIRED_FIELD_NAMES.length === 0) return 0

    const filledCount = REQUIRED_FIELD_NAMES.filter(field => {
      const value = formData[field]
      return value !== undefined && value !== null && value !== ""
    }).length

    return Math.round((filledCount / REQUIRED_FIELD_NAMES.length) * 100)
  }, [])

  // Save draft to database (gracefully handles missing table)
  const saveDraft = useCallback(async (
    formData: Record<string, any>,
    currentStep: string,
    draftName?: string,
    isAutoSave = false
  ): Promise<{ success: boolean; draftId?: string; error?: string }> => {
    setIsSaving(true)
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return { success: false, error: "User not authenticated" }
      }

      const completion = calculateCompletion(formData)
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30) // Drafts expire after 30 days

      const draftData = {
        user_id: user.id,
        draft_name: draftName || `Draft - ${formData.clientName || "Untitled"} - ${new Date().toLocaleDateString()}`,
        form_data: formData,
        current_step: currentStep,
        completion_percentage: completion,
        expires_at: expiresAt.toISOString(),
        is_auto_saved: isAutoSave,
        updated_at: new Date().toISOString(),
      }

      let result
      if (currentDraftId) {
        // Update existing draft
        const { data, error } = await supabase
          .from("loan_drafts")
          .update(draftData)
          .eq("id", currentDraftId)
          .select()
          .single()
        
        // If table doesn't exist, silently fail for auto-save
        if (error) {
          if (error.code === "42P01" && isAutoSave) {
            // Table doesn't exist - drafts feature not yet deployed
            return { success: false, error: "Draft feature not available" }
          }
          throw error
        }
        result = data
      } else {
        // Create new draft
        const { data, error } = await supabase
          .from("loan_drafts")
          .insert({
            ...draftData,
            created_at: new Date().toISOString(),
          })
          .select()
          .single()
        
        // If table doesn't exist, silently fail for auto-save
        if (error) {
          if (error.code === "42P01" && isAutoSave) {
            // Table doesn't exist - drafts feature not yet deployed
            return { success: false, error: "Draft feature not available" }
          }
          throw error
        }
        result = data
        setCurrentDraftId(result.id)
      }

      setLastSaved(new Date())
      if (isAutoSave && onAutoSave) {
        onAutoSave()
      }

      return { success: true, draftId: result.id }
    } catch (error: any) {
      // Gracefully handle missing table errors
      if (error?.code === "42P01") {
        // Table doesn't exist - drafts feature not yet deployed
        return { success: false, error: "Draft feature requires database migration" }
      }
      const errorMsg = error instanceof Error ? error.message : "Failed to save draft"
      if (onError && !isAutoSave) onError(errorMsg)
      return { success: false, error: errorMsg }
    } finally {
      setIsSaving(false)
    }
  }, [supabase, currentDraftId, calculateCompletion, onAutoSave, onError])

  // Load all drafts for current user
  const loadDrafts = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("loan_drafts")
        .select("*")
        .eq("user_id", user.id)
        .gt("expires_at", new Date().toISOString())
        .order("updated_at", { ascending: false })

      // Handle missing table gracefully
      if (error) {
        if (error.code === "42P01") {
          // Table doesn't exist - drafts feature not yet deployed
          setDrafts([])
          return
        }
        throw error
      }
      setDrafts(data || [])
    } catch (error: any) {
      if (error?.code === "42P01") {
        setDrafts([])
        return
      }
      const errorMsg = error instanceof Error ? error.message : "Failed to load drafts"
      if (onError) onError(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, onError])

  // Load a specific draft
  const loadDraft = useCallback(async (draftId: string): Promise<LoanDraft | null> => {
    try {
      const { data, error } = await supabase
        .from("loan_drafts")
        .select("*")
        .eq("id", draftId)
        .single()

      // Handle missing table gracefully
      if (error) {
        if (error.code === "42P01") {
          return null
        }
        throw error
      }
      setCurrentDraftId(data.id)
      return data
    } catch (error: any) {
      if (error?.code === "42P01") {
        return null
      }
      const errorMsg = error instanceof Error ? error.message : "Failed to load draft"
      if (onError) onError(errorMsg)
      return null
    }
  }, [supabase, onError])

  // Delete a draft
  const deleteDraft = useCallback(async (draftId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("loan_drafts")
        .delete()
        .eq("id", draftId)

      if (error) {
        if (error.code === "42P01") {
          return false
        }
        throw error
      }
      
      if (currentDraftId === draftId) {
        setCurrentDraftId(null)
      }
      
      setDrafts(prev => prev.filter(d => d.id !== draftId))
      return true
    } catch (error: any) {
      if (error?.code === "42P01") {
        return false
      }
      const errorMsg = error instanceof Error ? error.message : "Failed to delete draft"
      if (onError) onError(errorMsg)
      return false
    }
  }, [supabase, currentDraftId, onError])

  // Start auto-save timer
  const startAutoSave = useCallback((formData: Record<string, any>, currentStep: string) => {
    formDataRef.current = formData
    currentStepRef.current = currentStep

    if (autoSaveTimer.current) {
      clearInterval(autoSaveTimer.current)
    }

    if (autoSaveEnabled) {
      autoSaveTimer.current = setInterval(() => {
        saveDraft(formDataRef.current, currentStepRef.current, undefined, true)
      }, autoSaveInterval)
    }
  }, [autoSaveEnabled, autoSaveInterval, saveDraft])

  // Stop auto-save timer
  const stopAutoSave = useCallback(() => {
    if (autoSaveTimer.current) {
      clearInterval(autoSaveTimer.current)
      autoSaveTimer.current = null
    }
  }, [])

  // Update form data ref for auto-save
  const updateFormData = useCallback((formData: Record<string, any>, currentStep: string) => {
    formDataRef.current = formData
    currentStepRef.current = currentStep
  }, [])

  // Clear current draft (start fresh)
  const clearCurrentDraft = useCallback(() => {
    setCurrentDraftId(null)
    setLastSaved(null)
    stopAutoSave()
  }, [stopAutoSave])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAutoSave()
    }
  }, [stopAutoSave])

  return {
    currentDraftId,
    isSaving,
    lastSaved,
    drafts,
    isLoading,
    saveDraft,
    loadDrafts,
    loadDraft,
    deleteDraft,
    startAutoSave,
    stopAutoSave,
    updateFormData,
    clearCurrentDraft,
    calculateCompletion,
  }
}
