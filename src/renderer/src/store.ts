import { create } from 'zustand'

export interface OpenTable {
  /** stable key: connectionId + '::' + tableName */
  key: string
  connectionId: string
  tableName: string
}

interface UiState {
  activeConnectionId?: string
  openTables: OpenTable[]
  activeTableKey?: string

  setActiveConnection: (id?: string) => void
  openTable: (connectionId: string, tableName: string) => void
  closeTable: (key: string) => void
  setActiveTable: (key: string) => void
  closeConnectionTables: (connectionId: string) => void
}

const tableKey = (connectionId: string, tableName: string): string =>
  `${connectionId}::${tableName}`

export const useUiStore = create<UiState>((set) => ({
  openTables: [],

  setActiveConnection: (id) => set({ activeConnectionId: id }),

  openTable: (connectionId, tableName) =>
    set((state) => {
      const key = tableKey(connectionId, tableName)
      if (state.openTables.some((t) => t.key === key)) {
        return { activeTableKey: key }
      }
      return {
        openTables: [...state.openTables, { key, connectionId, tableName }],
        activeTableKey: key
      }
    }),

  closeTable: (key) =>
    set((state) => {
      const remaining = state.openTables.filter((t) => t.key !== key)
      const activeTableKey =
        state.activeTableKey === key
          ? remaining[remaining.length - 1]?.key
          : state.activeTableKey
      return { openTables: remaining, activeTableKey }
    }),

  setActiveTable: (key) => set({ activeTableKey: key }),

  closeConnectionTables: (connectionId) =>
    set((state) => {
      const remaining = state.openTables.filter(
        (t) => t.connectionId !== connectionId
      )
      const stillActive = remaining.some((t) => t.key === state.activeTableKey)
      return {
        openTables: remaining,
        activeTableKey: stillActive
          ? state.activeTableKey
          : remaining[remaining.length - 1]?.key
      }
    })
}))
