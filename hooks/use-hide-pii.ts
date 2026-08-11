"use client"

import { useState, useEffect, useCallback } from "react"

const STORAGE_KEY = "hideStudentPII"
const CHANGE_EVENT = "hideStudentPII-change"

function getStoredValue(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

/**
 * Hook for hide PII toggle state. Persists to localStorage and syncs across
 * components / tabs (CustomEvent + storage).
 */
export function useHidePII(): [boolean, (value: boolean) => void] {
  const [hidePII, setHidePIIState] = useState(false)

  useEffect(() => {
    setHidePIIState(getStoredValue())
  }, [])

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setHidePIIState(e.newValue === "true")
      }
    }
    const handleLocal = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail
      if (typeof detail === "boolean") setHidePIIState(detail)
    }
    window.addEventListener("storage", handleStorage)
    window.addEventListener(CHANGE_EVENT, handleLocal)
    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener(CHANGE_EVENT, handleLocal)
    }
  }, [])

  const setHidePII = useCallback((value: boolean) => {
    setHidePIIState(value)
    try {
      localStorage.setItem(STORAGE_KEY, String(value))
    } catch {
      // Ignore localStorage errors (e.g. private browsing)
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }))
  }, [])

  return [hidePII, setHidePII]
}
