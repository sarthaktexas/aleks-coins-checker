"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Copy, Mail } from "lucide-react"

type RedemptionModalProps = {
  isOpen: boolean
  onClose: () => void
  redemptionType: "assignment" | "quiz"
  studentName: string
  studentEmail: string
}

export function RedemptionModal({ isOpen, onClose, redemptionType, studentName, studentEmail }: RedemptionModalProps) {
  const [assignmentName, setAssignmentName] = useState("")
  const [emailCopied, setEmailCopied] = useState(false)

  const isAssignment = redemptionType === "assignment"
  const coinCost = isAssignment ? 10 : 20
  const replacementType = isAssignment ? "online assignment or PlayPosit video" : "attendance quiz"

  const generateEmailContent = () => {
    const subject = `Coin Redemption Request - ${isAssignment ? "Assignment" : "Quiz"} Replacement`

    const body = `Hi Sarthak,

I would like to redeem ${coinCost} ALEKS coins to replace ${isAssignment ? "an online assignment/PlayPosit video" : "an attendance quiz"} with a grade of 100.

${isAssignment ? "Assignment/Video" : "Quiz"} to Replace: ${assignmentName || "[Please specify]"}

Thank you!`

    return { subject, body }
  }

  const copyEmailToClipboard = () => {
    const { subject, body } = generateEmailContent()
    const emailContent = `Subject: ${subject}\n\n${body}`

    navigator.clipboard.writeText(emailContent).then(() => {
      setEmailCopied(true)
      setTimeout(() => setEmailCopied(false), 2000)
    })
  }

  const openEmailClient = () => {
    const { subject, body } = generateEmailContent()
    const mailtoLink = `mailto:sarthak.mohanty@utsa.edu?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(mailtoLink)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Redeem {coinCost} Coins - {isAssignment ? "Assignment" : "Quiz"} Replacement
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Redemption Details</h3>
            <p className="text-blue-800 text-sm">
              You're redeeming <strong>{coinCost} coins</strong> to replace {replacementType} with a grade of{" "}
              <strong>100</strong>.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="assignmentName" className="text-sm font-medium">
                {isAssignment ? "Assignment/Video Name" : "Quiz Name"} *
              </Label>
              <Input
                id="assignmentName"
                placeholder={`Enter the ${isAssignment ? "assignment or PlayPosit video" : "attendance quiz"} name`}
                value={assignmentName}
                onChange={(e) => setAssignmentName(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                Please be specific about which {isAssignment ? "assignment or video" : "quiz"} you want to replace
              </p>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Email Preview</h3>
            <div className="text-sm text-gray-700 space-y-2">
              <div>
                <strong>To:</strong> sarthak.mohanty@utsa.edu
              </div>
              <div>
                <strong>Subject:</strong> {generateEmailContent().subject}
              </div>
              <div className="bg-white border rounded p-3 text-xs font-mono whitespace-pre-line max-h-40 overflow-y-auto">
                {generateEmailContent().body}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={copyEmailToClipboard}
              variant="outline"
              className="flex-1"
              disabled={!assignmentName.trim()}
            >
              <Copy className="h-4 w-4 mr-2" />
              {emailCopied ? "Copied!" : "Copy Email"}
            </Button>
            <Button onClick={openEmailClient} className="flex-1" disabled={!assignmentName.trim()}>
              <Mail className="h-4 w-4 mr-2" />
              Open Email Client
            </Button>
          </div>

          <div className="text-xs text-gray-500 text-center">
            After copying or opening your email client, send the email to Sarthak for processing.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
