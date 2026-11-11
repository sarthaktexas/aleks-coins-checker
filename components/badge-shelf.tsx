"use client"

import { useState } from "react"
import { Flame, Star, Wand2 } from "lucide-react"
import { BadgeShield, type ShieldKind } from "@/components/badge-shield"
import { GRAND_MASTER_COIN_THRESHOLD } from "@/lib/badge-constants"
import {
  HOLIDAY_BADGE_TYPES,
  holidayBadgeShortName,
  normalizeHolidayBadgeType,
  type HolidayBadgeType,
} from "@/lib/holiday-breaks"

type BadgeType = "streak_10_day" | "streak_25_day" | "holiday" | HolidayBadgeType | "grand_master"

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
  holidayDaysCompleted?: number
  /** Coins earned across the current semester (all periods). */
  semesterCoins?: number
}

type FixedShelfSlot =
  | {
      kind: "streak_10_day" | "streak_25_day" | "grand_master"
      name: string
      requirement: number
      reward: string
    }
  | {
      kind: "holiday_slot"
      name: string
      reward: string
    }
  | {
      kind: "mystery"
      id: string
    }

const SLOTS: FixedShelfSlot[] = [
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
    reward: "2× from unlock day",
  },
  {
    kind: "holiday_slot",
    name: "Holiday",
    reward: "5 coins per day",
  },
  {
    kind: "grand_master",
    name: "Grand Master",
    requirement: GRAND_MASTER_COIN_THRESHOLD,
    reward: `${GRAND_MASTER_COIN_THRESHOLD}+ semester coins`,
  },
  {
    kind: "mystery",
    id: "mystery-1",
  },
]

const SHIELD_CLASS = "relative h-[4.75rem] w-14 drop-shadow-md sm:h-28 sm:w-24"

/** Resting + hover fan transforms for 1–3 stacked shields (index 0 = back). */
function stackPose(count: number, index: number): { rest: string; fan: string; z: number } {
  const center = "translateX(-50%)"

  if (count <= 1) {
    return {
      rest: `${center} translate(0,0) rotate(0deg)`,
      fan: `${center} translate(0,0) rotate(0deg)`,
      z: 10,
    }
  }

  if (count === 2) {
    return index === 0
      ? {
          rest: `${center} translate(-10px,-4px) rotate(-8deg)`,
          fan: `${center} translate(-42px,-14px) rotate(-18deg)`,
          z: 10,
        }
      : {
          rest: `${center} translate(10px,2px) rotate(8deg)`,
          fan: `${center} translate(42px,-8px) rotate(18deg)`,
          z: 20,
        }
  }

  if (index === 0) {
    return {
      rest: `${center} translate(-12px,-6px) rotate(-11deg)`,
      fan: `${center} translate(-52px,-18px) rotate(-22deg)`,
      z: 10,
    }
  }
  if (index === 1) {
    return {
      rest: `${center} translate(0,-3px) rotate(0deg)`,
      fan: `${center} translate(0,-28px) rotate(0deg)`,
      z: 20,
    }
  }
  return {
    rest: `${center} translate(12px,3px) rotate(11deg)`,
    fan: `${center} translate(52px,-12px) rotate(22deg)`,
    z: 30,
  }
}

function StackedSameShields({
  kind,
  unlocked,
  count,
}: {
  kind: Exclude<ShieldKind, "mystery">
  unlocked: boolean
  count: number
}) {
  const [fanned, setFanned] = useState(false)
  const stackCount = unlocked ? Math.max(1, Math.min(count, 3)) : 1
  const fannable = unlocked && stackCount > 1

  return (
    <div
      className={`relative flex h-[4.75rem] w-14 items-end justify-center sm:h-28 sm:w-24 ${fannable ? "cursor-pointer" : ""}`}
      tabIndex={fannable ? 0 : undefined}
      onMouseEnter={() => fannable && setFanned(true)}
      onMouseLeave={() => setFanned(false)}
      onFocus={() => fannable && setFanned(true)}
      onBlur={() => setFanned(false)}
      aria-label={fannable ? `${stackCount} stacked badges` : undefined}
    >
      {Array.from({ length: stackCount }, (_, index) => {
        const pose = stackPose(stackCount, index)
        return (
          <div
            key={`${kind}-${index}`}
            className="absolute bottom-0 left-1/2 origin-bottom transition-transform duration-300 ease-out will-change-transform"
            style={{
              zIndex: pose.z,
              transform: fanned ? pose.fan : pose.rest,
            }}
          >
            <BadgeShield
              kind={kind}
              unlocked={unlocked}
              instanceKey={`${kind}-${index}`}
              className={SHIELD_CLASS}
            />
          </div>
        )
      })}
    </div>
  )
}

/** Students only see holiday designs they've already unlocked. */
function StackedHolidayShields({ kinds }: { kinds: HolidayBadgeType[] }) {
  const [fanned, setFanned] = useState(false)
  const stackCount = Math.max(1, Math.min(kinds.length, 4))
  const fannable = kinds.length > 1
  const shown = kinds.slice(0, 4)

  if (shown.length === 0) {
    return (
      <BadgeShield kind="holiday_winter" unlocked={false} instanceKey="holiday-locked" className={SHIELD_CLASS} />
    )
  }

  return (
    <div
      className={`relative flex h-[4.75rem] w-14 items-end justify-center sm:h-28 sm:w-24 ${fannable ? "cursor-pointer" : ""}`}
      tabIndex={fannable ? 0 : undefined}
      onMouseEnter={() => fannable && setFanned(true)}
      onMouseLeave={() => setFanned(false)}
      onFocus={() => fannable && setFanned(true)}
      onBlur={() => setFanned(false)}
      aria-label={
        fannable
          ? `${shown.length} holiday badges: ${shown.map(holidayBadgeShortName).join(", ")}`
          : holidayBadgeShortName(shown[0])
      }
    >
      {shown.map((kind, index) => {
        const pose = stackPose(stackCount, index)
        return (
          <div
            key={kind}
            className="absolute bottom-0 left-1/2 origin-bottom transition-transform duration-300 ease-out will-change-transform"
            style={{
              zIndex: pose.z,
              transform: fanned ? pose.fan : pose.rest,
            }}
          >
            <BadgeShield kind={kind} unlocked instanceKey={`holiday-${kind}`} className={SHIELD_CLASS} />
          </div>
        )
      })}
    </div>
  )
}

function earnedHolidayKinds(badges: BadgeData[]): HolidayBadgeType[] {
  const found = new Set<HolidayBadgeType>()
  for (const badge of badges) {
    const normalized = normalizeHolidayBadgeType(badge.badge_type)
    if (normalized) found.add(normalized)
  }
  // Stable visual order matching admin catalog
  return HOLIDAY_BADGE_TYPES.filter((kind) => found.has(kind))
}

export function BadgeShelf({
  badges,
  currentStreak = 0,
  maxStreak = 0,
  holidayDaysCompleted = 0,
  semesterCoins = 0,
}: BadgeShelfProps) {
  const earned = new Set(badges.map((b) => b.badge_type))
  // Progress uses the same semester total as the header; treat threshold met as unlocked
  // even if badge processing has not written the row yet.
  const grandMasterUnlocked =
    earned.has("grand_master") || semesterCoins >= GRAND_MASTER_COIN_THRESHOLD
  if (grandMasterUnlocked) earned.add("grand_master")
  const holidayKinds = earnedHolidayKinds(badges)
  const hasAnyHoliday = holidayKinds.length > 0
  const tenDayPeriods = new Set(
    badges.filter((b) => b.badge_type === "streak_10_day").map((b) => b.period || b.id || "earned"),
  ).size
  const unlockedCount = SLOTS.filter((slot) => {
    if (slot.kind === "mystery") return false
    if (slot.kind === "holiday_slot") return hasAnyHoliday
    return earned.has(slot.kind)
  }).length

  return (
    <section className="rounded-md border border-utsa-border bg-white">
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
        <div className="overflow-visible rounded-md bg-[#f6f1e8] px-1 pt-6 sm:px-2 sm:pt-8">
          <div className="grid grid-cols-5 items-end gap-0.5 overflow-visible sm:gap-1">
            {SLOTS.map((slot) => {
              if (slot.kind === "mystery") {
                return (
                  <div key={slot.id} className="relative z-10 -mb-2.5 flex justify-center overflow-visible sm:-mb-3">
                    <BadgeShield
                      kind="mystery"
                      unlocked={false}
                      mysteryId={slot.id}
                      className={SHIELD_CLASS}
                    />
                  </div>
                )
              }

              if (slot.kind === "holiday_slot") {
                return (
                  <div
                    key="holiday_slot"
                    className="relative z-10 -mb-2.5 flex justify-center overflow-visible sm:-mb-3"
                  >
                    <StackedHolidayShields kinds={holidayKinds} />
                  </div>
                )
              }

              const unlocked = earned.has(slot.kind)
              const stackCount =
                slot.kind === "streak_10_day"
                  ? Math.min(Math.max(tenDayPeriods, unlocked ? 1 : 0), 3)
                  : unlocked
                    ? 1
                    : 0

              return (
                <div
                  key={slot.kind}
                  className="relative z-10 -mb-2.5 flex justify-center overflow-visible sm:-mb-3"
                >
                  <StackedSameShields kind={slot.kind} unlocked={unlocked} count={stackCount} />
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

              if (slot.kind === "holiday_slot") {
                const unlocked = hasAnyHoliday
                const names = holidayKinds.map(holidayBadgeShortName)
                return (
                  <div key="holiday_slot-meta" className="px-0.5 text-center sm:px-1">
                    <p
                      className={`text-[11px] font-semibold leading-tight sm:text-sm ${unlocked ? "text-utsa-midnight" : "text-utsa-muted"}`}
                    >
                      {unlocked && names.length === 1 ? names[0] : "Holiday"}
                    </p>
                    <p className="text-[10px] text-utsa-muted">
                      {unlocked ? (names.length > 1 ? `${names.length} unlocked` : "Unlocked") : "Locked"}
                    </p>
                    <p className="hidden text-[10px] text-utsa-muted sm:block">
                      {unlocked
                        ? names.length > 1
                          ? names.join(" · ")
                          : `${slot.reward}${holidayDaysCompleted > 0 ? ` · ${holidayDaysCompleted} day${holidayDaysCompleted === 1 ? "" : "s"}` : ""}`
                        : "Earn by working a holiday"}
                    </p>
                    <div className="mx-auto mt-1.5 max-w-[5.5rem] sm:max-w-[7rem]">
                      <div className="mb-1 flex justify-between text-[9px] text-utsa-muted sm:text-[10px]">
                        <span>
                          {unlocked ? `${holidayKinds.length}/${HOLIDAY_BADGE_TYPES.length}` : `0/1`}
                        </span>
                        <span>{unlocked ? Math.round((holidayKinds.length / HOLIDAY_BADGE_TYPES.length) * 100) : 0}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                        <div
                          className={`h-full rounded-full ${unlocked ? "bg-emerald-500" : "bg-emerald-600"}`}
                          style={{
                            width: `${unlocked ? Math.round((holidayKinds.length / HOLIDAY_BADGE_TYPES.length) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )
              }

              const unlocked = earned.has(slot.kind)
              const repeated = slot.kind === "streak_10_day" && tenDayPeriods >= 2
              const grandProgress =
                slot.kind === "grand_master" ? Math.min(semesterCoins, slot.requirement) : 0
              const progress = repeated
                ? Math.round((Math.min(tenDayPeriods, 3) / 3) * 100)
                : unlocked
                  ? 100
                  : slot.kind === "grand_master"
                    ? Math.round((grandProgress / slot.requirement) * 100)
                    : Math.min(100, Math.round((maxStreak / slot.requirement) * 100))
              const progressLabel = repeated
                ? `${Math.min(tenDayPeriods, 3)}/3`
                : slot.kind === "grand_master"
                  ? `${Math.min(semesterCoins, slot.requirement)}/${slot.requirement}`
                  : `${unlocked ? slot.requirement : Math.min(maxStreak, slot.requirement)}/${slot.requirement}`
              const unlockText = !unlocked
                ? "Locked"
                : repeated
                  ? `Unlocked ${Math.min(tenDayPeriods, 3)}×`
                  : "Unlocked"

              return (
                <div key={`${slot.kind}-meta`} className="px-0.5 text-center sm:px-1">
                  <p
                    className={`text-[11px] font-semibold leading-tight sm:text-sm ${unlocked ? "text-utsa-midnight" : "text-utsa-muted"}`}
                  >
                    {slot.name}
                  </p>
                  <p className="text-[10px] text-utsa-muted">{unlockText}</p>
                  <p className="hidden text-[10px] text-utsa-muted sm:block">
                    {slot.kind === "streak_10_day"
                      ? `${slot.reward} · ${tenDayPeriods}/3`
                      : slot.kind === "grand_master"
                        ? `${slot.reward} · ${semesterCoins} now`
                        : slot.reward}
                  </p>
                  <div className="mx-auto mt-1.5 max-w-[5.5rem] sm:max-w-[7rem]">
                    <div className="mb-1 flex justify-between text-[9px] text-utsa-muted sm:text-[10px]">
                      <span>{progressLabel}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                      <div
                        className={`h-full rounded-full ${
                          unlocked
                            ? "bg-emerald-500"
                            : slot.kind === "streak_10_day"
                              ? "bg-utsa-orange"
                              : slot.kind === "grand_master"
                                ? "bg-violet-600"
                                : "bg-amber-500"
                        }`}
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
              <span className="font-semibold">2× multiplier is on.</span> Daily coins from the unlock
              day forward are doubled, even if the streak breaks.
            </p>
          </div>
        )}

        {hasAnyHoliday && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
            <span className="text-sm" aria-hidden>
              🎄
            </span>
            <p className="text-xs text-emerald-900">
              <span className="font-semibold">
                Holiday badge{holidayKinds.length === 1 ? "" : "s"} unlocked.
              </span>{" "}
              {holidayKinds.map(holidayBadgeShortName).join(", ")}. Each holiday day is worth 5
              coins.
            </p>
          </div>
        )}

        {earned.has("grand_master") && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2">
            <Wand2 className="h-4 w-4 text-violet-700" />
            <p className="text-xs text-violet-900">
              <span className="font-semibold">Grand Master unlocked.</span> You earned{" "}
              {GRAND_MASTER_COIN_THRESHOLD}+ coins across a semester.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
