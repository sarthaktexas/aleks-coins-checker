"use client"

import { explainCoinTotal } from "@/lib/day-credits"

type DailyLogDay = {
  date?: string
  qualified?: boolean
  isExcluded?: boolean
  isCoinOnlyExempt?: boolean
  isHoliday?: boolean
  wouldHaveQualified?: boolean
  isDoubleCoins?: boolean
  isOverridden?: boolean
  overrideType?: string
}

type CoinBreakdownPanelProps = {
  dailyLog: DailyLogDay[]
  /** YYYY-MM-DD when 25-day 2x starts; omit/null if no badge */
  multiplierFromDate?: string | null
  /** Period-scoped adjustments (streak bonus, manual). Not global redemptions. */
  periodAdjustment?: number
  /** Optional list of adjustment rows for display */
  adjustments?: Array<{
    adjustment_amount: number
    reason?: string | null
    created_at?: string
  }>
  className?: string
}

function Row({
  label,
  value,
  detail,
  emphasize,
}: {
  label: string
  value: string | number
  detail?: string
  emphasize?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1 ${
        emphasize ? "font-semibold text-utsa-midnight" : "text-utsa-muted"
      }`}
    >
      <div className="min-w-0">
        <span className={emphasize ? "text-sm" : "text-xs"}>{label}</span>
        {detail ? <span className="ml-1 text-[10px] font-normal text-utsa-muted">{detail}</span> : null}
      </div>
      <span className={`tabular-nums shrink-0 ${emphasize ? "text-sm" : "text-xs text-utsa-midnight"}`}>
        {value}
      </span>
    </div>
  )
}

function formatSigned(n: number) {
  if (n > 0) return `+${n}`
  return String(n)
}

/**
 * Admin-facing arithmetic for how a period coin total is built.
 */
export function CoinBreakdownPanel({
  dailyLog,
  multiplierFromDate = null,
  periodAdjustment = 0,
  adjustments,
  className = "",
}: CoinBreakdownPanelProps) {
  const expl = explainCoinTotal(dailyLog || [], { multiplierFromDate, periodAdjustment })
  const hasMultiplier = !!expl.multiplierFromDate

  return (
    <div
      className={`rounded-md border border-[rgba(3,32,68,0.12)] bg-white p-3 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-utsa-midnight">Coin total breakdown</h4>
        <span className="text-[10px] text-utsa-muted">Period formula</span>
      </div>

      <div className="space-y-0.5 border-b border-utsa-border pb-2 mb-2">
        <Row
          label="Qualified working days"
          value={expl.qualifiedWorkingDays}
          detail="1 coin each"
        />
        <Row
          label="Double-coin extras"
          value={formatSigned(expl.doubleCoinsEarned)}
          detail={expl.doubleCoinsEarned > 0 ? "+1 on top of qualified" : undefined}
        />
        <Row
          label="Standard exempt credits"
          value={formatSigned(expl.exemptDayCredits)}
          detail="coin + EC%"
        />
        <Row
          label="Coins-only exempt"
          value={formatSigned(expl.coinOnlyExemptCredits)}
          detail="coin only, no EC%"
        />
        <Row
          label="Holiday coins"
          value={formatSigned(expl.holidayCoinsEarned)}
          detail={
            expl.holidayDaysCompleted > 0
              ? `${expl.holidayDaysCompleted} × 5`
              : "5 each if qualified"
          }
        />
        <Row label="Base coins" value={expl.coins} emphasize />
      </div>

      <div className="space-y-0.5 border-b border-utsa-border pb-2 mb-2">
        {hasMultiplier ? (
          <>
            <Row
              label="2× from unlock day"
              value={expl.multiplierFromDate!}
              detail="prospective, not retroactive"
            />
            <Row
              label="Before unlock"
              value={`${expl.baseBeforeMultiplier} ×1`}
            />
            <Row
              label="On/after unlock"
              value={`${expl.baseOnOrAfterMultiplier} ×2 = ${expl.baseOnOrAfterMultiplier * 2}`}
            />
            <Row
              label="After 2×"
              value={expl.multipliedCoins}
              detail={expl.multiplierBonus > 0 ? `+${expl.multiplierBonus} from badge` : undefined}
              emphasize
            />
          </>
        ) : (
          <Row label="2× streak badge" value="not earned" detail="no multiplier" />
        )}
      </div>

      <div className="space-y-0.5">
        <Row
          label="Period adjustments"
          value={formatSigned(expl.periodAdjustment)}
          detail="streak bonuses, manual"
        />
        {adjustments && adjustments.length > 0 && (
          <ul className="mt-1 mb-1 space-y-0.5 pl-2 border-l-2 border-utsa-border">
            {adjustments.map((adj, i) => (
              <li key={i} className="text-[10px] text-utsa-muted flex justify-between gap-2">
                <span className="truncate">{adj.reason || "Adjustment"}</span>
                <span className="tabular-nums shrink-0 text-utsa-midnight">
                  {formatSigned(adj.adjustment_amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Row label="Period total" value={expl.periodTotal} emphasize />
      </div>

      <p className="mt-2 text-[10px] text-utsa-muted leading-snug">
        Semester balance also subtracts global redemptions. Extra credit % uses qualified
        working days + standard exempt + holidays ÷ completed working days
        ({expl.percentComplete}%).
      </p>
    </div>
  )
}
