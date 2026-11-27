import { defineConfig } from 'vitest/config'

// Unit tests cover the platform's plain logic (feature resolution, update
// channels, the host/container update protocol, migrations). They don't need
// the TanStack Start plugins, so this config is deliberately separate.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
