import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type DynamoVibeApi } from '@shared/ipc'

const api: DynamoVibeApi = {
  listConnections: () => ipcRenderer.invoke(IPC.connectionsList),
  saveConnection: (input) => ipcRenderer.invoke(IPC.connectionsSave, input),
  deleteConnection: (id) => ipcRenderer.invoke(IPC.connectionsDelete, id),
  testConnection: (id) => ipcRenderer.invoke(IPC.connectionsTest, id),
  listAwsProfiles: () => ipcRenderer.invoke(IPC.awsProfilesList),

  listTables: (connectionId) => ipcRenderer.invoke(IPC.tablesList, connectionId),
  describeTable: (connectionId, tableName) =>
    ipcRenderer.invoke(IPC.tableDescribe, connectionId, tableName),
  createTable: (connectionId, input) =>
    ipcRenderer.invoke(IPC.tableCreate, connectionId, input),
  updateTableIndexes: (connectionId, tableName, payload) =>
    ipcRenderer.invoke(IPC.tableUpdateIndexes, connectionId, tableName, payload),
  deleteTable: (connectionId, tableName) =>
    ipcRenderer.invoke(IPC.tableDelete, connectionId, tableName),

  scan: (params) => ipcRenderer.invoke(IPC.scan, params),
  query: (params) => ipcRenderer.invoke(IPC.query, params),
  getItem: (params) => ipcRenderer.invoke(IPC.getItem, params),
  putItem: (params) => ipcRenderer.invoke(IPC.putItem, params),
  deleteItem: (params) => ipcRenderer.invoke(IPC.deleteItem, params),
  partiql: (params) => ipcRenderer.invoke(IPC.partiql, params)
}

contextBridge.exposeInMainWorld('api', api)
