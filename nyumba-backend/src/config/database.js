const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });

    pool.on('connect', () => {
      if (process.env.NODE_ENV !== 'test') {
        // console.debug('[DB] New client connected to pool');
      }
    });
  }
  return pool;
}

/**
 * Execute a query with automatic connection management.
 * @param {string} text - SQL query
 * @param {Array}  params - Parameterized values
 */
async function query(text, params) {
  const start = Date.now();
  const result = await getPool().query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development' && duration > 500) {
    console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 100));
  }
  return result;
}

/**
 * Run multiple queries in a transaction.
 * @param {Function} callback - async fn(client) => result
 */
async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function testConnection() {
  const result = await query('SELECT NOW() as now');
  return result.rows[0].now;
}

module.exports = { query, withTransaction, testConnection, getPool };
