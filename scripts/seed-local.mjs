/**
 * Seed a local DynamoDB (dynamodb-local) with 4 sample tables and >=100 rows each.
 *
 *   docker compose up -d            # start dynamodb-local on :8000
 *   node scripts/seed-local.mjs     # create + populate
 *
 * Re-runnable: each table is dropped (if present) and recreated from scratch.
 *
 * Env:
 *   DDB_ENDPOINT   DynamoDB endpoint        (default http://localhost:8000)
 *   AWS_REGION     region label             (default us-east-1)
 */
import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException
} from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  BatchWriteCommand
} from '@aws-sdk/lib-dynamodb'

const endpoint = process.env.DDB_ENDPOINT ?? 'http://localhost:8000'
const region = process.env.AWS_REGION ?? 'us-east-1'

const base = new DynamoDBClient({
  region,
  endpoint,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' }
})
const doc = DynamoDBDocumentClient.from(base, {
  marshallOptions: { removeUndefinedValues: true }
})

// ---------------------------------------------------------------- helpers ----

const FIRST = ['Ada', 'Bram', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus', 'Hana',
  'Iris', 'Jud', 'Kit', 'Lou', 'Mira', 'Nash', 'Opal', 'Pia', 'Quinn', 'Rune',
  'Sage', 'Tova', 'Uma', 'Vid', 'Wren', 'Xan', 'Yara', 'Zev']
const LAST = ['Ash', 'Brook', 'Cole', 'Drake', 'Ford', 'Gray', 'Hale', 'Ives',
  'Jett', 'Kerr', 'Lowe', 'Mraz', 'Nye', 'Ott', 'Pace', 'Reed', 'Stone', 'Tate',
  'Vance', 'West']
const CATEGORIES = ['Electronics', 'Books', 'Home', 'Garden', 'Toys', 'Sports',
  'Grocery', 'Beauty', 'Office', 'Automotive']
const ADJ = ['Compact', 'Deluxe', 'Eco', 'Pro', 'Mini', 'Ultra', 'Smart',
  'Classic', 'Rugged', 'Sleek']
const NOUN = ['Widget', 'Gadget', 'Lamp', 'Bottle', 'Charger', 'Backpack',
  'Speaker', 'Mug', 'Notebook', 'Drone', 'Wallet', 'Stand']
const STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED']
const COMMENTS = [
  'Exceeded my expectations.',
  'Works as described, would buy again.',
  'Decent value for the price.',
  'Arrived late but quality is good.',
  'Stopped working after a week.',
  'Absolutely love it!',
  'Not what I expected, returning it.',
  'Solid build, recommended.',
  'Mediocre at best.',
  'Five stars, no complaints.'
]

const pick = (arr, i) => arr[i % arr.length]
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)]
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1))
const pad = (n, w = 4) => String(n).padStart(w, '0')
// Deterministic ISO timestamp spread over the last ~year.
const isoFor = (offsetDays) =>
  new Date(Date.UTC(2025, 0, 1) + offsetDays * 86_400_000 + randInt(0, 86_399) * 1000).toISOString()

// Drop a table if it exists, then create it and wait until ACTIVE.
async function recreateTable(spec) {
  try {
    await base.send(new DeleteTableCommand({ TableName: spec.TableName }))
    process.stdout.write(`  dropped existing ${spec.TableName}\n`)
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err
  }
  await base.send(new CreateTableCommand({ ...spec, BillingMode: 'PAY_PER_REQUEST' }))
  // dynamodb-local is effectively synchronous, but poll to be safe.
  for (let i = 0; i < 30; i++) {
    const { Table } = await base.send(new DescribeTableCommand({ TableName: spec.TableName }))
    if (Table?.TableStatus === 'ACTIVE') break
    await new Promise((r) => setTimeout(r, 100))
  }
  process.stdout.write(`  created ${spec.TableName}\n`)
}

// BatchWrite 25 items at a time, retrying any UnprocessedItems.
async function putAll(tableName, items) {
  for (let i = 0; i < items.length; i += 25) {
    let requests = items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } }))
    for (let attempt = 0; attempt < 5 && requests.length; attempt++) {
      const res = await doc.send(
        new BatchWriteCommand({ RequestItems: { [tableName]: requests } })
      )
      requests = res.UnprocessedItems?.[tableName] ?? []
      if (requests.length) await new Promise((r) => setTimeout(r, 100))
    }
    if (requests.length) throw new Error(`Failed to write ${requests.length} items to ${tableName}`)
  }
  process.stdout.write(`  wrote ${items.length} items to ${tableName}\n`)
}

// ------------------------------------------------------------ table specs ----

const USERS = 'SampleUsers'
const PRODUCTS = 'SampleProducts'
const ORDERS = 'SampleOrders'
const REVIEWS = 'SampleReviews'

const USER_COUNT = 120
const PRODUCT_COUNT = 100
const ORDER_COUNT = 150
const REVIEW_COUNT = 200

// ------------------------------------------------------------- generators ----

function genUsers() {
  return Array.from({ length: USER_COUNT }, (_, i) => {
    const id = i + 1
    const first = pick(FIRST, id)
    const last = pick(LAST, id * 7)
    return {
      userId: `u_${pad(id)}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${id}@example.com`,
      fullName: `${first} ${last}`,
      age: randInt(18, 75),
      country: rand(['US', 'GB', 'DE', 'FR', 'JP', 'BR', 'CA', 'AU']),
      isActive: Math.random() > 0.2,
      loyaltyPoints: randInt(0, 5000),
      tags: [rand(['vip', 'new', 'returning']), rand(['email', 'sms', 'push'])],
      createdAt: isoFor(randInt(0, 364))
    }
  })
}

function genProducts() {
  return Array.from({ length: PRODUCT_COUNT }, (_, i) => {
    const id = i + 1
    return {
      productId: `p_${pad(id)}`,
      name: `${pick(ADJ, id)} ${pick(NOUN, id * 3)}`,
      category: pick(CATEGORIES, id),
      price: Number((randInt(199, 49999) / 100).toFixed(2)),
      currency: 'USD',
      inStock: randInt(0, 500),
      rating: Number((randInt(10, 50) / 10).toFixed(1)),
      sku: `SKU-${pad(id, 6)}`,
      featured: Math.random() > 0.8
    }
  })
}

// Orders are keyed (userId HASH, orderId RANGE) so a user's orders sit together.
function genOrders() {
  return Array.from({ length: ORDER_COUNT }, (_, i) => {
    const id = i + 1
    const userId = `u_${pad(randInt(1, USER_COUNT))}`
    const lineItems = Array.from({ length: randInt(1, 4) }, () => ({
      productId: `p_${pad(randInt(1, PRODUCT_COUNT))}`,
      qty: randInt(1, 5),
      unitPrice: Number((randInt(199, 49999) / 100).toFixed(2))
    }))
    const total = Number(
      lineItems.reduce((s, li) => s + li.qty * li.unitPrice, 0).toFixed(2)
    )
    return {
      userId,
      orderId: `o_${pad(id, 5)}`,
      status: pick(STATUSES, id),
      total,
      currency: 'USD',
      itemCount: lineItems.reduce((s, li) => s + li.qty, 0),
      lineItems,
      placedAt: isoFor(randInt(0, 364))
    }
  })
}

// Reviews are keyed (productId HASH, reviewId RANGE).
function genReviews() {
  return Array.from({ length: REVIEW_COUNT }, (_, i) => {
    const id = i + 1
    return {
      productId: `p_${pad(randInt(1, PRODUCT_COUNT))}`,
      reviewId: `r_${pad(id, 5)}`,
      userId: `u_${pad(randInt(1, USER_COUNT))}`,
      rating: randInt(1, 5),
      title: rand(['Great', 'Okay', 'Disappointed', 'Love it', 'Meh', 'Fantastic']),
      comment: pick(COMMENTS, id),
      verifiedPurchase: Math.random() > 0.3,
      helpfulVotes: randInt(0, 250),
      createdAt: isoFor(randInt(0, 364))
    }
  })
}

// -------------------------------------------------------------------- main ----

async function main() {
  process.stdout.write(`Connecting to DynamoDB at ${endpoint}\n`)

  process.stdout.write('Creating tables...\n')
  await recreateTable({
    TableName: USERS,
    AttributeDefinitions: [{ AttributeName: 'userId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }]
  })
  await recreateTable({
    TableName: PRODUCTS,
    AttributeDefinitions: [{ AttributeName: 'productId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'productId', KeyType: 'HASH' }]
  })
  await recreateTable({
    TableName: ORDERS,
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'orderId', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' },
      { AttributeName: 'orderId', KeyType: 'RANGE' }
    ]
  })
  await recreateTable({
    TableName: REVIEWS,
    AttributeDefinitions: [
      { AttributeName: 'productId', AttributeType: 'S' },
      { AttributeName: 'reviewId', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'productId', KeyType: 'HASH' },
      { AttributeName: 'reviewId', KeyType: 'RANGE' }
    ]
  })

  process.stdout.write('Writing sample data...\n')
  await putAll(USERS, genUsers())
  await putAll(PRODUCTS, genProducts())
  await putAll(ORDERS, genOrders())
  await putAll(REVIEWS, genReviews())

  process.stdout.write('\nDone. Seeded 4 tables:\n')
  process.stdout.write(`  ${USERS}    (${USER_COUNT} items)\n`)
  process.stdout.write(`  ${PRODUCTS} (${PRODUCT_COUNT} items)\n`)
  process.stdout.write(`  ${ORDERS}   (${ORDER_COUNT} items)\n`)
  process.stdout.write(`  ${REVIEWS}  (${REVIEW_COUNT} items)\n`)
  base.destroy()
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message ?? err)
  base.destroy()
  process.exit(1)
})
