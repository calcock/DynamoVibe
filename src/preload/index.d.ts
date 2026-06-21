import type { DynamiteApi } from '@shared/ipc'

declare global {
  interface Window {
    api: DynamiteApi
  }
}

export {}
