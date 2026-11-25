/** Client-safe badge thresholds / rewards (no DB imports). */

/** Semester-wide coin total required to unlock the Grand Master badge. */
export const GRAND_MASTER_COIN_THRESHOLD = 100

/** Coins awarded when a student qualifies on a holiday special day (total, not 1+5). */
export const HOLIDAY_COINS_PER_DAY = 5

/** Default coins awarded when a student scores 100 on the course survey. */
export const SURVEY_COMPLETE_COINS = 10

/** Coin-adjustment reason used for survey completion rewards (idempotent matching). */
export const SURVEY_COIN_REASON = "Badge earned: Survey Complete"
