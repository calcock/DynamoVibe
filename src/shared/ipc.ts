// IPC channel names and the typed API surface exposed to the renderer.

import type {
  ConnectionConfig,
  ConnectionInput,
  CreateTableInput,
  ItemKey,
  PartiqlParams,
  PartiqlResult,
  PageResult,
  PutItemParams,
  ScanQueryParams,
  TableDescription
} from './types'

export const IPC = {
  // connections
  connectionsList: 'connections:list',
  connectionsSave: 'connections:save',
  connectionsDelete: 'connections:delete',
  connectionsTest: 'connections:test',
  awsProfilesList: 'aws:profiles:list',
  // tables
  tablesList: 'tables:list',
  tableDescribe: 'tables:describe',
  tableCreate: 'tables:create',
  tableUpdateIndexes: 'tables:updateIndexes',
  tableDelete: 'tables:delete',
  // items
  scan: 'data:scan',
  query: 'data:query',
  getItem: 'data:getItem',
  putItem: 'data:putItem',
  deleteItem: 'data:deleteItem',
  partiql: 'data:partiql'
} as const

/**
 * The shape exposed on `window.api` by the preload bridge. Every method returns
 * a promise that resolves with the unwrapped data or rejects with an Error.
 */
export interface DynamiteApi {
  listConnections(): Promise<ConnectionConfig[]>
  saveConnection(input: ConnectionInput): Promise<ConnectionConfig>
  deleteConnection(id: string): Promise<void>
  testConnection(id: string): Promise<{ tableCount: number }>
  listAwsProfiles(): Promise<string[]>

  listTables(connectionId: string): Promise<string[]>
  describeTable(connectionId: string, tableName: string): Promise<TableDescription>
  createTable(connectionId: string, input: CreateTableInput): Promise<TableDescription>
  updateTableIndexes(
    connectionId: string,
    tableName: string,
    payload: {
      billingMode?: CreateTableInput['billingMode']
      addGlobalSecondaryIndexes?: NonNullable<CreateTableInput['globalSecondaryIndexes']>
      deleteGlobalSecondaryIndexNames?: string[]
    }
  ): Promise<TableDescription>
  deleteTable(connectionId: string, tableName: string): Promise<void>

  scan(params: ScanQueryParams): Promise<PageResult>
  query(params: ScanQueryParams): Promise<PageResult>
  getItem(params: ItemKey): Promise<Record<string, unknown> | null>
  putItem(params: PutItemParams): Promise<void>
  deleteItem(params: ItemKey): Promise<void>
  partiql(params: PartiqlParams): Promise<PartiqlResult>
}
