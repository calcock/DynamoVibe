import { randomUUID } from 'node:crypto'
import { safeStorage } from 'electron'
import Store from 'electron-store'
import type {
  ConnectionConfig,
  ConnectionInput,
  ManualCredentials
} from '@shared/types'

interface PersistShape {
  connections: ConnectionConfig[]
  /** connectionId -> base64 of safeStorage-encrypted ManualCredentials JSON */
  secrets: Record<string, string>
}

const store = new Store<PersistShape>({
  name: 'dynamite-connections',
  defaults: { connections: [], secrets: {} }
})

export function listConnections(): ConnectionConfig[] {
  return store.get('connections')
}

export function getConnection(id: string): ConnectionConfig | undefined {
  return listConnections().find((c) => c.id === id)
}

function persistSecret(id: string, creds: ManualCredentials): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain encryption is not available on this system')
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(creds))
  const secrets = store.get('secrets')
  secrets[id] = encrypted.toString('base64')
  store.set('secrets', secrets)
}

export function getSecret(id: string): ManualCredentials | undefined {
  const secrets = store.get('secrets')
  const blob = secrets[id]
  if (!blob) return undefined
  const decrypted = safeStorage.decryptString(Buffer.from(blob, 'base64'))
  return JSON.parse(decrypted) as ManualCredentials
}

function deleteSecret(id: string): void {
  const secrets = store.get('secrets')
  if (secrets[id]) {
    delete secrets[id]
    store.set('secrets', secrets)
  }
}

export function saveConnection(input: ConnectionInput): ConnectionConfig {
  const id = input.id ?? randomUUID()
  const { credentials, ...rest } = input

  if (credentials && input.authMode === 'keys') {
    persistSecret(id, credentials)
  }

  const config: ConnectionConfig = {
    id,
    name: rest.name,
    authMode: rest.authMode,
    region: rest.region,
    endpoint: rest.endpoint?.trim() || undefined,
    profile: rest.profile?.trim() || undefined,
    readOnly: rest.readOnly,
    env: rest.env,
    hasStoredKeys: input.authMode === 'keys' ? Boolean(getSecret(id)) : false
  }

  const connections = listConnections()
  const idx = connections.findIndex((c) => c.id === id)
  if (idx >= 0) connections[idx] = config
  else connections.push(config)
  store.set('connections', connections)
  return config
}

export function deleteConnection(id: string): void {
  store.set(
    'connections',
    listConnections().filter((c) => c.id !== id)
  )
  deleteSecret(id)
}
