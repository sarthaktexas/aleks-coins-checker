import { revalidateTag } from "next/cache"

/** Shared cache tag for student portal reads. Bust on any data mutation. */
export const STUDENT_DATA_CACHE_TAG = "student-data"

export function bustStudentDataCache() {
  try {
    revalidateTag(STUDENT_DATA_CACHE_TAG)
  } catch (error) {
    // revalidateTag throws outside of a Next.js request/context in some tooling
    console.warn("Could not revalidate student data cache:", error)
  }
}
