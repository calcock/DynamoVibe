import { notifications } from '@mantine/notifications'

export function notifyError(title: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  notifications.show({ color: 'red', title, message, autoClose: 8000 })
}

export function notifySuccess(title: string, message?: string): void {
  notifications.show({ color: 'green', title, message })
}
