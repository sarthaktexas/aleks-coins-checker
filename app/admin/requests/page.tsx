"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle, Mail, Clock, User, Calendar, FileText, ArrowLeft, Coins } from "lucide-react"

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

export default function AdminRequestsPage() {
  const [password, setPassword] = useState("")
  const [requests, setRequests] = useState<StudentRequest[]>([])
  const [filteredRequests, setFilteredRequests] = useState<StudentRequest[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [error, setError] = useState("")
  const [selectedSection, setSelectedSection] = useState<string>("all")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [selectedRequestType, setSelectedRequestType] = useState<string>("all")
  const [updateModal, setUpdateModal] = useState<{
    isOpen: boolean
    request: StudentRequest | null
  }>({ isOpen: false, request: null })
  const [adminNotes, setAdminNotes] = useState("")
  const [newStatus, setNewStatus] = useState("")
  const [coinDeduction, setCoinDeduction] = useState("")
  const [isUpdating, setIsUpdating] = useState(false)

  // Load saved password from localStorage
  useEffect(() => {
    const savedPassword = localStorage.getItem('adminPassword')
    if (savedPassword) {
      setPassword(savedPassword)
    }
  }, [])

  const loadRequests = async () => {
    if (!password) {
      setError("Please enter admin password")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const response = await fetch(`/api/admin/requests?password=${encodeURIComponent(password)}`)
      const data = await response.json()

      if (response.ok) {
        setRequests(data.requests || [])
        setFilteredRequests(data.requests || [])
        setIsAuthenticated(true)
        // Save password
        localStorage.setItem('adminPassword', password)
      } else {
        setError(data.error || "Failed to load requests")
        setIsAuthenticated(false)
      }
    } catch (err) {
      setError("Network error. Please try again.")
      setIsAuthenticated(false)
    } finally {
      setIsLoading(false)
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

  const handleUpdateRequest = async () => {
    if (!updateModal.request) return

    // Validate coin deduction if provided
    let coinAmount: number | undefined = undefined
    if (coinDeduction && coinDeduction.trim() !== "") {
      coinAmount = parseInt(coinDeduction)
      if (isNaN(coinAmount) || coinAmount < 0) {
        setError("Coin deduction must be a positive number or empty")
        return
      }
    }

    setIsUpdating(true)
    setError("")

    try {
      const response = await fetch('/api/admin/requests', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password,
          requestId: updateModal.request.id,
          status: newStatus,
          adminNotes,
          processedBy: 'admin',
          coinDeduction: coinAmount
        })
      })

      const data = await response.json()

      if (response.ok) {
        // Reload requests
        await loadRequests()
        setUpdateModal({ isOpen: false, request: null })
        setAdminNotes("")
        setNewStatus("")
        setCoinDeduction("")
        // Show success message
        if (coinAmount) {
          alert(`Request updated successfully! ${coinAmount} coins have been deducted from the student's balance.`)
        }
      } else {
        setError(data.error || "Failed to update request")
      }
    } catch (err) {
      setError("Network error. Please try again.")
    } finally {
      setIsUpdating(false)
    }
  }

  const openUpdateModal = (request: StudentRequest) => {
    setUpdateModal({ isOpen: true, request })
    setAdminNotes(request.admin_notes || "")
    setNewStatus(request.status)
    setCoinDeduction("")
    setError("")
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Pending</Badge>
      case 'approved':
        return <Badge className="bg-green-500 hover:bg-green-600">Approved</Badge>
      case 'rejected':
        return <Badge className="bg-red-500 hover:bg-red-600">Rejected</Badge>
      case 'completed':
        return <Badge className="bg-blue-500 hover:bg-blue-600">Completed</Badge>
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

  const getRequestTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'assignment_replacement':
      case 'quiz_replacement':
        return 'bg-green-500 hover:bg-green-600'
      case 'override_request':
        return 'bg-blue-500 hover:bg-blue-600'
      default:
        return 'bg-slate-500 hover:bg-slate-600'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  // Get unique sections
  const sections = Array.from(new Set(requests.map(r => r.section_number))).sort()

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-12 max-w-md">
          <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Mail className="h-5 w-5 text-blue-600" />
                Student Requests - Admin Access
              </CardTitle>
              <CardDescription>Enter admin password to view student requests</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Admin Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && loadRequests()}
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              <Button
                onClick={loadRequests}
                disabled={isLoading || !password}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? "Loading..." : "Access Requests"}
              </Button>

              <Button variant="outline" asChild className="w-full">
                <a href="/admin/dashboard">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Student Requests</h1>
              <p className="text-slate-600">
                {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''} 
                {selectedSection !== "all" && ` in section ${selectedSection}`}
                {selectedStatus !== "all" && ` with status: ${selectedStatus}`}
              </p>
            </div>
            <Button variant="outline" asChild>
              <a href="/admin/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </a>
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label htmlFor="section-filter">Filter by Section</Label>
              <Select value={selectedSection} onValueChange={setSelectedSection}>
                <SelectTrigger id="section-filter">
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

            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label htmlFor="type-filter">Filter by Request Type</Label>
              <Select value={selectedRequestType} onValueChange={setSelectedRequestType}>
                <SelectTrigger id="type-filter">
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

            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label htmlFor="status-filter">Filter by Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger id="status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button onClick={loadRequests} variant="outline">
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Requests List */}
        <div className="space-y-4">
          {filteredRequests.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Mail className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 text-lg">No requests found</p>
                <p className="text-slate-500 text-sm mt-2">
                  {selectedSection !== "all" || selectedStatus !== "all" 
                    ? "Try adjusting the filters" 
                    : "Students haven't submitted any requests yet"}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredRequests.map((request) => (
              <Card key={request.id} className="shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <User className="h-5 w-5 text-blue-600" />
                        <h3 className="text-lg font-semibold text-slate-900">{request.student_name}</h3>
                        <Badge className={getRequestTypeBadgeColor(request.request_type)}>
                          {getRequestTypeLabel(request.request_type)}
                        </Badge>
                        {getStatusBadge(request.status)}
                      </div>
                      <div className="space-y-1 text-sm text-slate-600 ml-8">
                        <p className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          {request.student_email}
                        </p>
                        <p className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Student ID: {request.student_id}
                        </p>
                        <p className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Section {request.section_number} • {request.period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </p>
                        {request.day_number && request.override_date && (
                          <p className="flex items-center gap-2 text-blue-600 font-medium">
                            <Calendar className="h-4 w-4" />
                            Day {request.day_number} ({request.override_date})
                          </p>
                        )}
                        <p className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Submitted: {formatDate(request.submitted_at)}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => openUpdateModal(request)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Update Status
                    </Button>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-lg space-y-3">
                    <div>
                      <p className="text-sm font-medium text-slate-700 mb-1">Request Type:</p>
                      <p className="text-sm text-slate-900">{getRequestTypeLabel(request.request_type)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700 mb-1">Details:</p>
                      <p className="text-sm text-slate-900 whitespace-pre-wrap">{request.request_details}</p>
                    </div>
                    {request.admin_notes && (
                      <div className="pt-3 border-t border-slate-200">
                        <p className="text-sm font-medium text-slate-700 mb-1">Admin Notes:</p>
                        <p className="text-sm text-slate-900 whitespace-pre-wrap">{request.admin_notes}</p>
                      </div>
                    )}
                    {request.processed_at && (
                      <div className="pt-3 border-t border-slate-200">
                        <p className="text-xs text-slate-500">
                          Processed: {formatDate(request.processed_at)} by {request.processed_by || 'admin'}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Update Modal */}
        {updateModal.isOpen && updateModal.request && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <CardTitle>Update Request Status</CardTitle>
                <CardDescription>
                  {updateModal.request.student_name} - {getRequestTypeLabel(updateModal.request.request_type)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-slate-700 mb-2">Request Details:</p>
                  <p className="text-sm text-slate-900 whitespace-pre-wrap">{updateModal.request.request_details}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-status">Status</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger id="new-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-notes">Admin Notes</Label>
                  <Textarea
                    id="admin-notes"
                    placeholder="Add notes about this request..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>

                {/* Only show coin deduction for redemption requests, not override requests */}
                {(newStatus === 'completed' || newStatus === 'approved') && 
                 updateModal.request?.request_type !== 'override_request' && (
                  <div className="space-y-2 bg-amber-50 p-4 rounded-lg border border-amber-200">
                    <Label htmlFor="coin-deduction" className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-amber-600" />
                      <span className="text-amber-900">Deduct Coins (Optional)</span>
                    </Label>
                    <Input
                      id="coin-deduction"
                      type="number"
                      min="0"
                      placeholder="e.g., 10 or 20"
                      value={coinDeduction}
                      onChange={(e) => setCoinDeduction(e.target.value)}
                      disabled={isUpdating}
                    />
                    <p className="text-xs text-amber-700">
                      💡 Enter the number of coins to deduct from the student's balance for fulfilling this request. 
                      This will be logged and visible to the student. Leave empty for no deduction.
                    </p>
                  </div>
                )}
                
                {/* Show info for override requests */}
                {updateModal.request?.request_type === 'override_request' && newStatus === 'approved' && (
                  <div className="space-y-2 bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800">
                      <strong>Approving this override will:</strong>
                    </p>
                    <ul className="text-sm text-blue-700 ml-4 list-disc space-y-1">
                      <li>Mark Day {updateModal.request?.day_number} as qualified for this student</li>
                      <li>Recalculate their coin balance (may add 1 coin)</li>
                      <li>Update their progress percentage</li>
                    </ul>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setUpdateModal({ isOpen: false, request: null })
                      setCoinDeduction("")
                      setError("")
                    }}
                    disabled={isUpdating}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpdateRequest}
                    disabled={isUpdating}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    {isUpdating ? "Updating..." : coinDeduction ? `Update & Deduct ${coinDeduction} Coins` : "Update Request"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

