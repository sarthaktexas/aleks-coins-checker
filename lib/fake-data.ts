import { faker } from "@faker-js/faker"

/**
 * Generate deterministic fake data for a student ID.
 * Same ID always gets same fake data (for consistent display when anonymized).
 * - Names: simple first + last name
 * - Emails: @my.utsa.edu
 * - IDs: 3 letters + 3 numbers (e.g., abc123)
 */
export function getFakeDataForStudent(studentId: string) {
  const hash = studentId
    .split("")
    .reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
  faker.seed(Math.abs(hash))
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  const emailLocal = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9.]/g, "")
  return {
    name: `${firstName} ${lastName}`,
    email: `${emailLocal}@my.utsa.edu`,
    studentId: faker.string.alpha(3).toLowerCase() + faker.string.numeric(3),
  }
}
