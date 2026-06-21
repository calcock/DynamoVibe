import type { DynamoVibeApi } from '@shared/ipc'

declare global {
  interface Window {
    api: DynamoVibeApi
  }
}

export {}
