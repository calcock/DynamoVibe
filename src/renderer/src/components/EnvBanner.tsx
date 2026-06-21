import { Group, Text } from '@mantine/core'
import { IconLock, IconWorld } from '@tabler/icons-react'
import type { ConnectionConfig } from '@shared/types'
import { ENV_COLORS } from '../lib/docValue'

export function EnvBanner({ connection }: { connection: ConnectionConfig }): JSX.Element {
  const color = ENV_COLORS[connection.env]
  return (
    <Group
      gap="xs"
      px="sm"
      py={4}
      style={{
        backgroundColor: `var(--mantine-color-${color}-light)`,
        borderBottom: `2px solid var(--mantine-color-${color}-filled)`,
        flexShrink: 0
      }}
    >
      <IconWorld size={14} color={`var(--mantine-color-${color}-filled)`} />
      <Text size="xs" fw={600} c={color}>
        {connection.name}
      </Text>
      <Text size="xs" c="dimmed">
        {connection.env} · {connection.region}
        {connection.endpoint ? ` · ${connection.endpoint}` : ''}
      </Text>
      {connection.readOnly && (
        <Group gap={3} ml="auto">
          <IconLock size={12} color="var(--mantine-color-orange-5)" />
          <Text size="xs" c="orange" fw={600}>
            READ-ONLY
          </Text>
        </Group>
      )}
    </Group>
  )
}
