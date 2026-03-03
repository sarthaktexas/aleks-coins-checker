"use client"

import { useState, useEffect, useCallback } from "react"

const STORAGE_KEY = "hideStudentPII"

function getStoredValue(): boolean {
  if (typeof window === "undefined") return false
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === "true"
  } catch {
    return false
  }
}

/**
 * Hook for hide PII toggle state. Persists to localStorage and syncs across tabs.
 */
export function useHidePII(): [boolean, (value: boolean) => void] {
  const [hidePII, setHidePIIState] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    setHidePIIState(getStoredValue())
  }, [])

  // Listen for storage events (changes from other tabs)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setHidePIIState(e.newValue === "true")
      }
    }
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [])

  const setHidePII = useCallback((value: boolean) => {
    setHidePIIState(value)
    try {
      localStorage.setItem(STORAGE_KEY, String(value))
    } catch {
      // Ignore localStorage errors (e.g. private browsing)
    }
  }, [])

  return [hidePII, setHidePII]
}
