export type ConfigLoadError = {
  path: string
  error: string
}

const _state = (() => {
  let errors: ConfigLoadError[] = []
  return {
    get: (): readonly ConfigLoadError[] => errors,
    add: (error: ConfigLoadError) => { errors.push(error) },
    clear: () => { errors = [] },
  }
})()

export function getConfigLoadErrors(): readonly ConfigLoadError[] {
  return _state.get()
}

export function clearConfigLoadErrors(): void {
  _state.clear()
}

export function addConfigLoadError(error: ConfigLoadError): void {
  _state.add(error)
}

