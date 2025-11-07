"use client"

import { useState, useMemo, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, Search, ChevronLeft, ChevronRight, FileText, Calendar, User } from "lucide-react"

type Request = {
  id: number
  request_type: string
  request_details: string
  submitted_at: string
  status: string
  admin_notes?: string
  processed_at?: string
  processed_by?: string
  period?: string
  section_number?: string
}

type RequestHistoryProps = {
  approvedRequests: Request[]
  rejectedRequests: Request[]
}

const ITEMS_PER_PAGE = 10

export function RequestHistory({ approvedRequests, rejectedRequests }: RequestHistoryProps) {
  const [activeTab, setActiveTab] = useState<"approved" | "rejected">("approved")
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)

  const getRequestTypeLabel = (type: string) => {
    switch (type) {
      case "assignment_replacement":
        return "Assignment/Video Replacement"
      case "quiz_replacement":
        return "Quiz Replacement"
      case "override_request":
        return "Day Override Request"
      default:
        return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
    }
  }

  const getCoinCost = (type: string) => {
    if (type === "assignment_replacement") return 10
    if (type === "quiz_replacement") return 20
    return 0
  }

  const currentRequests = activeTab === "approved" ? approvedRequests : rejectedRequests

  // Filter requests based on search query
  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return currentRequests

    const query = searchQuery.toLowerCase()
    return currentRequests.filter((request) => {
      const typeLabel = getRequestTypeLabel(request.request_type).toLowerCase()
      const details = request.request_details?.toLowerCase() || ""
      const notes = request.admin_notes?.toLowerCase() || ""
      const period = request.period?.toLowerCase() || ""
      const section = request.section_number?.toLowerCase() || ""

      return (
        typeLabel.includes(query) ||
        details.includes(query) ||
        notes.includes(query) ||
        period.includes(query) ||
        section.includes(query)
      )
    })
  }, [currentRequests, searchQuery])

  // Paginate filtered requests
  const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedRequests = filteredRequests.slice(startIndex, endIndex)

  // Reset to page 1 when tab or search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, searchQuery])

  if (approvedRequests.length === 0 && rejectedRequests.length === 0) {
    return null
  }

  return (
    <Card className="bg-gradient-to-br from-slate-50 to-gray-50 border-slate-200 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-slate-100 to-gray-100 border-b border-slate-200">
        <CardTitle className="flex items-center gap-3 text-lg sm:text-xl text-slate-900">
          <div className="p-2 bg-slate-200 rounded-lg">
            <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-slate-600" />
          </div>
          Request History
        </CardTitle>
        <CardDescription className="text-sm sm:text-base">
          View your approved and rejected requests
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-slate-200">
          <button
            onClick={() => setActiveTab("approved")}
            className={`flex-1 pb-3 px-4 text-sm font-medium transition-colors ${
              activeTab === "approved"
                ? "text-emerald-700 border-b-2 border-emerald-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <CheckCircle className="h-4 w-4" />
              <span>Approved ({approvedRequests.length})</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab("rejected")}
            className={`flex-1 pb-3 px-4 text-sm font-medium transition-colors ${
              activeTab === "rejected"
                ? "text-red-700 border-b-2 border-red-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <XCircle className="h-4 w-4" />
              <span>Rejected ({rejectedRequests.length})</span>
            </div>
          </button>
        </div>

        {/* Search */}
        {currentRequests.length > 0 && (
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search requests..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-slate-200 focus:border-slate-400"
              />
            </div>
          </div>
        )}

        {/* Requests List */}
        {paginatedRequests.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-slate-400 mb-2">
              {activeTab === "approved" ? (
                <CheckCircle className="h-12 w-12 mx-auto" />
              ) : (
                <XCircle className="h-12 w-12 mx-auto" />
              )}
            </div>
            <p className="text-slate-600 font-medium">
              {searchQuery ? "No requests match your search" : `No ${activeTab} requests yet`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedRequests.map((request) => (
              <div
                key={request.id}
                className={`rounded-lg p-4 border transition-all ${
                  activeTab === "approved"
                    ? "bg-emerald-50/50 border-emerald-200 hover:bg-emerald-50"
                    : "bg-red-50/50 border-red-200 hover:bg-red-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-slate-900">
                        {getRequestTypeLabel(request.request_type)}
                      </h4>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          activeTab === "approved"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : "bg-red-100 text-red-800 border-red-300"
                        }`}
                      >
                        {activeTab === "approved" ? "Approved" : "Rejected"}
                      </Badge>
                    </div>
                    {request.period && (
                      <div className="flex items-center gap-1 text-xs text-slate-600 mb-1">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {request.period.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                          {request.section_number && ` • Section ${request.section_number}`}
                        </span>
                      </div>
                    )}
                  </div>
                  {getCoinCost(request.request_type) > 0 && (
                    <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                      {getCoinCost(request.request_type)} coins
                    </Badge>
                  )}
                </div>

                <p className="text-sm text-slate-700 mb-3 whitespace-pre-wrap">{request.request_details}</p>

                {request.admin_notes && (
                  <div
                    className={`mt-3 p-3 rounded-lg border ${
                      activeTab === "approved"
                        ? "bg-emerald-100/50 border-emerald-300"
                        : "bg-red-100/50 border-red-300"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-slate-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-slate-700 mb-1">Admin Notes:</p>
                        <p className="text-xs text-slate-600 whitespace-pre-wrap">{request.admin_notes}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>
                      Submitted: {new Date(request.submitted_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {request.processed_at && (
                      <span>
                        Processed: {new Date(request.processed_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  {request.processed_by && (
                    <span className="text-xs text-slate-500">by {request.processed_by}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200">
            <div className="text-sm text-slate-600">
              Showing {startIndex + 1} to {Math.min(endIndex, filteredRequests.length)} of {filteredRequests.length}{" "}
              {activeTab} request{filteredRequests.length !== 1 ? "s" : ""}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="border-slate-200"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="text-sm text-slate-600 px-3">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="border-slate-200"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

