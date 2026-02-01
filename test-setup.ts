import { beforeEach, afterEach } from "bun:test"
import { _resetForTesting } from "./src/features/claude-code-session-state/state"

// Store original environment values
const originalEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  _resetForTesting()
  // Save TMUX env before each test
  originalEnv.TMUX = process.env.TMUX
})

afterEach(() => {
  // Restore TMUX env after each test
  if (originalEnv.TMUX === undefined) {
    delete process.env.TMUX
  } else {
    process.env.TMUX = originalEnv.TMUX
  }
})
