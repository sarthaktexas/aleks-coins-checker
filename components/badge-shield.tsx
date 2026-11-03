"use client"

type ShieldKind = "streak_10_day" | "streak_25_day"

type BadgeShieldProps = {
  kind: ShieldKind
  unlocked: boolean
  className?: string
}

/**
 * Heraldic shield icons for streak badges.
 * Locked shields stay on the shelf as silhouettes until earned.
 */
export function BadgeShield({ kind, unlocked, className }: BadgeShieldProps) {
  const id = kind === "streak_10_day" ? "ten" : "twentyfive"
  return (
    <svg
      viewBox="0 0 120 140"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          {kind === "streak_10_day" ? (
            <>
              <stop offset="0%" stopColor={unlocked ? "#ffb070" : "#c8cdd4"} />
              <stop offset="45%" stopColor={unlocked ? "#f15a22" : "#9aa3ae"} />
              <stop offset="100%" stopColor={unlocked ? "#9a2e0c" : "#6b7280"} />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor={unlocked ? "#fff4c2" : "#c8cdd4"} />
              <stop offset="40%" stopColor={unlocked ? "#f5c542" : "#9aa3ae"} />
              <stop offset="100%" stopColor={unlocked ? "#a16207" : "#6b7280"} />
            </>
          )}
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={unlocked ? "#fff7e6" : "#e5e7eb"} />
          <stop offset="50%" stopColor={unlocked ? (kind === "streak_10_day" ? "#ffd7a8" : "#ffe08a") : "#d1d5db"} />
          <stop offset="100%" stopColor={unlocked ? "#8a5a20" : "#9ca3af"} />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={unlocked ? 0.55 : 0.25} />
          <stop offset="40%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-10%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodOpacity="0.35" />
        </filter>
      </defs>

      <g filter={unlocked ? `url(#${id}-shadow)` : undefined} opacity={unlocked ? 1 : 0.72}>
        <path
          d="M60 6 L108 22 V68 C108 98 86 120 60 134 C34 120 12 98 12 68 V22 Z"
          fill={`url(#${id}-body)`}
          stroke={`url(#${id}-rim)`}
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d="M60 16 L98 29 V66 C98 90 80 108 60 120 C40 108 22 90 22 66 V29 Z"
          fill="none"
          stroke={unlocked ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.2)"}
          strokeWidth="1.5"
        />
        <path
          d="M28 28 C40 22 52 20 60 20 C52 36 40 48 28 56 Z"
          fill={`url(#${id}-shine)`}
        />

        {kind === "streak_10_day" ? <FlameEmblem unlocked={unlocked} /> : <StarEmblem unlocked={unlocked} />}

        <path
          d="M36 96 h48 l-4 10 h-40 z"
          fill={unlocked ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.18)"}
        />
        <text
          x="60"
          y="105"
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill={unlocked ? "#fff8ee" : "#f3f4f6"}
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        >
          {kind === "streak_10_day" ? "10" : "25"}
        </text>
      </g>

      {!unlocked && (
        <g transform="translate(78 8)">
          <rect x="0" y="8" width="22" height="16" rx="3" fill="#374151" />
          <path
            d="M5 8 V6 a6 6 0 0 1 12 0 V8"
            fill="none"
            stroke="#374151"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  )
}

function FlameEmblem({ unlocked }: { unlocked: boolean }) {
  const fill = unlocked ? "#fff7ed" : "#f3f4f6"
  return (
    <g transform="translate(42 34) scale(1.5)" opacity={unlocked ? 0.98 : 0.75}>
      <path
        d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
        fill={fill}
      />
    </g>
  )
}

function StarEmblem({ unlocked }: { unlocked: boolean }) {
  const fill = unlocked ? "#fffbeb" : "#f3f4f6"
  return (
    <path
      d="M60 36 l5.2 10.6 11.7 1.7-8.5 8.2 2 11.6L60 62.6 49.6 68.1l2-11.6-8.5-8.2 11.7-1.7z"
      fill={fill}
      opacity={unlocked ? 0.95 : 0.7}
    />
  )
}
