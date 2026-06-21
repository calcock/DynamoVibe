import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface OpenTable {
  /** stable key: connectionId + '::' + tableName */
  key: string
  connectionId: string
  tableName: string
}

/** Item editor preferences, remembered across sessions. */
export type EditViewMode = 'tree' | 'raw'
export type EditRawFormat = 'document' | 'wire'

interface UiState {
  activeConnectionId?: string
  openTables: OpenTable[]
  activeTableKey?: string

  /** Last-used item editor view + raw format (persisted). */
  editView: EditViewMode
  editRawFormat: EditRawFormat

  /**
   * Per-table data-grid column order, keyed by `connectionId::tableName`.
   * Holds data-attribute ids only (never the actions column). Persisted.
   */
  columnOrder: Record<string, string[]>

  setActiveConnection: (id?: string) => void
  openTable: (connectionId: string, tableName: string) => void
  closeTable: (key: string) => void
  setActiveTable: (key: string) => void
  closeConnectionTables: (connectionId: string) => void
  setEditView: (view: EditViewMode) => void
  setEditRawFormat: (fmt: EditRawFormat) => void
  setColumnOrder: (key: string, order: string[]) => void
  resetColumnOrder: (key: string) => void
}

export const tableKey = (connectionId: string, tableName: string): string =>
  `${connectionId}::${tableName}`

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      openTables: [],
      editView: 'tree',
      editRawFormat: 'document',
      columnOrder: {},

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
        }),

      setEditView: (view) => set({ editView: view }),
      setEditRawFormat: (fmt) => set({ editRawFormat: fmt }),

      setColumnOrder: (key, order) =>
        set((state) => ({
          columnOrder: { ...state.columnOrder, [key]: order }
        })),

      resetColumnOrder: (key) =>
        set((state) => {
          if (!(key in state.columnOrder)) return {}
          const next = { ...state.columnOrder }
          delete next[key]
          return { columnOrder: next }
        })
    }),
    {
      name: 'dynamite-ui',
      // Only persist editor preferences + column order; open tables are session state.
      partialize: (state) => ({
        editView: state.editView,
        editRawFormat: state.editRawFormat,
        columnOrder: state.columnOrder
      })
    }
  )
)
