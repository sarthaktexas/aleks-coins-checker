"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Mail, Users, Filter, Edit3, Send, Copy, CheckCircle, AlertTriangle, Target, EyeOff } from "lucide-react"
import { EXAM_PERIODS, CURRENT_YEAR } from "@/lib/exam-periods"
import { useHidePII } from "@/hooks/use-hide-pii"
import { getFakeDataForStudent } from "@/lib/fake-data"
import { HidePIIToggle } from "@/components/hide-pii-toggle"

type StudentData = {
  [studentId: string]: {
    name: string
    email: string
    coins: number
    totalDays: number
    periodDays: number
    percentComplete: number
    dailyLog: Array<{
      day: number
      date: string
      qualified: boolean
      minutes: number
      topics: number
      reason: string
      isExcluded?: boolean
      wouldHaveQualified?: boolean
    }>
    exemptDayCredits?: number
    totalBalance?: number // Total balance across all periods including adjustments
  }
}

type EmailTemplate = {
  id: string
  name: string
  subject: string
  body: string
  criteria: string
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "low_progress",
    name: "Low Progress Reminder",
    subject: "ALEKS Progress Update - Action Required",
    body: `Hi {{name}},

I hope this message finds you well. I wanted to reach out regarding your ALEKS progress in our course.

Current Status:
- Progress: {{percentComplete}}%
- Coins Earned: {{coins}}

Your progress is currently below the expected level. To succeed in this course, it's important to maintain consistent daily practice on ALEKS.

Please make sure to:
1. Log in to ALEKS daily
2. Complete the recommended topics
3. Spend adequate time (aim for 30+ minutes per session)
4. Reach out if you're facing any technical issues

I'm here to support you. Please don't hesitate to reach out if you have any questions or need assistance.

Best regards,
[Your Name]`,
    criteria: "Students with less than 50% completion"
  },
  {
    id: "excellent_progress",
    name: "Excellent Progress Recognition",
    subject: "Great Job on ALEKS Progress!",
    body: `Hi {{name}},

Excellent work on your ALEKS progress! I wanted to take a moment to recognize your outstanding effort.

Current Status:
- Progress: {{percentComplete}}%
- Coins Earned: {{coins}}

Your consistent dedication to ALEKS practice is really paying off. Keep up the great work!

This level of engagement will serve you well throughout the course and help you master the material effectively.

Continue with this excellent momentum!

Best regards,
[Your Name]`,
    criteria: "Students with 80% or higher completion"
  },
  {
    id: "moderate_progress",
    name: "Moderate Progress Check-in",
    subject: "ALEKS Progress Check-in",
    body: `Hi {{name}},

I wanted to check in on your ALEKS progress and see how things are going.

Current Status:
- Progress: {{percentComplete}}%
- Coins Earned: {{coins}}

You're making steady progress! To maximize your learning and coin earnings, consider:

1. Increasing your daily practice time if possible
2. Focusing on completing more topics per session
3. Maintaining consistency in your daily practice

Remember, every day of practice counts toward your final grade and coin total.

Feel free to reach out if you have any questions or need support.

Best regards,
[Your Name]`,
    criteria: "Students with 50-79% completion"
  },
  {
    id: "zero_progress",
    name: "No Progress Alert",
    subject: "URGENT: ALEKS Progress Required",
    body: `Hi {{name}},

I'm reaching out because I notice you haven't made any progress on ALEKS yet this period.

Current Status:
- Progress: {{percentComplete}}%
- Coins Earned: {{coins}}

It's crucial that you begin working on ALEKS immediately. Your grade depends on consistent daily practice.

Please:
1. Log into ALEKS today
2. Complete at least 30 minutes of practice
3. Work on multiple topics
4. Contact me immediately if you're experiencing technical issues

This is a critical component of your course grade. Please don't delay getting started.

I'm available to help with any technical or academic questions you may have.

Best regards,
[Your Name]`,
    criteria: "Students with 0% completion"
  },
  {
    id: "custom",
    name: "Custom Message",
    subject: "Message from Your Instructor",
    body: `Hi {{name}},

[Your custom message here]

Current Status:
- Progress: {{percentComplete}}%
- Coins Earned: {{coins}}

Best regards,
[Your Name]`,
    criteria: "Custom criteria and message"
  }
]

type FilterCriteria = {
  minProgress?: number
  maxProgress?: number
  minCoins?: number
  maxCoins?: number
  hasProgress?: boolean
  noProgress?: boolean
}

export default function EmailStudentsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState("__ALL__")
  const [sectionNumber, setSectionNumber] = useState("")
  const [periods, setPeriods] = useState<Record<string, any>>({})
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(true)
  const [studentData, setStudentData] = useState<StudentData>({})
  const [isLoadingStudents, setIsLoadingStudents] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [customSubject, setCustomSubject] = useState("")
  const [customBody, setCustomBody] = useState("")
  const [filterCriteria, setFilterCriteria] = useState<FilterCriteria>({})
  const [filteredStudents, setFilteredStudents] = useState<Array<{id: string, data: any}>>([])
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [copiedEmails, setCopiedEmails] = useState(false)
  const [hidePII, setHidePII] = useHidePII()

  // Load periods from database
  const loadPeriods = async () => {
    try {
      const response = await fetch('/api/admin/exam-periods')
      const data = await response.json()
      
      if (response.ok) {
        setPeriods(data.periods || {})
        // Don't auto-select a period - let user choose or use "All Periods"
      } else {
        setPeriods(EXAM_PERIODS)
      }
    } catch (error) {
      setPeriods(EXAM_PERIODS)
    } finally {
      setIsLoadingPeriods(false)
    }
  }

  useEffect(() => {
    loadPeriods()
  }, [])

  // Load students when period/section changes
  const loadStudents = async () => {
    setIsLoadingStudents(true)
    setMessage(null)

    try {
      // Build URL based on what's selected
      let url = '/api/admin/student-data'
      const params = new URLSearchParams()
      if (selectedPeriod && selectedPeriod !== '__ALL__') {
        params.append('period', selectedPeriod)
      }
      if (sectionNumber.trim()) {
        params.append('sectionNumber', sectionNumber)
      }
      if (params.toString()) {
        url += '?' + params.toString()
      }
      
      const response = await fetch(url, { credentials: "same-origin" })
      if (response.status === 401) {
        setMessage({ type: "error", text: "Session expired — refresh and sign in again." })
        setStudentData({})
        return
      }
      const data = await response.json()

      if (response.ok) {
        const loadedStudentData = data.studentData || {}
        
        // Always fetch total balances for all students (needed for "All Periods" view and for accurate totals)
        const studentIds = Object.keys(loadedStudentData)
        if (studentIds.length > 0) {
          try {
            const balancesResponse = await fetch('/api/admin/student-balances', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: "same-origin",
              body: JSON.stringify({ studentIds })
            })
            if (balancesResponse.status === 401) {
              setMessage({ type: "error", text: "Session expired — refresh and sign in again." })
              return
            }
            const balancesData = await balancesResponse.json()
            
            if (balancesResponse.ok && balancesData.balances) {
              // Update student data with total balances
              const updatedStudentData = { ...loadedStudentData }
              Object.keys(updatedStudentData).forEach(studentId => {
                const normalizedId = studentId.toLowerCase()
                // Look up balance using normalized ID
                if (balancesData.balances[normalizedId] !== undefined) {
                  updatedStudentData[studentId].totalBalance = balancesData.balances[normalizedId]
                } else {
                  // If balance not found, try to calculate a fallback or set to 0
                  // This shouldn't happen if the API is working correctly
                  console.warn(`Balance not found for student ${studentId}, using 0`)
                  updatedStudentData[studentId].totalBalance = 0
                }
              })
              setStudentData(updatedStudentData)
            } else {
              // If balance fetch fails, still set the data but log the error
              console.error("Failed to fetch balances:", balancesData)
              // Set totalBalance to 0 for all students if balance fetch fails
              const updatedStudentData = { ...loadedStudentData }
              Object.keys(updatedStudentData).forEach(studentId => {
                updatedStudentData[studentId].totalBalance = 0
              })
              setStudentData(updatedStudentData)
            }
          } catch (balanceError) {
            console.error("Error fetching balances:", balanceError)
            // Continue without balances if there's an error, but set data
            setStudentData(loadedStudentData)
          }
        } else {
          setStudentData(loadedStudentData)
        }
        
        setMessage({ type: "success", text: `Loaded ${studentIds.length} students` })
      } else {
        setMessage({ type: "error", text: data.error || "Failed to load students" })
        setStudentData({})
      }
    } catch (error) {
      setMessage({ type: "error", text: "Network error. Please try again." })
      setStudentData({})
    } finally {
      setIsLoadingStudents(false)
    }
  }

  useEffect(() => {
    loadStudents()
  }, [selectedPeriod, sectionNumber])

  // Apply filters to students
  useEffect(() => {
    const students = Object.entries(studentData).map(([id, data]) => ({ id, data }))
    
    let filtered = students

    if (filterCriteria.minProgress !== undefined) {
      filtered = filtered.filter(s => (s.data.percentComplete || 0) >= filterCriteria.minProgress!)
    }
    if (filterCriteria.maxProgress !== undefined) {
      filtered = filtered.filter(s => (s.data.percentComplete || 0) <= filterCriteria.maxProgress!)
    }
    if (filterCriteria.minCoins !== undefined) {
      filtered = filtered.filter(s => ((s.data.totalBalance ?? s.data.coins) || 0) >= filterCriteria.minCoins!)
    }
    if (filterCriteria.maxCoins !== undefined) {
      filtered = filtered.filter(s => ((s.data.totalBalance ?? s.data.coins) || 0) <= filterCriteria.maxCoins!)
    }
    if (filterCriteria.hasProgress) {
      filtered = filtered.filter(s => (s.data.percentComplete || 0) > 0)
    }
    if (filterCriteria.noProgress) {
      filtered = filtered.filter(s => (s.data.percentComplete || 0) === 0)
    }

    setFilteredStudents(filtered)
  }, [studentData, filterCriteria])

  // Update template when selection changes
  useEffect(() => {
    if (selectedTemplate && selectedTemplate !== "custom") {
      const template = EMAIL_TEMPLATES.find(t => t.id === selectedTemplate)
      if (template) {
        setCustomSubject(template.subject)
        setCustomBody(template.body)
      }
    }
  }, [selectedTemplate])

  const getStatusBadge = (percentComplete: number | undefined) => {
    const progress = percentComplete || 0
    if (progress === 0) return <Badge variant="destructive">No Progress</Badge>
    if (progress < 50) return <Badge variant="secondary">Low Progress</Badge>
    if (progress < 80) return <Badge variant="default">Moderate Progress</Badge>
    return <Badge variant="default" className="bg-green-100 text-green-800">Excellent Progress</Badge>
  }

  const generateEmailContent = (student: {id: string, data: any}) => {
    const template = selectedTemplate === "custom" 
      ? { subject: customSubject, body: customBody }
      : EMAIL_TEMPLATES.find(t => t.id === selectedTemplate)

    if (!template) return { subject: "", body: "" }

    let subject = template.subject
    let body = template.body

    // Parse first name from "Last Name, First Name" format
    const getFirstName = (fullName: string) => {
      if (!fullName) return "Student"
      const match = fullName.match(/,\s*(.+)$/)
      return match ? match[1].trim() : fullName
    }

    // Replace placeholders
    // Use totalBalance if available (includes adjustments), otherwise fall back to coins
    const coinBalance = (student.data.totalBalance ?? student.data.coins) || 0
    const replacements = {
      "{{name}}": getFirstName(student.data.name),
      "{{percentComplete}}": student.data.percentComplete || 0,
      "{{coins}}": coinBalance,
      "{{totalDays}}": student.data.totalDays || 0,
      "{{periodDays}}": student.data.periodDays || 0
    }

    Object.entries(replacements).forEach(([placeholder, value]) => {
      subject = subject.replace(new RegExp(placeholder, 'g'), String(value))
      body = body.replace(new RegExp(placeholder, 'g'), String(value))
    })

    return { subject, body }
  }


  const generateIndividualMailtoLinks = () => {
    if (filteredStudents.length === 0) return []

    return filteredStudents.map(student => {
      const { subject, body } = generateEmailContent(student)
      const encodedSubject = encodeURIComponent(subject)
      const encodedBody = encodeURIComponent(body)
      
      return `mailto:${student.data.email}?subject=${encodedSubject}&body=${encodedBody}`
    })
  }

  const generateBCCMailtoLink = () => {
    if (filteredStudents.length === 0) return ""

    const emails = filteredStudents.map(s => s.data.email).join(",")
    
    // Use generic template for BCC emails (no personal information)
    const template = selectedTemplate === "custom" 
      ? { subject: customSubject, body: customBody }
      : EMAIL_TEMPLATES.find(t => t.id === selectedTemplate)

    if (!template) return ""

    let subject = template.subject
    let body = template.body

    // For BCC emails, remove the entire "Current Status" section and personal info
    body = body.replace(/Current Status:\s*\n- Progress:.*\n- Coins Earned:.*\n\n?/g, '')
    
    // Replace only the name placeholder, remove all others
    body = body.replace(/\{\{name\}\}/g, '')
    subject = subject.replace(/\{\{name\}\}/g, '')
    
    // Clean up any leftover template artifacts and start with "Hi,"
    body = body.replace(/^Hi\s*,?\s*/i, 'Hi,')
    body = body.replace(/\n\n+/g, '\n\n') // Clean up extra line breaks
    
    const encodedSubject = encodeURIComponent(subject)
    const encodedBody = encodeURIComponent(body)
    
    return `mailto:?bcc=${emails}&subject=${encodedSubject}&body=${encodedBody}`
  }

  const openIndividualEmails = () => {
    const mailtoLinks = generateIndividualMailtoLinks()
    
    // Show warning for large numbers of emails
    if (mailtoLinks.length > 10) {
      const confirmed = window.confirm(
        `This will open ${mailtoLinks.length} separate email windows. This might be overwhelming for your email client. Are you sure you want to continue?`
      )
      if (!confirmed) return
    }
    
    // Open each email with a small delay to prevent browser blocking
    mailtoLinks.forEach((link, index) => {
      setTimeout(() => {
        // Create a temporary link element and click it to open mailto
        const tempLink = document.createElement('a')
        tempLink.href = link
        tempLink.target = '_blank'
        document.body.appendChild(tempLink)
        tempLink.click()
        document.body.removeChild(tempLink)
      }, index * 200) // 200ms delay between each email
    })
  }

  const copyEmailsToClipboard = () => {
    const emails = filteredStudents.map(s => s.data.email).join("\n")
    navigator.clipboard.writeText(emails)
    setCopiedEmails(true)
    setTimeout(() => setCopiedEmails(false), 2000)
  }

  const formatDateRange = (startDate: string, endDate: string) => {
    const formatDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split('-').map(Number)
      const date = new Date(year, month - 1, day)
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      return `${monthNames[date.getMonth()]} ${date.getDate()}`
    }
    
    const start = formatDate(startDate)
    const end = formatDate(endDate)
    return `${start} - ${end}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-utsa-midnight">Email Students</h1>
          <p className="text-sm text-utsa-muted">Send targeted emails based on progress and criteria</p>
        </div>
        <HidePIIToggle hidePII={hidePII} onToggle={setHidePII} showAlert={false} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="rounded-md border border-utsa-border bg-white overflow-hidden">
            <div className="border-b border-utsa-border bg-utsa-surface px-4 py-3">
              <h2 className="text-sm font-semibold text-utsa-midnight flex items-center gap-2">
                <Target className="h-4 w-4 text-utsa-orange" />
                Period & Section
              </h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="period">Exam Period (Optional)</Label>
                <Select value={selectedPeriod || "__ALL__"} onValueChange={setSelectedPeriod} disabled={isLoadingPeriods}>
                  <SelectTrigger className="h-10 border-utsa-border text-left">
                    <SelectValue placeholder={isLoadingPeriods ? "Loading periods..." : "Select exam period"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">All Periods</SelectItem>
                    {Object.entries(periods).map(([key, period]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex flex-col">
                          <span className="font-medium">{period.name}</span>
                          <span className="text-xs text-utsa-muted">
                            {formatDateRange(period.startDate, period.endDate)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-utsa-muted">
                  Select &quot;All Periods&quot; to load students from all periods
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sectionNumber">Section Number (Optional)</Label>
                <Input
                  id="sectionNumber"
                  type="text"
                  placeholder="e.g., 003, 006 (leave empty for all sections)"
                  value={sectionNumber}
                  onChange={(e) => setSectionNumber(e.target.value)}
                  className="h-10 border-utsa-border focus-visible:ring-utsa-orange"
                />
                <p className="text-xs text-utsa-muted">
                  Leave empty to load students from all sections for the selected period
                </p>
              </div>

              <Button 
                onClick={loadStudents}
                disabled={isLoadingStudents}
                className="w-full bg-utsa-orange hover:bg-utsa-accessible"
              >
                {isLoadingStudents ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Loading Students...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Load Students
                  </div>
                )}
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-utsa-border bg-white overflow-hidden">
            <div className="border-b border-utsa-border bg-utsa-surface px-4 py-3">
              <h2 className="text-sm font-semibold text-utsa-midnight flex items-center gap-2">
                <Filter className="h-4 w-4 text-utsa-orange" />
                Filter Students
              </h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Min Progress %</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={filterCriteria.minProgress || ""}
                    onChange={(e) => setFilterCriteria(prev => ({ 
                      ...prev, 
                      minProgress: e.target.value ? Number(e.target.value) : undefined 
                    }))}
                    className="h-10 border-utsa-border focus-visible:ring-utsa-orange"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Progress %</Label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={filterCriteria.maxProgress || ""}
                    onChange={(e) => setFilterCriteria(prev => ({ 
                      ...prev, 
                      maxProgress: e.target.value ? Number(e.target.value) : undefined 
                    }))}
                    className="h-10 border-utsa-border focus-visible:ring-utsa-orange"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Min Coins</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={filterCriteria.minCoins || ""}
                    onChange={(e) => setFilterCriteria(prev => ({ 
                      ...prev, 
                      minCoins: e.target.value ? Number(e.target.value) : undefined 
                    }))}
                    className="h-10 border-utsa-border focus-visible:ring-utsa-orange"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Coins</Label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={filterCriteria.maxCoins || ""}
                    onChange={(e) => setFilterCriteria(prev => ({ 
                      ...prev, 
                      maxCoins: e.target.value ? Number(e.target.value) : undefined 
                    }))}
                    className="h-10 border-utsa-border focus-visible:ring-utsa-orange"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={filterCriteria.hasProgress ? "default" : "outline"}
                  size="sm"
                  className={filterCriteria.hasProgress ? "bg-utsa-orange hover:bg-utsa-accessible" : "border-utsa-border"}
                  onClick={() => setFilterCriteria(prev => ({ 
                    ...prev, 
                    hasProgress: !prev.hasProgress,
                    noProgress: false
                  }))}
                >
                  Has Progress
                </Button>
                <Button
                  variant={filterCriteria.noProgress ? "default" : "outline"}
                  size="sm"
                  className={filterCriteria.noProgress ? "bg-utsa-orange hover:bg-utsa-accessible" : "border-utsa-border"}
                  onClick={() => setFilterCriteria(prev => ({ 
                    ...prev, 
                    noProgress: !prev.noProgress,
                    hasProgress: false
                  }))}
                >
                  No Progress
                </Button>
              </div>

              <div className="text-sm text-utsa-muted bg-utsa-surface p-3 rounded-md border border-utsa-border">
                <strong className="text-utsa-midnight">Filtered Students:</strong> {filteredStudents.length} of {Object.keys(studentData).length}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-utsa-border bg-white overflow-hidden">
            <div className="border-b border-utsa-border bg-utsa-surface px-4 py-3">
              <h2 className="text-sm font-semibold text-utsa-midnight flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-utsa-orange" />
                Email Template
              </h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-1.5">
                <Label>Template</Label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger className="h-10 border-utsa-border text-left">
                    <SelectValue placeholder="Select email template" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMAIL_TEMPLATES.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{template.name}</span>
                          <span className="text-xs text-utsa-muted">{template.criteria}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplate && (
                <>
                  <div className="space-y-1.5">
                    <Label>Subject</Label>
                    <Input
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                      className="h-10 border-utsa-border focus-visible:ring-utsa-orange"
                      placeholder="Email subject"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Message Body</Label>
                    <Textarea
                      value={customBody}
                      onChange={(e) => setCustomBody(e.target.value)}
                      rows={8}
                      className="resize-none border-utsa-border focus-visible:ring-utsa-orange"
                      placeholder="Email message body"
                    />
                  </div>

                  <div className="text-xs text-utsa-muted bg-utsa-surface p-3 rounded-md border border-utsa-border">
                    <strong className="text-utsa-midnight">Available placeholders:</strong> {"{{name}}"}, {"{{percentComplete}}"}, {"{{coins}}"}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-utsa-border bg-white overflow-hidden">
            <div className="border-b border-utsa-border bg-utsa-surface px-4 py-3">
              <h2 className="text-sm font-semibold text-utsa-midnight flex items-center gap-2">
                <Send className="h-4 w-4 text-utsa-orange" />
                Send Email
              </h2>
            </div>
            <div className="p-4 space-y-4">
              {filteredStudents.length > 0 ? (
                <>
                  {hidePII && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-sm">
                      <EyeOff className="h-4 w-4 flex-shrink-0" />
                      <span>PII is hidden. Copy/send email actions are disabled. Turn off Hide PII to send emails.</span>
                    </div>
                  )}
                  <div className="bg-utsa-surface border border-utsa-border rounded-md p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-utsa-orange" />
                      <span className="font-medium text-utsa-midnight text-sm">Recipients ({filteredStudents.length})</span>
                    </div>
                    <div className="text-sm text-utsa-muted max-h-64 overflow-y-auto">
                      <table className="w-full">
                        <thead className="text-left border-b border-utsa-border">
                          <tr>
                            {!hidePII && <th className="pb-2 pr-4 text-xs">Student ID</th>}
                            <th className="pb-2 pr-4 text-xs">Name</th>
                            <th className="pb-2 pr-4 text-xs">Email</th>
                            <th className="pb-2 pr-4 text-right text-xs">Coins</th>
                            <th className="pb-2 text-xs">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStudents.map((student) => {
                            const display = hidePII ? getFakeDataForStudent(student.id) : { name: student.data.name, email: student.data.email, studentId: student.id }
                            const coins = (selectedPeriod && selectedPeriod !== '__ALL__')
                              ? (student.data.coins || 0)
                              : (student.data.totalBalance !== undefined ? student.data.totalBalance : 0)
                            return (
                              <tr key={student.id} className="border-b border-utsa-border">
                                {!hidePII && (
                                  <td className="py-2 pr-4 font-mono text-xs">{display.studentId}</td>
                                )}
                                <td className="py-2 pr-4">{display.name}</td>
                                <td className="py-2 pr-4">{display.email}</td>
                                <td className="py-2 pr-4 text-right font-medium">{coins}</td>
                                <td className="py-2">{getStatusBadge(student.data.percentComplete)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={copyEmailsToClipboard}
                      variant="outline"
                      className="flex-1 border-utsa-border"
                      disabled={hidePII}
                    >
                      {copiedEmails ? (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          Copied!
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Copy className="h-4 w-4" />
                          Copy Emails
                        </div>
                      )}
                    </Button>
                  </div>

                  {selectedTemplate && customSubject && customBody && (
                    <div className="space-y-3">
                      <div className="bg-utsa-surface border border-utsa-border rounded-md p-3">
                        <div className="text-xs text-utsa-muted">
                          <strong className="text-utsa-midnight">Email Options:</strong>
                          <ul className="mt-1 space-y-1">
                            <li>• <strong className="text-utsa-midnight">Individual:</strong> Opens separate email for each student (personalized with names & progress)</li>
                            <li>• <strong className="text-utsa-midnight">All in BCC:</strong> One generic email to all students (no names, progress, or personal info)</li>
                          </ul>
                        </div>
                      </div>

                      <Button
                        onClick={openIndividualEmails}
                        className="w-full bg-utsa-orange hover:bg-utsa-accessible"
                        disabled={hidePII}
                      >
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Open Individual Emails ({filteredStudents.length} separate windows)
                        </div>
                      </Button>

                      {hidePII ? (
                        <Button
                          className="w-full bg-utsa-accessible hover:bg-utsa-orange opacity-50 cursor-not-allowed"
                          disabled
                        >
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Open Email Client (All in BCC: {filteredStudents.length} recipients)
                          </div>
                        </Button>
                      ) : (
                        <Button asChild className="w-full bg-utsa-accessible hover:bg-utsa-orange">
                          <a href={generateBCCMailtoLink()}>
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4" />
                              Open Email Client (All in BCC: {filteredStudents.length} recipients)
                            </div>
                          </a>
                        </Button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-utsa-muted">
                  <Users className="h-12 w-12 mx-auto mb-4 text-utsa-muted/50" />
                  <p>No students match the current criteria</p>
                  <p className="text-sm">Adjust your filters or load student data</p>
                </div>
              )}
            </div>
          </div>

          {selectedTemplate && customSubject && customBody && filteredStudents.length > 0 && (
            <div className="rounded-md border border-utsa-border bg-white overflow-hidden">
              <div className="border-b border-utsa-border bg-utsa-surface px-4 py-3">
                <h2 className="text-sm font-semibold text-utsa-midnight flex items-center gap-2">
                  <Edit3 className="h-4 w-4 text-utsa-orange" />
                  Email Preview
                </h2>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <Label className="text-sm font-medium text-utsa-midnight">Subject</Label>
                  <div className="mt-1 p-3 bg-utsa-surface rounded-md border border-utsa-border text-sm text-utsa-muted">
                    {generateEmailContent(filteredStudents[0]).subject}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-utsa-midnight">
                    Body (Preview for {hidePII ? getFakeDataForStudent(filteredStudents[0].id).name : filteredStudents[0].data.name})
                  </Label>
                  <div className="mt-1 p-3 bg-utsa-surface rounded-md border border-utsa-border text-sm text-utsa-muted whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {generateEmailContent(filteredStudents[0]).body}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {message && (
        <Alert
          className={`${message.type === "success" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
            <AlertDescription className={message.type === "success" ? "text-green-800" : "text-red-800"}>
              {message.text}
            </AlertDescription>
          </div>
        </Alert>
      )}
    </div>
  )
}

