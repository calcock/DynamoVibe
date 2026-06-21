import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  ConnectionInput,
  CreateTableInput,
  ItemKey,
  PartiqlParams,
  PutItemParams,
  ScanQueryParams
} from '@shared/types'
import {
  deleteConnection,
  listConnections,
  saveConnection
} from '../connections/store'
import { listAwsProfiles } from '../connections/profiles'
import * as ddb from '../dynamo/service'
import { invalidateClient } from '../dynamo/service'

/**
 * Wrap a handler so any thrown error crosses the IPC boundary as a rejected
 * promise with a clean message (the renderer surfaces it in a notification).
 */
function handle<A extends unknown[], R>(
  channel: string,
  fn: (...args: A) => Promise<R> | R
): void {
  ipcMain.handle(channel, async (_evt, ...args: A) => {
    try {
      return await fn(...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(message)
    }
  })
}

export function registerIpcHandlers(): void {
  // connections
  handle(IPC.connectionsList, () => listConnections())
  handle(IPC.connectionsSave, (input: ConnectionInput) => {
    const cfg = saveConnection(input)
    invalidateClient(cfg.id)
    return cfg
  })
  handle(IPC.connectionsDelete, (id: string) => {
    invalidateClient(id)
    deleteConnection(id)
  })
  handle(IPC.connectionsTest, (id: string) => ddb.testConnection(id))
  handle(IPC.awsProfilesList, () => listAwsProfiles())

  // tables
  handle(IPC.tablesList, (connectionId: string) => ddb.listTables(connectionId))
  handle(IPC.tableDescribe, (connectionId: string, tableName: string) =>
    ddb.describeTable(connectionId, tableName)
  )
  handle(IPC.tableCreate, (connectionId: string, input: CreateTableInput) =>
    ddb.createTable(connectionId, input)
  )
  handle(
    IPC.tableUpdateIndexes,
    (
      connectionId: string,
      tableName: string,
      payload: Parameters<typeof ddb.updateTableIndexes>[2]
    ) => ddb.updateTableIndexes(connectionId, tableName, payload)
  )
  handle(IPC.tableDelete, (connectionId: string, tableName: string) =>
    ddb.deleteTable(connectionId, tableName)
  )

  // items
  handle(IPC.scan, (params: ScanQueryParams) => ddb.scan(params))
  handle(IPC.query, (params: ScanQueryParams) => ddb.query(params))
  handle(IPC.getItem, (params: ItemKey) => ddb.getItem(params))
  handle(IPC.putItem, (params: PutItemParams) => ddb.putItem(params))
  handle(IPC.deleteItem, (params: ItemKey) => ddb.deleteItem(params))
  handle(IPC.partiql, (params: PartiqlParams) => ddb.partiql(params))
}
