import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Modal,
  PasswordInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput
} from '@mantine/core'
import { IconPlugConnected } from '@tabler/icons-react'
import type {
  AuthMode,
  ConnectionConfig,
  ConnectionInput,
  EnvLabel
} from '@shared/types'
import { useAwsProfiles, useSaveConnection } from '../hooks/queries'
import { notifyError, notifySuccess } from '../lib/notify'

const REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'sa-east-1'
]

const ENVS: EnvLabel[] = ['local', 'dev', 'staging', 'prod', 'other']

interface FormState {
  name: string
  authMode: AuthMode
  region: string
  endpoint: string
  profile: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  readOnly: boolean
  env: EnvLabel
}

const empty: FormState = {
  name: '',
  authMode: 'local',
  region: 'us-east-1',
  endpoint: 'http://localhost:8000',
  profile: '',
  accessKeyId: '',
  secretAccessKey: '',
  sessionToken: '',
  readOnly: false,
  env: 'local'
}

export function ConnectionModal({
  opened,
  onClose,
  editing
}: {
  opened: boolean
  onClose: () => void
  editing: ConnectionConfig | null
}): JSX.Element {
  const [form, setForm] = useState<FormState>(empty)
  const save = useSaveConnection()
  const { data: profiles } = useAwsProfiles(opened)

  useEffect(() => {
    if (!opened) return
    if (editing) {
      setForm({
        name: editing.name,
        authMode: editing.authMode,
        region: editing.region,
        endpoint: editing.endpoint ?? '',
        profile: editing.profile ?? '',
        accessKeyId: '',
        secretAccessKey: '',
        sessionToken: '',
        readOnly: editing.readOnly,
        env: editing.env
      })
    } else {
      setForm(empty)
    }
  }, [opened, editing])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((f) => ({ ...f, [key]: value }))

  const onAuthModeChange = (mode: AuthMode): void => {
    setForm((f) => ({
      ...f,
      authMode: mode,
      env: mode === 'local' && f.env === 'local' ? 'local' : f.env,
      endpoint:
        mode === 'local' && !f.endpoint ? 'http://localhost:8000' : mode === 'local' ? f.endpoint : ''
    }))
  }

  const buildInput = (): ConnectionInput => {
    const base: ConnectionInput = {
      id: editing?.id,
      name: form.name.trim(),
      authMode: form.authMode,
      region: form.region,
      endpoint: form.endpoint.trim() || undefined,
      profile: form.authMode === 'profile' ? form.profile.trim() : undefined,
      readOnly: form.readOnly,
      env: form.env
    }
    if (form.authMode === 'keys' && form.accessKeyId && form.secretAccessKey) {
      base.credentials = {
        accessKeyId: form.accessKeyId.trim(),
        secretAccessKey: form.secretAccessKey.trim(),
        sessionToken: form.sessionToken.trim() || undefined
      }
    }
    return base
  }

  const onSubmit = (): void => {
    if (!form.name.trim()) {
      notifyError('Name required', new Error('Please give the connection a name'))
      return
    }
    save.mutate(buildInput(), {
      onSuccess: () => {
        notifySuccess('Connection saved')
        onClose()
      },
      onError: (e) => notifyError('Save failed', e)
    })
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? 'Edit connection' : 'New connection'}
      size="lg"
    >
      <Stack>
        <TextInput
          label="Name"
          placeholder="e.g. Local dev / Prod us-east-1"
          required
          value={form.name}
          onChange={(e) => set('name', e.currentTarget.value)}
        />

        <div>
          <Text size="sm" fw={500} mb={4}>
            Authentication
          </Text>
          <SegmentedControl
            fullWidth
            value={form.authMode}
            onChange={(v) => onAuthModeChange(v as AuthMode)}
            data={[
              { label: 'Local DynamoDB', value: 'local' },
              { label: 'AWS profile / SSO', value: 'profile' },
              { label: 'Access keys', value: 'keys' }
            ]}
          />
        </div>

        {form.authMode === 'local' && (
          <TextInput
            label="Endpoint URL"
            placeholder="http://localhost:8000"
            value={form.endpoint}
            onChange={(e) => set('endpoint', e.currentTarget.value)}
          />
        )}

        {form.authMode === 'profile' && (
          <Select
            label="Profile"
            description="From ~/.aws/config and ~/.aws/credentials. Leave blank to use the default provider chain."
            placeholder="default"
            searchable
            clearable
            data={profiles ?? []}
            value={form.profile || null}
            onChange={(v) => set('profile', v ?? '')}
          />
        )}

        {form.authMode === 'keys' && (
          <Stack gap="xs">
            {editing?.hasStoredKeys && (
              <Alert color="blue" variant="light">
                Keys are already stored for this connection. Leave the fields blank to
                keep them, or enter new values to replace them.
              </Alert>
            )}
            <TextInput
              label="Access Key ID"
              value={form.accessKeyId}
              onChange={(e) => set('accessKeyId', e.currentTarget.value)}
            />
            <PasswordInput
              label="Secret Access Key"
              value={form.secretAccessKey}
              onChange={(e) => set('secretAccessKey', e.currentTarget.value)}
            />
            <PasswordInput
              label="Session Token (optional)"
              value={form.sessionToken}
              onChange={(e) => set('sessionToken', e.currentTarget.value)}
            />
            <Text size="xs" c="dimmed">
              Stored encrypted in your OS keychain — never written in plain text.
            </Text>
          </Stack>
        )}

        <Group grow>
          <Select
            label="Region"
            searchable
            data={REGIONS}
            value={form.region}
            onChange={(v) => set('region', v ?? 'us-east-1')}
          />
          <Select
            label="Environment"
            data={ENVS.map((e) => ({ value: e, label: e }))}
            value={form.env}
            onChange={(v) => set('env', (v as EnvLabel) ?? 'other')}
          />
        </Group>

        <Switch
          label="Read-only (disable all writes, deletes, and table changes)"
          checked={form.readOnly}
          onChange={(e) => set('readOnly', e.currentTarget.checked)}
        />

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            leftSection={<IconPlugConnected size={16} />}
            onClick={onSubmit}
            loading={save.isPending}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
