"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trophy, Flame, Star, Lock } from "lucide-react"

type BadgeType = "streak_10_day" | "streak_25_day"

type BadgeData = {
  id?: number
  badge_type: BadgeType
  earned_at?: string
  streak_count?: number
}

type BadgeShelfProps = {
  badges: BadgeData[]
  currentStreak?: number
  maxStreak?: number
}

const BADGE_INFO = {
  streak_10_day: {
    name: "10-Day Streak",
    description: "Complete ALEKS 10 days in a row",
    icon: "🔥",
    requirement: 10,
    reward: "+10 bonus coins",
    color: "text-orange-500",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
  },
  streak_25_day: {
    name: "25-Day Streak",
    description: "Complete ALEKS 25 days in a row",
    icon: "⭐",
    requirement: 25,
    reward: "Permanent 2x multiplier",
    color: "text-yellow-500",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
  },
}

export function BadgeShelf({ badges, currentStreak = 0, maxStreak = 0 }: BadgeShelfProps) {
  const earnedBadgeTypes = new Set(badges.map((b) => b.badge_type))

  const has10DayBadge = earnedBadgeTypes.has("streak_10_day")
  const has25DayBadge = earnedBadgeTypes.has("streak_25_day")

  const get10DayProgress = () => {
    if (has10DayBadge) return 100
    return Math.min((maxStreak / 10) * 100, 100)
  }

  const get25DayProgress = () => {
    if (has25DayBadge) return 100
    return Math.min((maxStreak / 25) * 100, 100)
  }

  return (
    <Card className="rounded-md bg-white overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-utsa-midnight">
          <Trophy className="h-4 w-4 text-utsa-orange" />
          Badge Collection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current Streak Display */}
        {(currentStreak > 0 || maxStreak > 0) && (
          <div className="bg-utsa-surface rounded-md px-3 py-2 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                <div>
                  <p className="text-sm font-medium text-utsa-midnight">
                    Current Streak: {currentStreak} {currentStreak === 1 ? "day" : "days"}
                  </p>
                  <p className="text-xs text-utsa-muted">
                    Best Streak: {maxStreak} {maxStreak === 1 ? "day" : "days"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Badge Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 10-Day Streak Badge */}
          <div
            className={`relative rounded-md border-2 p-3 transition-all ${
              has10DayBadge
                ? `${BADGE_INFO.streak_10_day.bgColor} ${BADGE_INFO.streak_10_day.borderColor}`
                : "bg-gray-50 border-gray-200 opacity-60"
            }`}
          >
            {!has10DayBadge && (
              <div className="absolute top-2 right-2">
                <Lock className="h-3 w-3 text-gray-400" />
              </div>
            )}
            <div className="flex items-start gap-3">
              <div
                className={`text-3xl ${has10DayBadge ? "grayscale-0" : "grayscale opacity-50"}`}
                aria-label={BADGE_INFO.streak_10_day.name}
              >
                {BADGE_INFO.streak_10_day.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-semibold ${
                    has10DayBadge ? BADGE_INFO.streak_10_day.color : "text-gray-500"
                  }`}
                >
                  {BADGE_INFO.streak_10_day.name}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">{BADGE_INFO.streak_10_day.description}</p>
                <div className="mt-2">
                  {has10DayBadge ? (
                    <Badge className="bg-emerald-500 text-white text-[10px] px-1.5 py-0 h-5">
                      Earned
                    </Badge>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-gray-600">
                        <span>{maxStreak}/10 days</span>
                        <span>{Math.round(get10DayProgress())}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-orange-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${get10DayProgress()}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-gray-600 mt-2 font-medium">
                  Reward: {BADGE_INFO.streak_10_day.reward}
                </p>
              </div>
            </div>
          </div>

          {/* 25-Day Streak Badge */}
          <div
            className={`relative rounded-md border-2 p-3 transition-all ${
              has25DayBadge
                ? `${BADGE_INFO.streak_25_day.bgColor} ${BADGE_INFO.streak_25_day.borderColor}`
                : "bg-gray-50 border-gray-200 opacity-60"
            }`}
          >
            {!has25DayBadge && (
              <div className="absolute top-2 right-2">
                <Lock className="h-3 w-3 text-gray-400" />
              </div>
            )}
            <div className="flex items-start gap-3">
              <div
                className={`text-3xl ${has25DayBadge ? "grayscale-0" : "grayscale opacity-50"}`}
                aria-label={BADGE_INFO.streak_25_day.name}
              >
                {BADGE_INFO.streak_25_day.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-semibold ${
                    has25DayBadge ? BADGE_INFO.streak_25_day.color : "text-gray-500"
                  }`}
                >
                  {BADGE_INFO.streak_25_day.name}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">{BADGE_INFO.streak_25_day.description}</p>
                <div className="mt-2">
                  {has25DayBadge ? (
                    <div className="flex flex-col gap-1">
                      <Badge className="bg-emerald-500 text-white text-[10px] px-1.5 py-0 h-5 w-fit">
                        Earned
                      </Badge>
                      <Badge className="bg-purple-500 text-white text-[10px] px-1.5 py-0 h-5 w-fit">
                        Active Multiplier
                      </Badge>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-gray-600">
                        <span>{maxStreak}/25 days</span>
                        <span>{Math.round(get25DayProgress())}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-yellow-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${get25DayProgress()}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-gray-600 mt-2 font-medium">
                  Reward: {BADGE_INFO.streak_25_day.reward}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Active Multiplier Notice */}
        {has25DayBadge && (
          <div className="bg-purple-50 border border-purple-200 rounded-md p-3 mt-3">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-purple-600" />
              <div>
                <p className="text-sm font-semibold text-purple-800">2x Multiplier Active!</p>
                <p className="text-xs text-purple-700">All your daily coins are doubled permanently</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
