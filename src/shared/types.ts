// Shared types used by both the Electron main process and the renderer.

export type EnvLabel = 'local' | 'dev' | 'staging' | 'prod' | 'other'

export type AuthMode = 'profile' | 'keys' | 'local'

/**
 * A saved connection definition. Secrets (manual keys) are NOT stored here —
 * they live in the OS keychain via safeStorage, keyed by the connection id.
 */
export interface ConnectionConfig {
  id: string
  name: string
  authMode: AuthMode
  region: string
  /** Custom endpoint URL, e.g. http://localhost:8000 for local DynamoDB. */
  endpoint?: string
  /** Named profile from ~/.aws/config when authMode === 'profile'. */
  profile?: string
  /** True when manual keys are stored in the keychain for this connection. */
  hasStoredKeys?: boolean
  readOnly: boolean
  env: EnvLabel
}

/** Manual credentials entered by the user; persisted only in the OS keychain. */
export interface ManualCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export type ConnectionInput = Omit<ConnectionConfig, 'id' | 'hasStoredKeys'> & {
  id?: string
  credentials?: ManualCredentials
}

// ---- DynamoDB domain shapes (subset we surface in the UI) ----

export type DdbScalarType = 'S' | 'N' | 'BOOL' | 'NULL' | 'B'
export type DdbSetType = 'SS' | 'NS' | 'BS'
export type DdbCollectionType = 'M' | 'L'
export type DdbAttrType = DdbScalarType | DdbSetType | DdbCollectionType

export type KeyType = 'HASH' | 'RANGE'
export type ProjectionType = 'ALL' | 'KEYS_ONLY' | 'INCLUDE'
export type BillingMode = 'PAY_PER_REQUEST' | 'PROVISIONED'

export interface KeySchemaElement {
  attributeName: string
  keyType: KeyType
}

export interface AttributeDefinition {
  attributeName: string
  attributeType: 'S' | 'N' | 'B'
}

export interface SecondaryIndexInfo {
  indexName: string
  keySchema: KeySchemaElement[]
  projectionType: ProjectionType
  nonKeyAttributes?: string[]
  /** GSI only. */
  isGlobal: boolean
}

export interface TableDescription {
  tableName: string
  status?: string
  itemCount?: number
  keySchema: KeySchemaElement[]
  attributeDefinitions: AttributeDefinition[]
  billingMode: BillingMode
  globalSecondaryIndexes: SecondaryIndexInfo[]
  localSecondaryIndexes: SecondaryIndexInfo[]
}

export interface CreateTableInput {
  tableName: string
  attributeDefinitions: AttributeDefinition[]
  keySchema: KeySchemaElement[]
  billingMode: BillingMode
  provisionedThroughput?: { readCapacityUnits: number; writeCapacityUnits: number }
  globalSecondaryIndexes?: Array<{
    indexName: string
    keySchema: KeySchemaElement[]
    projectionType: ProjectionType
    nonKeyAttributes?: string[]
    provisionedThroughput?: { readCapacityUnits: number; writeCapacityUnits: number }
  }>
  localSecondaryIndexes?: Array<{
    indexName: string
    keySchema: KeySchemaElement[]
    projectionType: ProjectionType
    nonKeyAttributes?: string[]
  }>
}

// ---- Read/scan/query ----

export interface ScanQueryParams {
  connectionId: string
  tableName: string
  indexName?: string
  /** Raw expressions are produced by the guided builder or written directly. */
  keyConditionExpression?: string
  filterExpression?: string
  expressionAttributeNames?: Record<string, string>
  /** Document-form values; marshalled to wire format in main. */
  expressionAttributeValues?: Record<string, unknown>
  limit?: number
  /** Wire-format key for continuing pagination. */
  exclusiveStartKey?: Record<string, unknown>
  scanIndexForward?: boolean
}

export interface PageResult {
  /** Document-form items. */
  items: Array<Record<string, unknown>>
  /** Document-form key, opaque to the renderer; pass back to continue. */
  lastEvaluatedKey?: Record<string, unknown>
  scannedCount?: number
  count?: number
}

export interface ItemKey {
  connectionId: string
  tableName: string
  /** Document-form key attributes. */
  key: Record<string, unknown>
}

export interface PutItemParams {
  connectionId: string
  tableName: string
  /** Document-form item. */
  item: Record<string, unknown>
  /** When true, fail if an item with the same key already exists. */
  onlyIfNotExists?: boolean
  /** Optional optimistic version attribute name + expected value. */
  versionCheck?: { attribute: string; expected: unknown }
}

export interface PartiqlParams {
  connectionId: string
  statement: string
  /** Document-form positional parameters. */
  parameters?: unknown[]
  nextToken?: string
}

export interface PartiqlResult {
  items: Array<Record<string, unknown>>
  nextToken?: string
}

export interface IpcResult<T> {
  ok: boolean
  data?: T
  error?: string
}
