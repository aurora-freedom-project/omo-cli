export interface TimingConfig {
  readonly POLL_INTERVAL_MS: number
  readonly MIN_STABILITY_TIME_MS: number
  readonly STABILITY_POLLS_REQUIRED: number
  readonly WAIT_FOR_SESSION_INTERVAL_MS: number
  readonly WAIT_FOR_SESSION_TIMEOUT_MS: number
  readonly MAX_POLL_TIME_MS: number
  readonly SESSION_CONTINUATION_STABILITY_MS: number
}

const DEFAULTS: TimingConfig = Object.freeze({
  POLL_INTERVAL_MS: 500,
  MIN_STABILITY_TIME_MS: 10000,
  STABILITY_POLLS_REQUIRED: 3,
  WAIT_FOR_SESSION_INTERVAL_MS: 100,
  WAIT_FOR_SESSION_TIMEOUT_MS: 30000,
  MAX_POLL_TIME_MS: 10 * 60 * 1000,
  SESSION_CONTINUATION_STABILITY_MS: 5000,
})

let _config: TimingConfig = DEFAULTS

export function getTimingConfig(): TimingConfig {
  return _config
}

export function __resetTimingConfig(): void {
  _config = DEFAULTS
}

export function __setTimingConfig(overrides: Partial<TimingConfig>): void {
  _config = Object.freeze({ ..._config, ...overrides })
}

