import { AppShell, Group, Text, Badge } from '@mantine/core'
import { IconBolt } from '@tabler/icons-react'
import { ConnectionsSidebar } from './components/ConnectionsSidebar'
import { Workspace } from './components/Workspace'

export function App(): JSX.Element {
  return (
    <AppShell
      header={{ height: 44 }}
      navbar={{ width: 290, breakpoint: 'xs' }}
      padding={0}
      style={{ height: '100vh' }}
    >
      <AppShell.Header>
        <Group h="100%" px="sm" justify="space-between">
          <Group gap={6}>
            <IconBolt size={20} color="var(--mantine-color-yellow-5)" />
            <Text fw={700}>Dynamite</Text>
            <Text size="xs" c="dimmed">
              DynamoDB client
            </Text>
          </Group>
          <Badge variant="light" color="gray" size="sm">
            v0.1.0
          </Badge>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <ConnectionsSidebar />
      </AppShell.Navbar>

      <AppShell.Main style={{ height: 'calc(100vh - 44px)', overflow: 'hidden' }}>
        <Workspace />
      </AppShell.Main>
    </AppShell>
  )
}
