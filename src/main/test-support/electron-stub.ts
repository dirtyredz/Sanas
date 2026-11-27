// Vitest aliases `electron` here so an unmocked import fails on every machine, not only in CI
// where `npm ci --ignore-scripts` leaves the real package without its binary path.
throw new Error(
  'unmocked electron import in a unit test: vi.mock("electron") or inject the dependency',
)
