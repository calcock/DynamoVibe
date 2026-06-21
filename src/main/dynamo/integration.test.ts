/**
 * End-to-end test of the data layer against a real DynamoDB (dynamodb-local).
 * Gated behind DDB_ENDPOINT so it does not run in the normal unit suite.
 *
 *   docker run -d -p 8000:8000 amazon/dynamodb-local
 *   DDB_ENDPOINT=http://localhost:8000 npx vitest run integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  type AttributeValue
} from '@aws-sdk/client-dynamodb'
import {
  docItemToWire,
  wireItemToDoc,
  type DocItem,
  type WireItem
} from '@shared/marshal'

const endpoint = process.env.DDB_ENDPOINT
const run = endpoint ? describe : describe.skip

const fromWire = (w: WireItem): Record<string, AttributeValue> =>
  w as unknown as Record<string, AttributeValue>
const toWire = (v: Record<string, AttributeValue> | undefined): WireItem =>
  (v ?? {}) as unknown as WireItem

run('dynamodb-local integration', () => {
  const TABLE = `dynamite_it_${Date.now()}`
  const client = new DynamoDBClient({
    region: 'us-east-1',
    endpoint,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' }
  })

  beforeAll(async () => {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE,
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' }
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
      })
    )
  })

  afterAll(async () => {
    await client.send(new DeleteTableCommand({ TableName: TABLE }))
    client.destroy()
  })

  it('round-trips a rich item through put + scan', async () => {
    const item: DocItem = {
      pk: 'user#1',
      sk: 'profile',
      age: 42,
      score: { __ddb: 'N', value: '123456789012345678901234567890' },
      tags: { __ddb: 'SS', values: ['admin', 'beta'] },
      avatar: { __ddb: 'B', b64: 'AQID' },
      active: true,
      nickname: null,
      meta: { counts: { __ddb: 'NS', values: ['0', '10'] }, nested: { a: 'b' } },
      items: ['x', 1, false]
    }

    await client.send(
      new PutItemCommand({ TableName: TABLE, Item: fromWire(docItemToWire(item)) })
    )

    const scan = await client.send(new ScanCommand({ TableName: TABLE }))
    expect(scan.Items).toHaveLength(1)
    const back = wireItemToDoc(toWire(scan.Items![0]))
    expect(back).toEqual(item)
  })

  it('queries by partition key with a begins_with sort condition', async () => {
    const res = await client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
        ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
        ExpressionAttributeValues: fromWire(
          docItemToWire({ ':pk': 'user#1', ':sk': 'prof' })
        )
      })
    )
    expect(res.Items).toHaveLength(1)
    expect(wireItemToDoc(toWire(res.Items![0])).pk).toBe('user#1')
  })
})
