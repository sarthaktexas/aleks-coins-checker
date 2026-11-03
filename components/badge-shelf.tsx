"use client"

import { Flame, Star } from "lucide-react"
import { BadgeShield } from "@/components/badge-shield"

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

const SLOTS: Array<{
  type: BadgeType
  name: string
  requirement: number
  reward: string
}> = [
  {
    type: "streak_10_day",
    name: "10-Day Streak",
    requirement: 10,
    reward: "+10 coins",
  },
  {
    type: "streak_25_day",
    name: "25-Day Streak",
    requirement: 25,
    reward: "2× coins forever",
  },
]

export function BadgeShelf({ badges, currentStreak = 0, maxStreak = 0 }: BadgeShelfProps) {
  const earned = new Set(badges.map((b) => b.badge_type))

  return (
    <section className="overflow-hidden rounded-md border border-utsa-border bg-white">
      <div className="flex flex-col gap-2 px-4 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="text-sm font-semibold text-utsa-midnight">Badge shelf</h2>
          <p className="text-xs text-utsa-muted">Shields stay locked until you earn them</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-utsa-muted">
          <span className="inline-flex items-center gap-1">
            <Flame className="h-3.5 w-3.5 text-utsa-orange" />
            {currentStreak} day streak
          </span>
          <span>Best {maxStreak}</span>
        </div>
      </div>

      <div className="px-3 pb-4 pt-2 sm:px-5">
        <div className="rounded-md bg-[#f6f1e8] px-2 pt-3">
          <div className="grid grid-cols-2">
            {SLOTS.map((slot) => {
              const unlocked = earned.has(slot.type)
              return (
                <div key={slot.type} className="flex justify-center">
                  <BadgeShield
                    kind={slot.type}
                    unlocked={unlocked}
                    className="relative z-10 -mb-3 h-28 w-24 drop-shadow-md sm:h-36 sm:w-28"
                  />
                </div>
              )
            })}
          </div>
          <div className="relative z-20 h-3.5 rounded-sm bg-gradient-to-b from-[#d7b98a] via-[#b48955] to-[#8a6236] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_0_#6d4c28]" />
          <div className="mx-8 mb-1 h-2 rounded-b bg-[#6b4c2a]" />

          <div className="grid grid-cols-2 gap-2 pb-3 pt-2">
            {SLOTS.map((slot) => {
              const unlocked = earned.has(slot.type)
              const progress = unlocked ? 100 : Math.min(100, Math.round((maxStreak / slot.requirement) * 100))
              const days = unlocked ? slot.requirement : Math.min(maxStreak, slot.requirement)
              return (
                <div key={`${slot.type}-meta`} className="px-2 text-center">
                  <p className={`text-sm font-semibold ${unlocked ? "text-utsa-midnight" : "text-utsa-muted"}`}>
                    {slot.name}
                  </p>
                  <p className="text-[11px] text-utsa-muted">
                    {unlocked ? "Unlocked" : "Locked"} · {slot.reward}
                  </p>
                  <div className="mx-auto mt-2 max-w-[9rem]">
                    <div className="mb-1 flex justify-between text-[10px] text-utsa-muted">
                      <span>
                        {days}/{slot.requirement} days
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                      <div
                        className={`h-full rounded-full ${unlocked ? "bg-emerald-500" : slot.type === "streak_10_day" ? "bg-utsa-orange" : "bg-amber-500"}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {earned.has("streak_25_day") && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <Star className="h-4 w-4 text-amber-600" />
            <p className="text-xs text-amber-900">
              <span className="font-semibold">2× multiplier is on.</span> Every future daily coin is doubled, even if the streak breaks.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
