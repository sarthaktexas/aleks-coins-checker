"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useHidePII } from "@/hooks/use-hide-pii"
import { getFakeDataForStudent } from "@/lib/fake-data"
import { HidePIIToggle } from "@/components/hide-pii-toggle"
import { AlertCircle, Mail, Clock, User, Calendar, FileText, EyeOff } from "lucide-react"
import { formatLocalDateTime } from "@/lib/datetime"

type StudentRequest = {
  id: number
  student_id: string
  student_name: string
  student_email: string
  period: string
  section_number: string
  request_type: string
  request_details: string
  day_number?: number
  override_date?: string
  submitted_at: string
  status: string
  admin_notes?: string
  processed_at?: string
  processed_by?: string
}

const SESSION_EXPIRED = "Session expired — refresh and sign in again."

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<StudentRequest[]>([])
  const [filteredRequests, setFilteredRequests] = useState<StudentRequest[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [selectedSection, setSelectedSection] = useState<string>("all")
  const [selectedStatus, setSelectedStatus] = useState<string>("pending")
  const [selectedRequestType, setSelectedRequestType] = useState<string>("all")
  const [editingRequest, setEditingRequest] = useState<number | null>(null)
  const [adminNotes, setAdminNotes] = useState("")
  const [newStatus, setNewStatus] = useState("")
  const [isUpdating, setIsUpdating] = useState(false)
  const [dayDetails, setDayDetails] = useState<Record<number, {minutes: number, topics: number}>>({})
  const [fastApproving, setFastApproving] = useState<string | null>(null)
  const [magicApproving, setMagicApproving] = useState<string | null>(null)
  const [hidePII, setHidePII] = useHidePII()

  useEffect(() => {
    loadRequests()
  }, [])

  const loadRequests = async () => {
    setIsLoading(true)
    setError("")

    try {
      const response = await fetch("/api/admin/requests", { credentials: "same-origin" })
      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }
      const data = await response.json()

      if (response.ok) {
        setRequests(data.requests || [])
        setFilteredRequests(data.requests || [])
      } else {
        setError(data.error || "Failed to load requests")
      }
    } catch (err) {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  // Function to get day details for override requests.
  // Prefer matching by override date (and period when available) so requests
  // from older periods aren't looked up against the latest period's day numbers.
  const getDayDetails = async (
    studentId: string,
    dayNumber: number,
    overrideDate?: string,
    period?: string
  ) => {
    try {
      const response = await fetch("/api/student", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ studentId: studentId.trim() }),
      })
      const data = await response.json()
      
      if (response.ok) {
        const findDay = (dailyLog: any[]) => {
          if (overrideDate) {
            const byDate = dailyLog.find((d: any) => d.date === overrideDate)
            if (byDate) return byDate
          }
          return dailyLog.find((d: any) => d.day === dayNumber)
        }

        // Search all periods first so historical-period requests resolve correctly
        if (Array.isArray(data.periods)) {
          for (const periodEntry of data.periods) {
            if (period && periodEntry.period !== period) continue
            if (!periodEntry.dailyLog) continue
            const day = findDay(periodEntry.dailyLog)
            if (day) {
              return {
                minutes: day.minutes || 0,
                topics: day.topics || 0
              }
            }
          }
        }

        if (data.student && data.student.dailyLog) {
          const day = findDay(data.student.dailyLog)
          if (day) {
            return {
              minutes: day.minutes || 0,
              topics: day.topics || 0
            }
          }
        }
      }
    } catch (err) {
      // Return default values if fetch fails
    }
    
    return {
      minutes: 0,
      topics: 0
    }
  }

  // Filter requests when filters change
  useEffect(() => {
    let filtered = [...requests]

    if (selectedSection !== "all") {
      filtered = filtered.filter(r => r.section_number === selectedSection)
    }

    if (selectedStatus !== "all") {
      filtered = filtered.filter(r => r.status === selectedStatus)
    }

    if (selectedRequestType !== "all") {
      filtered = filtered.filter(r => r.request_type === selectedRequestType)
    }

    setFilteredRequests(filtered)
  }, [selectedSection, selectedStatus, selectedRequestType, requests])

  const handleUpdateRequest = async (requestId: number) => {
    setIsUpdating(true)
    setError("")

    try {
      const response = await fetch('/api/admin/requests', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: "same-origin",
        body: JSON.stringify({
          requestId: requestId,
          status: newStatus,
          adminNotes,
        })
      })

      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }

      const data = await response.json()

      if (response.ok) {
        // Reload requests
        await loadRequests()
        setEditingRequest(null)
        setAdminNotes("")
        setNewStatus("")
      } else {
        setError(data.error || "Failed to update request")
      }
    } catch (err) {
      setError("Network error. Please try again.")
    } finally {
      setIsUpdating(false)
    }
  }

  const startEditing = async (request: StudentRequest) => {
    setEditingRequest(request.id)
    setAdminNotes(request.admin_notes || "")
    setNewStatus(request.status)
    setError("")
    
    // Fetch day details for override requests
    if (request.request_type === 'override_request' && request.day_number) {
      const details = await getDayDetails(
        request.student_id,
        request.day_number,
        request.override_date,
        request.period
      )
      setDayDetails(prev => ({
        ...prev,
        [request.id]: details
      }))
    }
  }

  const cancelEditing = () => {
    setEditingRequest(null)
    setAdminNotes("")
    setNewStatus("")
    setError("")
  }

  const handleFastApproveAll = async (studentId: string) => {
    if (!confirm(`Are you sure you want to approve ALL pending requests for ${studentId}? This action cannot be undone.`)) {
      return
    }

    setFastApproving(studentId)
    setError("")

    try {
      const response = await fetch('/api/admin/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: "same-origin",
        body: JSON.stringify({
          studentId: studentId,
          adminNotes: 'Fast approved all pending requests'
        })
      })

      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }

      const data = await response.json()

      if (response.ok) {
        // Reload requests
        await loadRequests()
        
        // Success is handled by the UI refresh - no alert needed
      } else {
        setError(data.error || "Failed to fast approve requests")
      }
    } catch (err) {
      setError("Network error. Please try again.")
    } finally {
      setFastApproving(null)
    }
  }

  const handleMagicApprove = async (studentId: string) => {
    if (!confirm(`Are you sure you want to magic approve day overrides with 31+ minutes and "review" in reason for ${studentId}? Only day overrides with 31+ logged minutes and "review" in the reason will be approved.`)) {
      return
    }

    setMagicApproving(studentId)
    setError("")

    try {
      const response = await fetch('/api/admin/requests/magic-approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: "same-origin",
        body: JSON.stringify({
          studentId: studentId,
          adminNotes: 'Magic approved: 31+ minutes logged'
        })
      })

      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }

      const data = await response.json()

      if (response.ok) {
        // Reload requests
        await loadRequests()
        
        // Show success message
        if (data.approvedCount > 0) {
          alert(`Magic approved ${data.approvedCount} day override(s) with 31+ minutes and "review" in reason.${data.skippedCount > 0 ? ` Skipped ${data.skippedCount} request(s) that didn't meet criteria.` : ''}`)
        } else {
          alert(data.message || "No day overrides met the criteria (31+ minutes and 'review' in reason).")
        }
      } else {
        setError(data.error || "Failed to magic approve requests")
      }
    } catch (err) {
      setError("Network error. Please try again.")
    } finally {
      setMagicApproving(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="warning">Pending</Badge>
      case 'approved':
        return <Badge variant="success">Approved</Badge>
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const getRequestTypeLabel = (type: string) => {
    switch (type) {
      case 'assignment_replacement':
        return 'Assignment/Video Replacement'
      case 'quiz_replacement':
        return 'Quiz Replacement'
      case 'override_request':
        return 'Day Override Request'
      case 'extra_credit':
        return 'Extra Credit Inquiry'
      case 'data_correction':
        return 'Data Correction Request'
      default:
        return type
    }
  }

  // Helper function to check if a student has pending requests
  const getStudentPendingCount = (studentId: string) => {
    return requests.filter(r => r.student_id === studentId && r.status === 'pending').length
  }

  const getRequestTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'assignment_replacement':
      case 'quiz_replacement':
        return 'bg-green-500 hover:bg-green-600 text-white'
      case 'override_request':
        return 'bg-utsa-orange text-white'
      default:
        return 'bg-slate-500 hover:bg-slate-600 text-white'
    }
  }

  const formatDate = (dateString: string) => formatLocalDateTime(dateString)

  // Get unique sections
  const sections = Array.from(new Set(requests.map(r => r.section_number))).sort()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-utsa-midnight">Student Requests</h1>
          <p className="text-sm text-utsa-muted">
            {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''} 
            {selectedSection !== "all" && ` in section ${selectedSection}`}
            {selectedStatus !== "all" && ` with status: ${selectedStatus}`}
          </p>
        </div>
        <Button onClick={() => loadRequests()} variant="outline" disabled={isLoading} className="border-utsa-border">
          {isLoading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-4 items-end rounded-md border border-utsa-border bg-white p-4">
        <HidePIIToggle hidePII={hidePII} onToggle={setHidePII} showAlert={false} />
        <div className="space-y-1.5 flex-1 min-w-[160px]">
          <Label htmlFor="section-filter">Section</Label>
          <Select value={selectedSection} onValueChange={setSelectedSection}>
            <SelectTrigger id="section-filter" className="border-utsa-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              {sections.map(section => (
                <SelectItem key={section} value={section}>Section {section}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 flex-1 min-w-[160px]">
          <Label htmlFor="type-filter">Request Type</Label>
          <Select value={selectedRequestType} onValueChange={setSelectedRequestType}>
            <SelectTrigger id="type-filter" className="border-utsa-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="assignment_replacement">Assignment Replacement</SelectItem>
              <SelectItem value="quiz_replacement">Quiz Replacement</SelectItem>
              <SelectItem value="override_request">Day Override Request</SelectItem>
              <SelectItem value="extra_credit">Extra Credit</SelectItem>
              <SelectItem value="data_correction">Data Correction</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 flex-1 min-w-[160px]">
          <Label htmlFor="status-filter">Status</Label>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger id="status-filter" className="border-utsa-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {hidePII && (
        <Alert className="border-amber-200 bg-amber-50">
          <EyeOff className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            PII is hidden. Names, emails, and IDs are replaced with placeholder data.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <span className="text-red-800 text-sm">{error}</span>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {filteredRequests.length === 0 ? (
          <div className="rounded-md border border-utsa-border bg-white p-12 text-center">
            <Mail className="h-8 w-12 text-utsa-muted mx-auto mb-4" />
            <p className="text-utsa-midnight text-lg">No requests found</p>
            <p className="text-utsa-muted text-sm mt-2">
              {selectedSection !== "all" || selectedStatus !== "all" 
                ? "Try adjusting the filters" 
                : "Students haven't submitted any requests yet"}
            </p>
          </div>
        ) : (
          (() => {
            const groupedRequests = filteredRequests.reduce((acc, request) => {
              if (!acc[request.student_id]) {
                acc[request.student_id] = []
              }
              acc[request.student_id].push(request)
              return acc
            }, {} as Record<string, StudentRequest[]>)

            const studentIds = Object.keys(groupedRequests).sort((a, b) => {
              const nameA = groupedRequests[a][0].student_name
              const nameB = groupedRequests[b][0].student_name
              return nameA.localeCompare(nameB)
            })

            return studentIds.map((studentId) => {
              const studentRequests = groupedRequests[studentId]
              const firstRequest = studentRequests[0]
              const pendingCount = studentRequests.filter(r => r.status === 'pending').length
              const pendingDayOverrides = studentRequests.filter(r => r.status === 'pending' && r.request_type === 'override_request').length
              const totalCount = studentRequests.length

              return (
                <div key={studentId} className="rounded-md border border-utsa-border bg-white overflow-hidden">
                  <div className="border-b border-utsa-border bg-utsa-surface px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <User className="h-5 w-5 text-utsa-orange" />
                          <h2 className="text-base font-semibold text-utsa-midnight">
                            {hidePII ? getFakeDataForStudent(studentId).name : firstRequest.student_name}
                          </h2>
                          <Badge variant="outline" className="bg-white border-utsa-border">
                            {totalCount} request{totalCount !== 1 ? 's' : ''}
                            {pendingCount > 0 && ` (${pendingCount} pending)`}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm text-utsa-muted ml-8">
                          <p className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            {hidePII ? getFakeDataForStudent(studentId).email : firstRequest.student_email}
                          </p>
                          <p className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Student ID: {hidePII ? getFakeDataForStudent(studentId).studentId : firstRequest.student_id}
                          </p>
                          <p className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Section {firstRequest.section_number}
                            {(() => {
                              const periods = Array.from(new Set(studentRequests.map(r => r.period).filter(Boolean)))
                              if (periods.length === 1) {
                                return ` • ${periods[0].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`
                              }
                              if (periods.length > 1) {
                                return ` • ${periods.length} periods`
                              }
                              return ''
                            })()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {pendingDayOverrides > 0 && (
                          <Button
                            size="sm"
                            onClick={() => handleMagicApprove(studentId)}
                            disabled={magicApproving === studentId || fastApproving === studentId}
                          >
                            {magicApproving === studentId ? (
                              "Approving..."
                            ) : (
                              `Magic Approve (${pendingDayOverrides})`
                            )}
                          </Button>
                        )}
                        {pendingCount > 1 && (
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() => handleFastApproveAll(studentId)}
                            disabled={fastApproving === studentId || magicApproving === studentId}
                          >
                            {fastApproving === studentId ? (
                              "Approving..."
                            ) : (
                              `Fast Approve All (${pendingCount})`
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-utsa-border">
                    {studentRequests.map((request) => (
                      <div key={request.id} className="p-4 hover:bg-utsa-surface/40 transition-colors">
                        <div className="flex items-start justify-between mb-4 gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <Badge className={getRequestTypeBadgeColor(request.request_type)}>
                                {getRequestTypeLabel(request.request_type)}
                              </Badge>
                              {getStatusBadge(request.status)}
                              {request.day_number && request.override_date && (
                                <Badge variant="outline" className="text-utsa-orange border-utsa-orange">
                                  Day {request.day_number} ({request.override_date})
                                </Badge>
                              )}
                            </div>
                            <div className="space-y-1 text-sm text-utsa-muted">
                              <p className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Submitted: {formatDate(request.submitted_at)}
                              </p>
                              {request.period && (
                                <p className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4" />
                                  {request.period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                  {request.section_number ? ` • Section ${request.section_number}` : ''}
                                </p>
                              )}
                              
                              {request.request_type === 'override_request' && request.day_number && (
                                <div className="flex items-center gap-2 mt-2 p-2 bg-utsa-surface rounded-md border border-utsa-border">
                                  <Calendar className="h-4 w-4 text-utsa-orange" />
                                  <span className="text-sm font-medium text-utsa-midnight">
                                    Day {request.day_number} Details: 
                                    {editingRequest === request.id && dayDetails[request.id] ? (
                                      <span className="text-utsa-muted ml-1">
                                        {dayDetails[request.id].minutes} minutes, {dayDetails[request.id].topics} topics
                                      </span>
                                    ) : editingRequest === request.id ? (
                                      <span className="text-utsa-muted ml-1">Loading...</span>
                                    ) : (
                                      <span className="text-utsa-muted ml-1">Click &apos;Update Status&apos; to view</span>
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          {editingRequest === request.id ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={cancelEditing}
                                variant="outline"
                                disabled={isUpdating}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                variant="success"
                                onClick={() => handleUpdateRequest(request.id)}
                                disabled={isUpdating}
                              >
                                {isUpdating ? "Saving..." : "Save"}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => startEditing(request)}
                              className=""
                            >
                              Update Status
                            </Button>
                          )}
                        </div>

                        <div className="bg-utsa-surface p-4 rounded-md border border-utsa-border space-y-3">
                          <div>
                            <p className="text-sm font-medium text-utsa-midnight mb-1">Request Type:</p>
                            <p className="text-sm text-utsa-muted">{getRequestTypeLabel(request.request_type)}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-utsa-midnight mb-1">Details:</p>
                            <p className="text-sm text-utsa-midnight whitespace-pre-wrap">{request.request_details}</p>
                          </div>
                          
                          {editingRequest === request.id && (
                            <div className="pt-3 border-t border-utsa-border space-y-4">
                              <div className="space-y-1.5">
                                <Label htmlFor={`status-${request.id}`}>Status</Label>
                                <Select value={newStatus} onValueChange={setNewStatus}>
                                  <SelectTrigger id={`status-${request.id}`} className="border-utsa-border">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="approved">Approved</SelectItem>
                                    <SelectItem value="rejected">Rejected</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-1.5">
                                <Label htmlFor={`notes-${request.id}`}>Admin Notes</Label>
                                <Textarea
                                  id={`notes-${request.id}`}
                                  placeholder="Add notes about this request..."
                                  value={adminNotes}
                                  onChange={(e) => setAdminNotes(e.target.value)}
                                  rows={3}
                                  className="resize-none border-utsa-border focus-visible:ring-utsa-orange"
                                />
                              </div>
                              
                              {request.request_type === 'override_request' && newStatus === 'approved' && (
                                <div className="space-y-2 bg-utsa-surface p-4 rounded-md border border-utsa-border">
                                  <p className="text-sm text-utsa-midnight">
                                    <strong>Approving this override will:</strong>
                                  </p>
                                  <ul className="text-sm text-utsa-muted ml-4 list-disc space-y-1">
                                    <li>Mark Day {request.day_number} as qualified for this student</li>
                                    <li>Recalculate their coin balance and progress percentage</li>
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          {request.admin_notes && (
                            <div className="pt-3 border-t border-utsa-border">
                              <p className="text-sm font-medium text-utsa-midnight mb-1">Admin Notes:</p>
                              <p className="text-sm text-utsa-muted whitespace-pre-wrap">{request.admin_notes}</p>
                            </div>
                          )}
                          {request.processed_at && (
                            <div className="pt-3 border-t border-utsa-border">
                              <p className="text-xs text-utsa-muted">
                                Processed: {formatDate(request.processed_at)} by {request.processed_by || 'admin'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          })()
        )}
      </div>
    </div>
  )
}

