import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  ConnectionConfig,
  ConnectionInput,
  CreateTableInput,
  TableDescription
} from '@shared/types'

const api = window.api

export function useConnections(): UseQueryResult<ConnectionConfig[]> {
  return useQuery({ queryKey: ['connections'], queryFn: () => api.listConnections() })
}

export function useConnection(id?: string): ConnectionConfig | undefined {
  const { data } = useConnections()
  return data?.find((c) => c.id === id)
}

export function useAwsProfiles(enabled: boolean): UseQueryResult<string[]> {
  return useQuery({
    queryKey: ['awsProfiles'],
    queryFn: () => api.listAwsProfiles(),
    enabled
  })
}

export function useSaveConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ConnectionInput) => api.saveConnection(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] })
  })
}

export function useDeleteConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteConnection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] })
  })
}

export function useTables(connectionId?: string): UseQueryResult<string[]> {
  return useQuery({
    queryKey: ['tables', connectionId],
    queryFn: () => api.listTables(connectionId as string),
    enabled: Boolean(connectionId)
  })
}

export function useTableDescription(
  connectionId?: string,
  tableName?: string
): UseQueryResult<TableDescription> {
  return useQuery({
    queryKey: ['table', connectionId, tableName],
    queryFn: () => api.describeTable(connectionId as string, tableName as string),
    enabled: Boolean(connectionId && tableName)
  })
}

export function useCreateTable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      connectionId,
      input
    }: {
      connectionId: string
      input: CreateTableInput
    }) => api.createTable(connectionId, input),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['tables', vars.connectionId] })
  })
}

export function useUpdateTableIndexes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      connectionId,
      tableName,
      payload
    }: {
      connectionId: string
      tableName: string
      payload: Parameters<typeof api.updateTableIndexes>[2]
    }) => api.updateTableIndexes(connectionId, tableName, payload),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['table', vars.connectionId, vars.tableName] })
  })
}

export function useDeleteTable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      connectionId,
      tableName
    }: {
      connectionId: string
      tableName: string
    }) => api.deleteTable(connectionId, tableName),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['tables', vars.connectionId] })
  })
}
