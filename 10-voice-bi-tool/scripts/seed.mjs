// Seeds the demo dataset: a small e-commerce business ("NovaMart") with
// customers, products, orders, and order items spread over the last 12 months.
// Deterministic (seeded PRNG) so every run produces the same data.
//
// Usage: set DATABASE_URL in .env.local (or the environment), then:
//   npm run seed
import { readFileSync, existsSync } from "node:fs"
import pg from "pg"

// --- Load .env.local / .env manually (no dotenv dependency needed) ---
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.")
  process.exit(1)
}

// --- Deterministic PRNG (mulberry32) ---
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(42)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1))

// --- Data generators ---
const FIRST = ["Ayaan", "Fatima", "Rafi", "Nusrat", "Omar", "Layla", "Daniel", "Sofia", "Ethan", "Mia", "Hasan", "Zara", "Noah", "Amara", "Liam", "Anika", "Yusuf", "Emma", "Adam", "Priya"]
const LAST = ["Rahman", "Khan", "Ahmed", "Chowdhury", "Islam", "Smith", "Garcia", "Chen", "Patel", "Williams", "Hossain", "Akter", "Lee", "Martinez", "Brown", "Nguyen", "Ali", "Kim", "Singh", "Johnson"]
const CITIES = [
  ["Dhaka", "Bangladesh"], ["Chattogram", "Bangladesh"], ["New York", "USA"], ["San Francisco", "USA"],
  ["London", "UK"], ["Manchester", "UK"], ["Dubai", "UAE"], ["Singapore", "Singapore"],
  ["Toronto", "Canada"], ["Berlin", "Germany"], ["Sydney", "Australia"], ["Kuala Lumpur", "Malaysia"],
]
const PRODUCTS = [
  // [name, category, price, cost]
  ["Wireless Earbuds Pro", "Electronics", 79.99, 32], ["Smart Watch S2", "Electronics", 149.99, 68],
  ["Bluetooth Speaker Mini", "Electronics", 39.99, 15], ["4K Action Camera", "Electronics", 199.99, 95],
  ["USB-C Fast Charger", "Electronics", 24.99, 8], ["Noise-Cancel Headphones", "Electronics", 129.99, 55],
  ["Mechanical Keyboard TKL", "Electronics", 89.99, 40], ["Portable SSD 1TB", "Electronics", 109.99, 62],
  ["Classic Denim Jacket", "Apparel", 59.99, 22], ["Cotton Crew T-Shirt", "Apparel", 14.99, 4],
  ["Running Shoes Flex", "Apparel", 89.99, 35], ["Wool Beanie", "Apparel", 12.99, 3.5],
  ["Rain Shell Jacket", "Apparel", 74.99, 28], ["Linen Summer Shirt", "Apparel", 34.99, 12],
  ["Ceramic Pour-Over Set", "Home", 44.99, 16], ["Scented Soy Candle", "Home", 18.99, 5],
  ["Bamboo Cutting Board", "Home", 27.99, 9], ["Memory Foam Pillow", "Home", 39.99, 14],
  ["Cast Iron Skillet 12in", "Home", 49.99, 20], ["Robot Vacuum R30", "Home", 249.99, 120],
  ["Vitamin C Serum", "Beauty", 22.99, 6], ["Hydrating Face Mask", "Beauty", 9.99, 2.5],
  ["Beard Grooming Kit", "Beauty", 29.99, 10], ["Sunscreen SPF50", "Beauty", 15.99, 4.5],
  ["Hair Repair Oil", "Beauty", 19.99, 5.5],
  ["Yoga Mat Pro", "Sports", 34.99, 12], ["Adjustable Dumbbell 24kg", "Sports", 159.99, 75],
  ["Resistance Band Set", "Sports", 21.99, 6], ["Insulated Water Bottle", "Sports", 24.99, 8],
  ["Trail Backpack 30L", "Sports", 69.99, 28],
]

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  console.log("Connected. Rebuilding schema…")

  await client.query(`
    DROP TABLE IF EXISTS order_items, orders, products, customers CASCADE;

    CREATE TABLE customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      city TEXT NOT NULL,
      country TEXT NOT NULL,
      signup_date DATE NOT NULL
    );

    CREATE TABLE products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      cost NUMERIC(10,2) NOT NULL
    );

    CREATE TABLE orders (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      order_date DATE NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('completed','pending','refunded'))
    );

    CREATE TABLE order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_price NUMERIC(10,2) NOT NULL
    );

    CREATE INDEX idx_orders_date ON orders(order_date);
    CREATE INDEX idx_items_order ON order_items(order_id);
    CREATE INDEX idx_items_product ON order_items(product_id);
  `)

  // --- Customers (200) ---
  const today = new Date()
  const customerValues = []
  for (let i = 0; i < 200; i++) {
    const first = pick(FIRST)
    const last = pick(LAST)
    const [city, country] = pick(CITIES)
    const daysAgo = randInt(30, 720)
    const signup = new Date(today.getTime() - daysAgo * 86400000).toISOString().slice(0, 10)
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`
    customerValues.push(`('${first} ${last}', '${email}', '${city}', '${country}', '${signup}')`)
  }
  await client.query(
    `INSERT INTO customers (name, email, city, country, signup_date) VALUES ${customerValues.join(",")}`,
  )

  // --- Products (30) ---
  const productValues = PRODUCTS.map(
    ([name, cat, price, cost]) => `('${name}', '${cat}', ${price}, ${cost})`,
  )
  await client.query(
    `INSERT INTO products (name, category, price, cost) VALUES ${productValues.join(",")}`,
  )

  // --- Orders (1200) over the last 365 days, with mild seasonality ---
  const orderValues = []
  for (let i = 0; i < 1200; i++) {
    const customerId = randInt(1, 200)
    // Bias toward recent months (growing business)
    const daysAgo = Math.floor(365 * Math.pow(rand(), 1.4))
    const date = new Date(today.getTime() - daysAgo * 86400000).toISOString().slice(0, 10)
    const r = rand()
    const status = r < 0.85 ? "completed" : r < 0.92 ? "refunded" : "pending"
    orderValues.push(`(${customerId}, '${date}', '${status}')`)
  }
  await client.query(
    `INSERT INTO orders (customer_id, order_date, status) VALUES ${orderValues.join(",")}`,
  )

  // --- Order items (1-4 per order) ---
  const itemValues = []
  for (let orderId = 1; orderId <= 1200; orderId++) {
    const lineCount = randInt(1, 4)
    for (let j = 0; j < lineCount; j++) {
      const productIdx = randInt(0, PRODUCTS.length - 1)
      const qty = randInt(1, 3)
      const price = PRODUCTS[productIdx][2]
      itemValues.push(`(${orderId}, ${productIdx + 1}, ${qty}, ${price})`)
    }
  }
  // Insert in chunks to stay under parameter/packet limits
  for (let i = 0; i < itemValues.length; i += 1000) {
    await client.query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ${itemValues.slice(i, i + 1000).join(",")}`,
    )
  }

  const counts = await client.query(`
    SELECT
      (SELECT count(*) FROM customers) AS customers,
      (SELECT count(*) FROM products) AS products,
      (SELECT count(*) FROM orders) AS orders,
      (SELECT count(*) FROM order_items) AS order_items
  `)
  console.log("Seeded:", counts.rows[0])
  await client.end()
  console.log("Done. Start the app with `npm run dev` and ask it questions.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
