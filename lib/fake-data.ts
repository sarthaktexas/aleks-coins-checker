import { faker } from "@faker-js/faker"

/**
 * Generate deterministic fake data for a student ID.
 * Same ID always gets same fake data (for consistent display when anonymized).
 */
export function getFakeDataForStudent(studentId: string) {
  const hash = studentId
    .split("")
    .reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
  faker.seed(Math.abs(hash))
  return {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    studentId: faker.string.alphanumeric(6).toLowerCase(),
  }
}
