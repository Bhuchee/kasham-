import * as SQLite from 'expo-sqlite';

// NOTE: Database renamed from kasham.db to chobo.db as part of the Chobo rebrand.
// Existing test users will lose local SQLite data on next install.
// For production launch, implement a migration that copies kasham.db → chobo.db on first launch.
// TODO: Before public launch, add migration logic in initDatabase() to detect and rename the old DB file.
const db = SQLite.openDatabaseSync('chobo.db');

export async function initDatabase() {
    await db.execAsync(`PRAGMA journal_mode = WAL`);

    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      barcode TEXT,
      image_uri TEXT,
      user_id TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `);

    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY NOT NULL,
      total REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      payment_type TEXT NOT NULL,
      timestamp INTEGER NOT NULL DEFAULT 0,
      synced INTEGER NOT NULL DEFAULT 0,
      customer_id TEXT,
      user_id TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `);

    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY NOT NULL,
      sale_id TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      created_at INTEGER NOT NULL DEFAULT 0
    )
  `);

    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY NOT NULL,
      phone TEXT NOT NULL,
      name TEXT,
      user_id TEXT,
      synced INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `);

    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY NOT NULL,
      customer_id TEXT NOT NULL,
      amount_owed REAL NOT NULL,
      sale_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      user_id TEXT,
      synced INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `);
  
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      is_read INTEGER DEFAULT 0,
      user_id TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      related_id TEXT
    )
  `);

    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS payment_logs (
      id TEXT PRIMARY KEY NOT NULL,
      amount REAL NOT NULL,
      sender_name TEXT,
      sender_phone TEXT,
      payment_method TEXT,
      description TEXT,
      notes TEXT,
      user_id TEXT,
      created_at INTEGER NOT NULL DEFAULT 0
    )
  `);
  
  // ---- Safety migrations (idempotent — wrapped in try/catch) ----
  try { await db.execAsync('ALTER TABLE products ADD COLUMN barcode TEXT'); } catch(e){}
  try { await db.execAsync('ALTER TABLE products ADD COLUMN user_id TEXT'); } catch(e){}
  try { await db.execAsync('ALTER TABLE sales ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0'); } catch(e){}
  try { await db.execAsync('ALTER TABLE sales ADD COLUMN customer_name TEXT'); } catch(e){}
  try { await db.execAsync('ALTER TABLE sales ADD COLUMN customer_phone TEXT'); } catch(e){}
  try { await db.execAsync('ALTER TABLE sales ADD COLUMN status TEXT DEFAULT "completed"'); } catch(e){}
  try { await db.execAsync('ALTER TABLE sales ADD COLUMN notes TEXT'); } catch(e){}
  try { await db.execAsync('ALTER TABLE sales ADD COLUMN user_id TEXT'); } catch(e){}
  try { await db.execAsync('ALTER TABLE sale_items ADD COLUMN product_name TEXT'); } catch(e){}
  try { await db.execAsync('ALTER TABLE customers ADD COLUMN user_id TEXT'); } catch(e){}
  try { await db.execAsync('ALTER TABLE debts ADD COLUMN user_id TEXT'); } catch(e){}
  try { await db.execAsync('ALTER TABLE notifications ADD COLUMN user_id TEXT'); } catch(e){}
  try { await db.execAsync('ALTER TABLE payment_logs ADD COLUMN user_id TEXT'); } catch(e){}
  try { await db.execAsync('ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT NULL'); } catch(e){}
  try { await db.execAsync('ALTER TABLE products ADD COLUMN category TEXT'); } catch(e){}
  // Section 6A — role-based notification routing
  try { await db.execAsync('ALTER TABLE notifications ADD COLUMN target_roles TEXT DEFAULT \'["OWNER","MANAGER","STAFF","CASHIER"]\' '); } catch(e){}

  try {
    await db.runAsync(`DELETE FROM products WHERE user_id IS NULL OR user_id = ''`);
    await db.runAsync(`DELETE FROM sales WHERE user_id IS NULL OR user_id = ''`);
    await db.runAsync(`DELETE FROM customers WHERE user_id IS NULL OR user_id = ''`);
    await db.runAsync(`DELETE FROM debts WHERE user_id IS NULL OR user_id = ''`);
  } catch (e) {
    console.log('NULL user_id cleanup — already done or no rows found');
  }
}

// ---- Products ----
export async function getProducts(userId: string): Promise<any[]> {
    return await db.getAllAsync('SELECT * FROM products WHERE user_id = ? ORDER BY name ASC', [userId]);
}

// Section 1A — product count for FREE tier soft cap
export async function getProductCount(userId: string): Promise<number> {
    const result = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM products WHERE user_id = ?',
        [userId]
    );
    return result?.count ?? 0;
}

export async function createProduct(
    id: string, name: string, price: number, stock: number,
    barcode: string | null = null, imageUri: string | null = null,
    userId: string = '', costPrice: number | null = null,
    category: string | null = 'others'
): Promise<void> {
    const now = Date.now();
    await db.runAsync(
        'INSERT OR REPLACE INTO products (id, name, price, stock, barcode, image_uri, user_id, cost_price, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, name, price, stock, barcode, imageUri, userId, costPrice, category, now, now
    );
}

export async function updateProduct(
    id: string, name: string, price: number, stock: number,
    barcode: string | null = null, imageUri: string | null = null,
    costPrice: number | null = null, category: string | null = 'others'
): Promise<void> {
    await db.runAsync(
        'UPDATE products SET name = ?, price = ?, stock = ?, barcode = ?, image_uri = ?, cost_price = ?, category = ?, updated_at = ? WHERE id = ?',
        name, price, stock, barcode, imageUri, costPrice, category, Date.now(), id
    );
}

export async function updateProductQuantity(id: string, stock: number): Promise<void> {
    await db.runAsync(
        'UPDATE products SET stock = ?, updated_at = ? WHERE id = ?',
        stock, Date.now(), id
    );
}

export async function deleteProduct(id: string): Promise<void> {
    await db.runAsync('DELETE FROM products WHERE id = ?', id);
}

export async function decrementStock(productId: string, qty: number): Promise<void> {
    await db.runAsync(
        'UPDATE products SET stock = MAX(0, stock - ?), updated_at = ? WHERE id = ?',
        qty, Date.now(), productId
    );
}

export async function getProductByBarcode(barcode: string, userId: string): Promise<any | null> {
    return await db.getFirstAsync('SELECT * FROM products WHERE barcode = ? AND user_id = ?', [barcode, userId]);
}

// ---- Sales ----
export async function createSale(
    id: string, total: number, paymentType: string,
    discountAmount: number = 0, customerId: string | null = null,
    userId: string = ''
): Promise<void> {
    const now = Date.now();
    await db.runAsync(
        'INSERT INTO sales (id, total, discount_amount, payment_type, timestamp, synced, customer_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)',
        id, total, discountAmount, paymentType, now, customerId, userId, now, now
    );
}

export async function createSaleItem(
    id: string, saleId: string, productId: string | null,
    productName: string, quantity: number, price: number
): Promise<void> {
    await db.runAsync(
        'INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, saleId, productId, productName, quantity, price, Date.now()
    );
}

export async function getTransactionHistory(userId: string): Promise<any[]> {
    return await db.getAllAsync(`
        SELECT s.*, c.name as customer_name, c.phone as customer_phone
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.user_id = ?
        ORDER BY s.timestamp DESC
    `, [userId]);
}

export async function getSaleItems(saleId: string): Promise<any[]> {
    return await db.getAllAsync('SELECT * FROM sale_items WHERE sale_id = ?', saleId);
}

export async function getFrequentlySoldProducts(userId: string, limit: number = 9): Promise<any[]> {
    return await db.getAllAsync(`
        SELECT p.*, COUNT(si.product_id) as sale_count
        FROM products p
        JOIN sale_items si ON p.id = si.product_id
        JOIN sales s ON si.sale_id = s.id
        WHERE p.user_id = ?
        GROUP BY p.id
        ORDER BY sale_count DESC
        LIMIT ?
    `, [userId, limit]);
}

// ---- Stats & Overview ----
export async function getDailyStats(userId: string, range: 'today' | 'week' | 'month' = 'today'): Promise<any> {
    const start = new Date();
    if (range === 'today') start.setHours(0, 0, 0, 0);
    else if (range === 'week') start.setDate(start.getDate() - 7);
    else start.setMonth(start.getMonth() - 1);

    const ts = start.getTime();
    
    const totals = await db.getFirstAsync(`
        SELECT 
            SUM(total) as revenue, 
            COUNT(*) as count,
            SUM(CASE WHEN payment_type = 'CASH' THEN total ELSE 0 END) as cash,
            SUM(CASE WHEN payment_type = 'TRANSFER' THEN total ELSE 0 END) as transfer,
            SUM(CASE WHEN payment_type = 'POS' THEN total ELSE 0 END) as pos,
            SUM(CASE WHEN payment_type = 'PAY_LATER' THEN total ELSE 0 END) as pay_later
        FROM sales 
        WHERE timestamp >= ? AND user_id = ?
    `, [ts, userId]) as any;

    const debt = await db.getFirstAsync(`
        SELECT SUM(amount_owed) as total_debt 
        FROM debts 
        WHERE status = 'PENDING' AND created_at >= ? AND user_id = ?
    `, [ts, userId]) as any;

    return {
        revenue: totals?.revenue || 0,
        count: totals?.count || 0,
        debt: debt?.total_debt || 0,
        methods: {
            cash: totals?.cash || 0,
            transfer: totals?.transfer || 0,
            pos: totals?.pos || 0,
            payLater: totals?.pay_later || 0
        }
    };
}

export async function getTopSoldProducts(userId: string, limit: number = 5): Promise<any[]> {
    return await db.getAllAsync(`
        SELECT si.product_name as name, SUM(si.quantity) as total_qty, p.image_uri, si.price
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id
        LEFT JOIN sales s ON si.sale_id = s.id
        WHERE s.user_id = ?
        GROUP BY si.product_name
        ORDER BY total_qty DESC
        LIMIT ?
    `, [userId, limit]);
}

// Section 3A — profit stats for Overview profit card
export async function getProfitStats(
    userId: string,
    filter: 'today' | 'week' | 'month'
): Promise<{ revenue: number; profit: number; profitMargin: number }> {
    const now = new Date();
    let fromTs: number;
    if (filter === 'today') {
        const d = new Date(now); d.setHours(0, 0, 0, 0); fromTs = d.getTime();
    } else if (filter === 'week') {
        const d = new Date(now); d.setDate(d.getDate() - 7); fromTs = d.getTime();
    } else {
        const d = new Date(now); d.setMonth(d.getMonth() - 1); fromTs = d.getTime();
    }

    const result = await db.getFirstAsync<{ revenue: number; cost: number }>(`
        SELECT
            SUM(si.price * si.quantity) as revenue,
            SUM(COALESCE(p.cost_price, 0) * si.quantity) as cost
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.user_id = ? AND s.timestamp >= ?`,
        [userId, fromTs]
    );

    const revenue = result?.revenue ?? 0;
    const cost = result?.cost ?? 0;
    const profit = revenue - cost;
    const profitMargin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
    return { revenue, profit, profitMargin };
}

// Section 3B — top products with per-product profit (Growth+ only)
export async function getTopSoldProductsWithProfit(
    userId: string,
    limit: number = 5,
    filter: 'today' | 'week' | 'month' = 'month'
): Promise<any[]> {
    const now = new Date();
    let fromTs: number;
    if (filter === 'today') {
        const d = new Date(now); d.setHours(0, 0, 0, 0); fromTs = d.getTime();
    } else if (filter === 'week') {
        const d = new Date(now); d.setDate(d.getDate() - 7); fromTs = d.getTime();
    } else {
        const d = new Date(now); d.setMonth(d.getMonth() - 1); fromTs = d.getTime();
    }

    return await db.getAllAsync(`
        SELECT
            si.product_name as name,
            SUM(si.quantity) as total_qty,
            p.image_uri,
            si.price,
            SUM(si.price * si.quantity) as revenue,
            SUM(COALESCE(p.cost_price, 0) * si.quantity) as cost,
            SUM(si.price * si.quantity) - SUM(COALESCE(p.cost_price, 0) * si.quantity) as profit
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.user_id = ? AND s.timestamp >= ?
        GROUP BY si.product_name
        ORDER BY total_qty DESC
        LIMIT ?
    `, [userId, fromTs, limit]);
}

// ---- Customers & Debts ----
export async function getCustomers(userId: string): Promise<any[]> {
    return await db.getAllAsync('SELECT * FROM customers WHERE user_id = ? ORDER BY name ASC', [userId]);
}

export async function createCustomer(id: string, phone: string, name: string, userId: string = ''): Promise<void> {
    const now = Date.now();
    await db.runAsync(
        'INSERT INTO customers (id, phone, name, user_id, synced, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
        id, phone, name, userId, now, now
    );
}

export async function getOutstandingDebts(userId: string): Promise<any[]> {
    return await db.getAllAsync(`
        SELECT d.*, c.name as customer_name, c.phone as customer_phone
        FROM debts d
        JOIN customers c ON d.customer_id = c.id
        WHERE d.status = 'PENDING' AND d.user_id = ?
        ORDER BY d.created_at DESC
    `, [userId]);
}

export async function createDebt(id: string, customerId: string, amountOwed: number, saleId: string | null, userId: string = ''): Promise<void> {
    const now = Date.now();
    await db.runAsync(
        'INSERT INTO debts (id, customer_id, amount_owed, sale_id, status, user_id, synced, created_at, updated_at) VALUES (?, ?, ?, ?, "PENDING", ?, 0, ?, ?)',
        id, customerId, amountOwed, saleId, userId, now, now
    );
}

export async function markDebtPaid(debtId: string): Promise<void> {
    await db.runAsync(
        'UPDATE debts SET status = "PAID", amount_owed = 0, synced = 0, updated_at = ? WHERE id = ?',
        Date.now(), debtId
    );
}

export async function recordDebtPayment(debtId: string, amountPaid: number, remainingAmount: number): Promise<void> {
    const now = Date.now();
    if (remainingAmount <= 0) {
        await db.runAsync(
            'UPDATE debts SET status = "PAID", amount_owed = 0, synced = 0, updated_at = ? WHERE id = ?',
            now, debtId
        );
    } else {
        await db.runAsync(
            'UPDATE debts SET amount_owed = ?, synced = 0, updated_at = ? WHERE id = ?',
            remainingAmount, now, debtId
        );
    }
}


export async function getUnpaidDebtsOlderThan(userId: string, daysOld: number): Promise<any[]> {
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    return await db.getAllAsync(`
        SELECT d.*, c.name as customer_name
        FROM debts d
        JOIN customers c ON d.customer_id = c.id
        WHERE d.status = 'PENDING' AND d.created_at < ? AND d.user_id = ?
        ORDER BY d.created_at ASC
    `, [cutoff, userId]);
}

export async function getStockSummary(userId: string, lowStockThreshold: number = 5): Promise<{ total: number, low: number, outOfStock: number }> {
    const total = await db.getFirstAsync('SELECT COUNT(*) as count FROM products WHERE user_id = ?', [userId]) as any;
    const low = await db.getFirstAsync(
        'SELECT COUNT(*) as count FROM products WHERE stock BETWEEN 1 AND ? AND user_id = ?',
        [lowStockThreshold, userId]
    ) as any;
    const outOfStock = await db.getFirstAsync('SELECT COUNT(*) as count FROM products WHERE stock <= 0 AND user_id = ?', [userId]) as any;
    return {
        total: total?.count || 0,
        low: low?.count || 0,
        outOfStock: outOfStock?.count || 0
    };
}

export async function getUnsyncedSales(userId: string): Promise<{ sales: any[], saleItems: any[] }> {
    const sales = await db.getAllAsync('SELECT * FROM sales WHERE synced = 0 AND user_id = ?', [userId]);
    if (sales.length === 0) return { sales: [], saleItems: [] };

    const placeholders = sales.map(() => '?').join(',');
    const saleIds = sales.map((s: any) => s.id);
    
    let saleItems: any[] = [];
    if (saleIds.length > 0) {
        saleItems = await db.getAllAsync(`SELECT * FROM sale_items WHERE sale_id IN (${placeholders})`, saleIds);
    }

    return { sales, saleItems };
}

export async function markSalesAsSynced(saleIds: string[]): Promise<void> {
    if (saleIds.length === 0) return;
    const placeholders = saleIds.map(() => '?').join(',');
    await db.runAsync(`UPDATE sales SET synced = 1 WHERE id IN (${placeholders})`, saleIds);
}

export async function getUnsyncedPayments(): Promise<any[]> {
    return [];
}

export async function markPaymentsAsSynced(_paymentIds: string[]): Promise<void> {
    // No-op
}

export async function getUnsyncedDebts(userId: string): Promise<any[]> {
    return await db.getAllAsync('SELECT * FROM debts WHERE synced = 0 AND user_id = ?', [userId]);
}

export async function markDebtsAsSynced(debtIds: string[]): Promise<void> {
    if (debtIds.length === 0) return;
    const placeholders = debtIds.map(() => '?').join(',');
    await db.runAsync(`UPDATE debts SET synced = 1 WHERE id IN (${placeholders})`, debtIds);
}

// ---- Aliases for OverviewScreen ----
export async function getDailySales(userId: string): Promise<any[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return await db.getAllAsync(
        'SELECT * FROM sales WHERE timestamp >= ? AND user_id = ? ORDER BY timestamp DESC',
        [today.getTime(), userId]
    );
}

export const getDebts = getOutstandingDebts;

// ---- Notifications ----
// FIX 7: filter by target_roles so each role only sees relevant notifications
export async function getNotifications(userId: string, userRole?: string): Promise<any[]> {
    if (!userRole) {
        // Fallback — no role provided, return all for this user
        return await db.getAllAsync(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [userId]
        );
    }
    // Only return notifications whose target_roles include the user's current role
    return await db.getAllAsync(
        `SELECT * FROM notifications
         WHERE user_id = ?
           AND (
             target_roles IS NULL
             OR target_roles = '[]'
             OR target_roles LIKE ?
           )
         ORDER BY created_at DESC
         LIMIT 50`,
        [userId, `%"${userRole}"%`]
    );
}

// Section 6B — updated createNotification with target_roles
export async function createNotification(params: {
    id: string;
    type: string;
    title: string;
    description?: string | null;
    relatedId?: string | null;
    userId: string;
    targetRoles?: string[];
}): Promise<void> {
    const roles = JSON.stringify(params.targetRoles ?? ['OWNER', 'MANAGER', 'STAFF', 'CASHIER']);
    await db.runAsync(
        'INSERT INTO notifications (id, type, title, description, is_read, user_id, created_at, related_id, target_roles) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)',
        params.id, params.type, params.title, params.description ?? null,
        params.userId, Date.now(), params.relatedId ?? null, roles
    );
}

export async function markNotificationRead(id: string): Promise<void> {
    await db.runAsync('UPDATE notifications SET is_read = 1 WHERE id = ?', id);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
    await db.runAsync('UPDATE notifications SET is_read = 1 WHERE user_id = ?', userId);
}

export async function notificationExistsForRelated(relatedId: string, type: string): Promise<boolean> {
    const row = await db.getFirstAsync(
        'SELECT id FROM notifications WHERE related_id = ? AND type = ?',
        [relatedId, type]
    ) as any;
    return !!row;
}

// ---- Payment Logs ----
export async function createPaymentLog(
    id: string, amount: number, senderName: string | null,
    senderPhone: string | null, paymentMethod: string | null,
    description: string | null, notes: string | null,
    userId: string = ''
): Promise<void> {
    await db.runAsync(
        'INSERT INTO payment_logs (id, amount, sender_name, sender_phone, payment_method, description, notes, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, amount, senderName, senderPhone, paymentMethod, description, notes, userId, Date.now()
    );
}

export async function getPaymentLogs(userId: string): Promise<any[]> {
    return await db.getAllAsync('SELECT * FROM payment_logs WHERE user_id = ? ORDER BY created_at DESC', [userId]);
}

export { db };
