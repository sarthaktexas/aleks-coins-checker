"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Copy, Mail } from "lucide-react"

type RedemptionModalProps = {
  isOpen: boolean
  onClose: () => void
  redemptionType: "assignment" | "quiz"
  studentName: string
  studentEmail: string
}

export function RedemptionModal({ isOpen, onClose, redemptionType, studentName, studentEmail }: RedemptionModalProps) {
  const [copied, setCopied] = useState(false)

  const getEmailSubject = () => {
    return redemptionType === "assignment"
      ? "ALEKS Coin Redemption - Assignment/Video Replacement"
      : "ALEKS Coin Redemption - Attendance Quiz Replacement"
  }

  const getEmailBody = () => {
    const replacementType =
      redemptionType === "assignment" ? "assignment/video replacement" : "attendance quiz replacement"

    return `Hi Sarthak,

I would like to redeem my ALEKS coins for a ${replacementType}.

Student: ${studentName}
Email: ${studentEmail}

Please let me know which specific assignment I should complete for this redemption. I understand I need to be specific with assignment names when making this request.

Thank you!

Best regards,
${studentName}`
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(getEmailBody())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy text: ", err)
    }
  }

  const openEmailClient = () => {
    const subject = encodeURIComponent(getEmailSubject())
    const body = encodeURIComponent(getEmailBody())
    const mailtoLink = `mailto:sarthak.mohanty@utsa.edu?subject=${subject}&body=${body}`
    window.location.href = mailtoLink
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {redemptionType === "assignment" ? "Assignment/Video" : "Attendance Quiz"} Redemption
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800 text-sm">
              <strong>Cost:</strong> {redemptionType === "assignment" ? "10" : "20"} coins
            </p>
            <p className="text-blue-700 text-sm mt-1">This will generate an email to your instructor for approval.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-preview">Email Preview:</Label>
            <Textarea id="email-preview" value={getEmailBody()} readOnly className="min-h-[200px] font-mono text-sm" />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-amber-800 text-sm">
              <strong>Important:</strong> Be specific with assignment names when making your request to ensure proper
              processing.
            </p>
          </div>

          <div className="flex gap-3">
            <Button onClick={copyToClipboard} variant="outline" className="flex-1 bg-transparent">
              <Copy className="h-4 w-4 mr-2" />
              {copied ? "Copied!" : "Copy Email"}
            </Button>
            <Button onClick={openEmailClient} className="flex-1">
              <Mail className="h-4 w-4 mr-2" />
              Open Email App
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
