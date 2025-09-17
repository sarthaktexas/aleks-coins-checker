"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Gift, Mail, User, FileText, HelpCircle } from "lucide-react"

type RedemptionModalProps = {
  isOpen: boolean
  onClose: () => void
  redemptionType: "assignment" | "quiz"
  studentName: string
  studentEmail: string
}

export function RedemptionModal({ isOpen, onClose, redemptionType, studentName, studentEmail }: RedemptionModalProps) {
  const [formData, setFormData] = useState({
    assignmentName: "",
    courseSection: "",
    additionalNotes: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Simulate submission delay
    await new Promise((resolve) => setTimeout(resolve, 1500))

    setIsSubmitted(true)
    setIsSubmitting(false)

    // Reset form after a delay
    setTimeout(() => {
      setIsSubmitted(false)
      setFormData({
        assignmentName: "",
        courseSection: "",
        additionalNotes: "",
      })
      onClose()
    }, 2000)
  }

  const redemptionInfo = {
    assignment: {
      title: "Assignment/Video Replacement",
      cost: 10,
      description: "Replace one missed assignment or video with your ALEKS coins",
      icon: FileText,
    },
    quiz: {
      title: "Attendance Quiz Replacement",
      cost: 20,
      description: "Replace one missed attendance quiz with your ALEKS coins",
      icon: HelpCircle,
    },
  }

  const info = redemptionInfo[redemptionType]
  const IconComponent = info.icon

  if (isSubmitted) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-6">
            <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
              <Gift className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Redemption Submitted!</h3>
            <p className="text-sm text-gray-600">
              Your redemption request has been sent to your instructor. You should receive confirmation via email
              shortly.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <IconComponent className="h-5 w-5 text-green-600" />
            </div>
            {info.title}
          </DialogTitle>
          <DialogDescription className="text-base">{info.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Cost Badge */}
          <div className="flex justify-center">
            <Badge className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm font-medium">
              Cost: {info.cost} coins
            </Badge>
          </div>

          {/* Student Info */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User className="h-4 w-4" />
              <span className="font-medium">Student:</span>
              <span>{studentName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail className="h-4 w-4" />
              <span className="font-medium">Email:</span>
              <span>{studentEmail}</span>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="assignmentName" className="text-sm font-medium">
                {redemptionType === "assignment" ? "Assignment/Video Name" : "Quiz Name"} *
              </Label>
              <Input
                id="assignmentName"
                placeholder={
                  redemptionType === "assignment" ? "e.g., Homework 5, Chapter 3 Video" : "e.g., Week 2 Attendance Quiz"
                }
                value={formData.assignmentName}
                onChange={(e) => setFormData({ ...formData, assignmentName: e.target.value })}
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="courseSection" className="text-sm font-medium">
                Course Section *
              </Label>
              <Input
                id="courseSection"
                placeholder="e.g., 003, 006"
                value={formData.courseSection}
                onChange={(e) => setFormData({ ...formData, courseSection: e.target.value })}
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="additionalNotes" className="text-sm font-medium">
                Additional Notes (Optional)
              </Label>
              <Textarea
                id="additionalNotes"
                placeholder="Any additional information for your instructor..."
                value={formData.additionalNotes}
                onChange={(e) => setFormData({ ...formData, additionalNotes: e.target.value })}
                className="mt-1 min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </div>
              ) : (
                `Redeem for ${info.cost} coins`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
