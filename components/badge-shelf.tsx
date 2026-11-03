"use client"

import { Flame, Star } from "lucide-react"
import { BadgeShield, type ShieldKind } from "@/components/badge-shield"

type BadgeType = "streak_10_day" | "streak_25_day"

type BadgeData = {
  id?: number
  badge_type: BadgeType
  earned_at?: string
  streak_count?: number
  period?: string
}

type BadgeShelfProps = {
  badges: BadgeData[]
  currentStreak?: number
  maxStreak?: number
}

type ShelfSlot =
  | {
      kind: "streak_10_day" | "streak_25_day"
      name: string
      requirement: number
      reward: string
    }
  | {
      kind: "mystery"
      id: string
    }

const SLOTS: ShelfSlot[] = [
  {
    kind: "streak_10_day",
    name: "10-Day Streak",
    requirement: 10,
    reward: "+10 once per period",
  },
  {
    kind: "streak_25_day",
    name: "25-Day Streak",
    requirement: 25,
    reward: "2× coins forever",
  },
  {
    kind: "mystery",
    id: "mystery-1",
  },
  {
    kind: "mystery",
    id: "mystery-2",
  },
  {
    kind: "mystery",
    id: "mystery-3",
  },
]

export function BadgeShelf({ badges, currentStreak = 0, maxStreak = 0 }: BadgeShelfProps) {
  const earned = new Set(badges.map((b) => b.badge_type))
  const tenDayPeriods = new Set(
    badges.filter((b) => b.badge_type === "streak_10_day").map((b) => b.period || b.id || "earned"),
  ).size
  const unlockedCount = SLOTS.filter(
    (slot) => slot.kind !== "mystery" && earned.has(slot.kind),
  ).length

  return (
    <section className="overflow-hidden rounded-md border border-utsa-border bg-white">
      <div className="flex flex-col gap-2 px-4 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="text-sm font-semibold text-utsa-midnight">Badge shelf</h2>
          <p className="text-xs text-utsa-muted">
            Unlock shields as you go · {unlockedCount}/5 revealed
          </p>
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
        <div className="rounded-md bg-[#f6f1e8] px-1 pt-3 sm:px-2">
          <div className="grid grid-cols-5 items-end gap-0.5 sm:gap-1">
            {SLOTS.map((slot) => {
              const unlocked = slot.kind !== "mystery" && earned.has(slot.kind)
              const shieldKind: ShieldKind = slot.kind
              return (
                <div key={slot.kind === "mystery" ? slot.id : slot.kind} className="flex justify-center">
                  <BadgeShield
                    kind={shieldKind}
                    unlocked={unlocked}
                    mysteryId={slot.kind === "mystery" ? slot.id : undefined}
                    className="relative z-10 -mb-2.5 h-[4.75rem] w-14 drop-shadow-md sm:-mb-3 sm:h-28 sm:w-24"
                  />
                </div>
              )
            })}
          </div>

          <div className="relative z-20 h-3.5 rounded-sm bg-gradient-to-b from-[#d7b98a] via-[#b48955] to-[#8a6236] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_0_#6d4c28]" />
          <div className="mx-6 mb-1 h-2 rounded-b bg-[#6b4c2a] sm:mx-10" />

          <div className="grid grid-cols-5 gap-0.5 pb-3 pt-2 sm:gap-1">
            {SLOTS.map((slot) => {
              if (slot.kind === "mystery") {
                return <div key={`${slot.id}-meta`} aria-hidden="true" />
              }

              const unlocked = earned.has(slot.kind)
              const progress = unlocked
                ? 100
                : Math.min(100, Math.round((maxStreak / slot.requirement) * 100))
              const days = unlocked ? slot.requirement : Math.min(maxStreak, slot.requirement)

              return (
                <div key={`${slot.kind}-meta`} className="px-0.5 text-center sm:px-1">
                  <p
                    className={`text-[11px] font-semibold leading-tight sm:text-sm ${unlocked ? "text-utsa-midnight" : "text-utsa-muted"}`}
                  >
                    {slot.name}
                  </p>
                  <p className="text-[10px] text-utsa-muted">
                    {unlocked ? "Unlocked" : "Locked"}
                  </p>
                  <p className="hidden text-[10px] text-utsa-muted sm:block">
                    {slot.kind === "streak_10_day" ? `${slot.reward} · ${tenDayPeriods}/3` : slot.reward}
                  </p>
                  <div className="mx-auto mt-1.5 max-w-[5.5rem] sm:max-w-[7rem]">
                    <div className="mb-1 flex justify-between text-[9px] text-utsa-muted sm:text-[10px]">
                      <span>
                        {days}/{slot.requirement}
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                      <div
                        className={`h-full rounded-full ${unlocked ? "bg-emerald-500" : slot.kind === "streak_10_day" ? "bg-utsa-orange" : "bg-amber-500"}`}
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
              <span className="font-semibold">2× multiplier is on.</span> Every future daily coin is
              doubled, even if the streak breaks.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
