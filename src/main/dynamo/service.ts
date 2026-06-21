import {
  AttributeValue,
  CreateTableCommand,
  DeleteItemCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ExecuteStatementCommand,
  GetItemCommand,
  ListTablesCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateTableCommand,
  type GlobalSecondaryIndex,
  type LocalSecondaryIndex
} from '@aws-sdk/client-dynamodb'
import { fromIni } from '@aws-sdk/credential-providers'
import type {
  ConnectionConfig,
  CreateTableInput,
  ItemKey,
  PageResult,
  PartiqlParams,
  PartiqlResult,
  PutItemParams,
  ScanQueryParams,
  TableDescription
} from '@shared/types'
import {
  docItemToWire,
  docValueToWire,
  wireItemToDoc,
  type WireItem
} from '@shared/marshal'
import { getConnection, getSecret } from '../connections/store'

// AttributeValue from the SDK and our structural WireValue are interchangeable
// at the boundary; cast at the edges to keep the shared marshal util SDK-free.
const toWire = (v: Record<string, AttributeValue> | undefined): WireItem =>
  (v ?? {}) as unknown as WireItem
const fromWire = (v: WireItem): Record<string, AttributeValue> =>
  v as unknown as Record<string, AttributeValue>

const clientCache = new Map<string, DynamoDBClient>()

function buildClient(conn: ConnectionConfig): DynamoDBClient {
  const base: NonNullable<ConstructorParameters<typeof DynamoDBClient>[0]> = {
    region: conn.region
  }
  if (conn.endpoint) base.endpoint = conn.endpoint

  if (conn.authMode === 'profile' && conn.profile) {
    base.credentials = fromIni({ profile: conn.profile })
  } else if (conn.authMode === 'keys') {
    const secret = getSecret(conn.id)
    if (!secret) throw new Error('No stored credentials for this connection')
    base.credentials = {
      accessKeyId: secret.accessKeyId,
      secretAccessKey: secret.secretAccessKey,
      sessionToken: secret.sessionToken
    }
  } else if (conn.authMode === 'local') {
    base.credentials = { accessKeyId: 'local', secretAccessKey: 'local' }
  }
  // authMode 'profile' without a profile name falls through to the default
  // provider chain (env vars, default profile, SSO, IMDS).
  return new DynamoDBClient(base)
}

function client(connectionId: string): DynamoDBClient {
  const conn = getConnection(connectionId)
  if (!conn) throw new Error(`Unknown connection: ${connectionId}`)
  let c = clientCache.get(connectionId)
  if (!c) {
    c = buildClient(conn)
    clientCache.set(connectionId, c)
  }
  return c
}

/** Drop a cached client so the next call rebuilds it (after edits/deletes). */
export function invalidateClient(connectionId: string): void {
  clientCache.get(connectionId)?.destroy()
  clientCache.delete(connectionId)
}

function assertWritable(connectionId: string): ConnectionConfig {
  const conn = getConnection(connectionId)
  if (!conn) throw new Error(`Unknown connection: ${connectionId}`)
  if (conn.readOnly) throw new Error('This connection is read-only')
  return conn
}

function marshalValues(
  values: Record<string, unknown> | undefined
): Record<string, AttributeValue> | undefined {
  if (!values) return undefined
  const out: Record<string, AttributeValue> = {}
  for (const [k, v] of Object.entries(values)) {
    out[k] = docValueToWire(v as never) as unknown as AttributeValue
  }
  return out
}

export async function listTables(connectionId: string): Promise<string[]> {
  const names: string[] = []
  let start: string | undefined
  do {
    const res = await client(connectionId).send(
      new ListTablesCommand({ ExclusiveStartTableName: start, Limit: 100 })
    )
    names.push(...(res.TableNames ?? []))
    start = res.LastEvaluatedTableName
  } while (start)
  return names
}

export async function describeTable(
  connectionId: string,
  tableName: string
): Promise<TableDescription> {
  const res = await client(connectionId).send(
    new DescribeTableCommand({ TableName: tableName })
  )
  const t = res.Table
  if (!t) throw new Error(`Table not found: ${tableName}`)
  return {
    tableName: t.TableName!,
    status: t.TableStatus,
    itemCount: t.ItemCount,
    keySchema: (t.KeySchema ?? []).map((k) => ({
      attributeName: k.AttributeName!,
      keyType: k.KeyType as 'HASH' | 'RANGE'
    })),
    attributeDefinitions: (t.AttributeDefinitions ?? []).map((a) => ({
      attributeName: a.AttributeName!,
      attributeType: a.AttributeType as 'S' | 'N' | 'B'
    })),
    billingMode:
      t.BillingModeSummary?.BillingMode === 'PAY_PER_REQUEST'
        ? 'PAY_PER_REQUEST'
        : 'PROVISIONED',
    globalSecondaryIndexes: (t.GlobalSecondaryIndexes ?? []).map((g) => ({
      indexName: g.IndexName!,
      keySchema: (g.KeySchema ?? []).map((k) => ({
        attributeName: k.AttributeName!,
        keyType: k.KeyType as 'HASH' | 'RANGE'
      })),
      projectionType: (g.Projection?.ProjectionType ?? 'ALL') as TableDescription['globalSecondaryIndexes'][number]['projectionType'],
      nonKeyAttributes: g.Projection?.NonKeyAttributes,
      isGlobal: true
    })),
    localSecondaryIndexes: (t.LocalSecondaryIndexes ?? []).map((l) => ({
      indexName: l.IndexName!,
      keySchema: (l.KeySchema ?? []).map((k) => ({
        attributeName: k.AttributeName!,
        keyType: k.KeyType as 'HASH' | 'RANGE'
      })),
      projectionType: (l.Projection?.ProjectionType ?? 'ALL') as TableDescription['localSecondaryIndexes'][number]['projectionType'],
      nonKeyAttributes: l.Projection?.NonKeyAttributes,
      isGlobal: false
    }))
  }
}

export async function createTable(
  connectionId: string,
  input: CreateTableInput
): Promise<TableDescription> {
  assertWritable(connectionId)
  const gsis: GlobalSecondaryIndex[] | undefined = input.globalSecondaryIndexes?.map(
    (g) => ({
      IndexName: g.indexName,
      KeySchema: g.keySchema.map((k) => ({
        AttributeName: k.attributeName,
        KeyType: k.keyType
      })),
      Projection: {
        ProjectionType: g.projectionType,
        NonKeyAttributes: g.nonKeyAttributes
      },
      ...(input.billingMode === 'PROVISIONED' && g.provisionedThroughput
        ? {
            ProvisionedThroughput: {
              ReadCapacityUnits: g.provisionedThroughput.readCapacityUnits,
              WriteCapacityUnits: g.provisionedThroughput.writeCapacityUnits
            }
          }
        : {})
    })
  )
  const lsis: LocalSecondaryIndex[] | undefined = input.localSecondaryIndexes?.map(
    (l) => ({
      IndexName: l.indexName,
      KeySchema: l.keySchema.map((k) => ({
        AttributeName: k.attributeName,
        KeyType: k.keyType
      })),
      Projection: {
        ProjectionType: l.projectionType,
        NonKeyAttributes: l.nonKeyAttributes
      }
    })
  )

  await client(connectionId).send(
    new CreateTableCommand({
      TableName: input.tableName,
      AttributeDefinitions: input.attributeDefinitions.map((a) => ({
        AttributeName: a.attributeName,
        AttributeType: a.attributeType
      })),
      KeySchema: input.keySchema.map((k) => ({
        AttributeName: k.attributeName,
        KeyType: k.keyType
      })),
      BillingMode: input.billingMode,
      ProvisionedThroughput:
        input.billingMode === 'PROVISIONED' && input.provisionedThroughput
          ? {
              ReadCapacityUnits: input.provisionedThroughput.readCapacityUnits,
              WriteCapacityUnits: input.provisionedThroughput.writeCapacityUnits
            }
          : undefined,
      GlobalSecondaryIndexes: gsis,
      LocalSecondaryIndexes: lsis
    })
  )
  return describeTable(connectionId, input.tableName)
}

export async function updateTableIndexes(
  connectionId: string,
  tableName: string,
  payload: {
    billingMode?: CreateTableInput['billingMode']
    addGlobalSecondaryIndexes?: NonNullable<CreateTableInput['globalSecondaryIndexes']>
    deleteGlobalSecondaryIndexNames?: string[]
  }
): Promise<TableDescription> {
  assertWritable(connectionId)
  const updates: NonNullable<
    ConstructorParameters<typeof UpdateTableCommand>[0]
  >['GlobalSecondaryIndexUpdates'] = []

  for (const g of payload.addGlobalSecondaryIndexes ?? []) {
    updates.push({
      Create: {
        IndexName: g.indexName,
        KeySchema: g.keySchema.map((k) => ({
          AttributeName: k.attributeName,
          KeyType: k.keyType
        })),
        Projection: {
          ProjectionType: g.projectionType,
          NonKeyAttributes: g.nonKeyAttributes
        },
        ...(payload.billingMode === 'PROVISIONED' && g.provisionedThroughput
          ? {
              ProvisionedThroughput: {
                ReadCapacityUnits: g.provisionedThroughput.readCapacityUnits,
                WriteCapacityUnits: g.provisionedThroughput.writeCapacityUnits
              }
            }
          : {})
      }
    })
  }
  for (const name of payload.deleteGlobalSecondaryIndexNames ?? []) {
    updates.push({ Delete: { IndexName: name } })
  }

  // Collect attribute definitions referenced by new GSIs (required by the API).
  const newAttrs = new Map<string, 'S' | 'N' | 'B'>()
  for (const g of payload.addGlobalSecondaryIndexes ?? []) {
    for (const k of g.keySchema) newAttrs.set(k.attributeName, 'S')
  }

  await client(connectionId).send(
    new UpdateTableCommand({
      TableName: tableName,
      BillingMode: payload.billingMode,
      GlobalSecondaryIndexUpdates: updates.length ? updates : undefined,
      AttributeDefinitions: newAttrs.size
        ? [...newAttrs].map(([name, type]) => ({
            AttributeName: name,
            AttributeType: type
          }))
        : undefined
    })
  )
  return describeTable(connectionId, tableName)
}

export async function deleteTable(
  connectionId: string,
  tableName: string
): Promise<void> {
  assertWritable(connectionId)
  await client(connectionId).send(new DeleteTableCommand({ TableName: tableName }))
}

function buildPage(
  items: Record<string, AttributeValue>[] | undefined,
  lastKey: Record<string, AttributeValue> | undefined,
  scannedCount?: number,
  count?: number
): PageResult {
  return {
    items: (items ?? []).map((i) => wireItemToDoc(toWire(i))),
    lastEvaluatedKey: lastKey ? wireItemToDoc(toWire(lastKey)) : undefined,
    scannedCount,
    count
  }
}

export async function scan(params: ScanQueryParams): Promise<PageResult> {
  const res = await client(params.connectionId).send(
    new ScanCommand({
      TableName: params.tableName,
      IndexName: params.indexName,
      FilterExpression: params.filterExpression || undefined,
      ExpressionAttributeNames: params.expressionAttributeNames,
      ExpressionAttributeValues: marshalValues(params.expressionAttributeValues),
      Limit: params.limit,
      ExclusiveStartKey: params.exclusiveStartKey
        ? fromWire(docItemToWire(params.exclusiveStartKey as never))
        : undefined
    })
  )
  return buildPage(res.Items, res.LastEvaluatedKey, res.ScannedCount, res.Count)
}

export async function query(params: ScanQueryParams): Promise<PageResult> {
  const res = await client(params.connectionId).send(
    new QueryCommand({
      TableName: params.tableName,
      IndexName: params.indexName,
      KeyConditionExpression: params.keyConditionExpression || undefined,
      FilterExpression: params.filterExpression || undefined,
      ExpressionAttributeNames: params.expressionAttributeNames,
      ExpressionAttributeValues: marshalValues(params.expressionAttributeValues),
      Limit: params.limit,
      ScanIndexForward: params.scanIndexForward,
      ExclusiveStartKey: params.exclusiveStartKey
        ? fromWire(docItemToWire(params.exclusiveStartKey as never))
        : undefined
    })
  )
  return buildPage(res.Items, res.LastEvaluatedKey, res.ScannedCount, res.Count)
}

export async function getItem(
  params: ItemKey
): Promise<Record<string, unknown> | null> {
  const res = await client(params.connectionId).send(
    new GetItemCommand({
      TableName: params.tableName,
      Key: fromWire(docItemToWire(params.key as never))
    })
  )
  return res.Item ? wireItemToDoc(toWire(res.Item)) : null
}

export async function putItem(params: PutItemParams): Promise<void> {
  assertWritable(params.connectionId)
  const names: Record<string, string> = {}
  const values: Record<string, AttributeValue> = {}
  const conditions: string[] = []

  if (params.onlyIfNotExists) {
    // Guard on the partition key not existing.
    const firstKey = Object.keys(params.item)[0]
    if (firstKey) {
      names['#pk'] = firstKey
      conditions.push('attribute_not_exists(#pk)')
    }
  }
  if (params.versionCheck) {
    names['#ver'] = params.versionCheck.attribute
    values[':ver'] = docValueToWire(
      params.versionCheck.expected as never
    ) as unknown as AttributeValue
    conditions.push('#ver = :ver')
  }

  await client(params.connectionId).send(
    new PutItemCommand({
      TableName: params.tableName,
      Item: fromWire(docItemToWire(params.item as never)),
      ConditionExpression: conditions.length ? conditions.join(' AND ') : undefined,
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
      ExpressionAttributeValues: Object.keys(values).length ? values : undefined
    })
  )
}

export async function deleteItem(params: ItemKey): Promise<void> {
  assertWritable(params.connectionId)
  await client(params.connectionId).send(
    new DeleteItemCommand({
      TableName: params.tableName,
      Key: fromWire(docItemToWire(params.key as never))
    })
  )
}

export async function partiql(params: PartiqlParams): Promise<PartiqlResult> {
  const res = await client(params.connectionId).send(
    new ExecuteStatementCommand({
      Statement: params.statement,
      Parameters: params.parameters?.map(
        (p) => docValueToWire(p as never) as unknown as AttributeValue
      ),
      NextToken: params.nextToken
    })
  )
  return {
    items: (res.Items ?? []).map((i) => wireItemToDoc(toWire(i))),
    nextToken: res.NextToken
  }
}

export async function testConnection(
  connectionId: string
): Promise<{ tableCount: number }> {
  const tables = await listTables(connectionId)
  return { tableCount: tables.length }
}
