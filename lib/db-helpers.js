import pg from "pg";
import { sanitizeEmail, sanitizeNameUpper, sanitizePhone, sanitizeText } from "./sanitize.js";

const { Pool } = pg;

let pool;
let adminBusinessColumnsReadyPromise = null;
let adminBusinessColumnsInitStarted = false;

const ALLOWED_BUSINESS_TYPES = new Set(['product', 'service', 'both']);

const formatQuery = (text, params = []) => {
  if (!params.length) return text;
  let index = 0;
  return text.replace(/\?/g, () => `$${++index}`);
};

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function ensureAdminBusinessColumns() {
  adminBusinessColumnsInitStarted = true;
  if (adminBusinessColumnsReadyPromise) {
    return adminBusinessColumnsReadyPromise;
  }

  const poolRef = getPool();
  adminBusinessColumnsReadyPromise = (async () => {
    await poolRef.query(
      `ALTER TABLE admins ADD COLUMN IF NOT EXISTS business_category VARCHAR(120)`
    );
    await poolRef.query(
      `ALTER TABLE admins ADD COLUMN IF NOT EXISTS business_type VARCHAR(20)`
    );
    await poolRef.query(
      `ALTER TABLE admins ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ`
    );
    await poolRef.query(
      `ALTER TABLE admins ADD COLUMN IF NOT EXISTS automation_enabled BOOLEAN NOT NULL DEFAULT TRUE`
    );
    await poolRef.query(
      `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS automation_disabled BOOLEAN NOT NULL DEFAULT FALSE`
    );
    await poolRef.query(
      `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS previous_owner_admin VARCHAR(180)`
    );
    await poolRef.query(
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS reason_of_contacting TEXT`
    );
    await poolRef.query(
      `
        UPDATE leads
        SET reason_of_contacting = LEFT(
          regexp_replace(COALESCE(requirement_text, ''), E'[\\n\\r\\t]+', ' ', 'g'),
          220
        )
        WHERE (reason_of_contacting IS NULL OR btrim(reason_of_contacting) = '')
          AND requirement_text IS NOT NULL
          AND btrim(requirement_text) <> ''
      `
    );
    await poolRef.query(
      `ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS duration_value NUMERIC(10,2)`
    );
    await poolRef.query(
      `ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS duration_unit VARCHAR(20)`
    );
    await poolRef.query(
      `ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS quantity_value NUMERIC(10,3)`
    );
    await poolRef.query(
      `ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS quantity_unit VARCHAR(40)`
    );
    await poolRef.query(
      `UPDATE catalog_items
       SET duration_value = duration_minutes,
           duration_unit = COALESCE(NULLIF(duration_unit, ''), 'minutes')
       WHERE duration_minutes IS NOT NULL
         AND duration_value IS NULL`
    );
    await poolRef.query(
      `
        CREATE TABLE IF NOT EXISTS signup_verifications (
          id SERIAL PRIMARY KEY,
          email VARCHAR(150) UNIQUE NOT NULL,
          code_hash TEXT NOT NULL,
          payload_json JSONB NOT NULL,
          attempts INT NOT NULL DEFAULT 0,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    );
    await poolRef.query(
      `CREATE INDEX IF NOT EXISTS signup_verifications_expires_idx ON signup_verifications (expires_at)`
    );

    const adminProfessionColumn = await poolRef.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'admins'
          AND column_name = 'profession'
        LIMIT 1
      `
    );

    if (adminProfessionColumn.rows.length > 0) {
      await poolRef.query(
        `
          UPDATE admins
          SET business_type = CASE
            WHEN LOWER(COALESCE(profession, '')) IN ('clinic', 'salon', 'gym', 'spa', 'doctor', 'consultant') THEN 'service'
            WHEN LOWER(COALESCE(profession, '')) IN ('warehouse', 'inventory') THEN 'product'
            ELSE 'both'
          END
          WHERE business_type IS NULL OR btrim(business_type) = ''
        `
      );

      await poolRef.query(
        `
          UPDATE admins
          SET business_category = COALESCE(
            NULLIF(btrim(business_category), ''),
            NULLIF(btrim(whatsapp_name), ''),
            NULLIF(btrim(profession), ''),
            'General'
          )
          WHERE business_category IS NULL OR btrim(business_category) = ''
        `
      );
    } else {
      await poolRef.query(
        `
          UPDATE admins
          SET business_type = COALESCE(NULLIF(btrim(business_type), ''), 'both')
          WHERE business_type IS NULL OR btrim(business_type) = ''
        `
      );
      await poolRef.query(
        `
          UPDATE admins
          SET business_category = COALESCE(
            NULLIF(btrim(business_category), ''),
            NULLIF(btrim(whatsapp_name), ''),
            'General'
          )
          WHERE business_category IS NULL OR btrim(business_category) = ''
        `
      );
    }

    await poolRef.query(`ALTER TABLE admins DROP COLUMN IF EXISTS profession_request`);
    await poolRef.query(`ALTER TABLE admins DROP COLUMN IF EXISTS profession_requested_at`);
    await poolRef.query(`ALTER TABLE admins DROP COLUMN IF EXISTS profession`);
    await poolRef.query(`ALTER TABLE appointments DROP COLUMN IF EXISTS profession`);
  })().catch((error) => {
    adminBusinessColumnsInitStarted = false;
    adminBusinessColumnsReadyPromise = null;
    throw error;
  });

  return adminBusinessColumnsReadyPromise;
}

export async function initializeDbHelpers() {
  await ensureAdminBusinessColumns();
}

export async function getConnection() {
  if (!adminBusinessColumnsInitStarted) {
    void ensureAdminBusinessColumns().catch((error) => {
      console.warn(
        "⚠️ Database helper initialization will retry on next startup/request:",
        error?.message || error
      );
    });
  }
  const client = await getPool().connect();
  const query = async (text, params = []) => {
    const sql = formatQuery(text, params);
    const result = await client.query(sql, params);
    return [result.rows, result];
  };
  return {
    query,
    execute: query,
    release: () => client.release(),
  };
}

// Get all users with their admin info
export async function getAllUsers(adminId = null, { search = '', limit = 50, offset = 0 } = {}) {
  const connection = await getConnection();
  try {
    const params = [];
    const whereParts = [];
    if (adminId) {
      whereParts.push('u.assigned_admin_id = ?');
      params.push(adminId);
    }
    if (search) {
      const q = `%${search.toLowerCase()}%`;
      whereParts.push('(LOWER(u.name) LIKE ? OR u.phone LIKE ? OR LOWER(u.email) LIKE ?)');
      params.push(q, q, q);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [users] = await connection.query(
      `
        SELECT u.*, a.name as admin_name
        FROM contacts u
        LEFT JOIN admins a ON u.assigned_admin_id = a.id
        ${whereClause}
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT ?
        OFFSET ?
      `,
      [...params, limit, offset]
    );
    return users;
  } finally {
    connection.release();
  }
}

export async function countUsersSince(adminId = null, since = null) {
  const connection = await getConnection();
  try {
    const params = [];
    const whereParts = [];
    if (adminId) {
      whereParts.push('u.assigned_admin_id = ?');
      params.push(adminId);
    }
    if (since) {
      whereParts.push('u.created_at > ?');
      params.push(since);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [rows] = await connection.query(
      `
        SELECT COUNT(*) as count
        FROM contacts u
        ${whereClause}
      `,
      params
    );
    return Number(rows?.[0]?.count || 0);
  } finally {
    connection.release();
  }
}

// Get user by ID
export async function getUserById(userId, adminId = null) {
  const connection = await getConnection();
  try {
    const params = [userId];
    let whereClause = 'WHERE u.id = ?';
    if (adminId) {
      whereClause += ' AND u.assigned_admin_id = ?';
      params.push(adminId);
    }
    const [user] = await connection.query(
      `
        SELECT u.*, a.name as admin_name
        FROM contacts u
        LEFT JOIN admins a ON u.assigned_admin_id = a.id
        ${whereClause}
      `,
      params
    );
    return user[0];
  } finally {
    connection.release();
  }
}

export async function updateUserAutomation(userId, automationDisabled, adminId = null) {
  const connection = await getConnection();
  try {
    const params = [Boolean(automationDisabled), userId];
    let whereClause = 'WHERE id = ?';
    if (adminId) {
      whereClause += ' AND assigned_admin_id = ?';
      params.push(adminId);
    }

    await connection.query(
      `
        UPDATE contacts
        SET automation_disabled = ?, updated_at = NOW()
        ${whereClause}
      `,
      params
    );

    return await getUserById(userId, adminId);
  } finally {
    connection.release();
  }
}

export async function getUserByPhone(phone) {
  const connection = await getConnection();
  try {
    const normalizedPhone = sanitizePhone(phone);
    if (!normalizedPhone) return null;
    const [rows] = await connection.query(
      `
        SELECT u.*, a.name as admin_name
        FROM contacts u
        LEFT JOIN admins a ON u.assigned_admin_id = a.id
        WHERE u.phone = ?
           OR regexp_replace(u.phone, '\\D', '', 'g') = ?
        LIMIT 1
      `,
      [normalizedPhone, normalizedPhone]
    );
    return rows[0] || null;
  } finally {
    connection.release();
  }
}

// Get all messages with user and admin details
export async function getAllMessages(adminId = null, { search = '', limit = 50, offset = 0 } = {}) {
  const connection = await getConnection();
  try {
    const params = [];
    const whereParts = [];
    if (adminId) {
      whereParts.push('m.admin_id = ?');
      params.push(adminId);
    }
    if (search) {
      const q = `%${search.toLowerCase()}%`;
      whereParts.push('(LOWER(u.name) LIKE ? OR u.phone LIKE ? OR LOWER(m.message_text) LIKE ?)');
      params.push(q, q, q);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [messages] = await connection.query(
      `
        SELECT m.*, u.name as user_name, u.phone, a.name as admin_name
        FROM messages m
        LEFT JOIN contacts u ON m.user_id = u.id
        LEFT JOIN admins a ON m.admin_id = a.id
        ${whereClause}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ?
        OFFSET ?
      `,
      [...params, limit, offset]
    );
    return messages;
  } finally {
    connection.release();
  }
}

export async function deleteMessagesOlderThan(days = 15) {
  const connection = await getConnection();
  try {
    const safeDays = Number.isFinite(Number(days)) ? Number(days) : 15;
    const interval = `${safeDays} days`;
    await connection.query(
      `DELETE FROM messages WHERE created_at < NOW() - ($1::interval)`,
      [interval]
    );
  } finally {
    connection.release();
  }
}

// Get messages for a specific user
export async function getMessagesForUser(
  userId,
  adminId = null,
  { limit = 50, offset = 0, before = null } = {}
) {
  const connection = await getConnection();
  try {
    const params = [userId];
    const whereParts = ['m.user_id = ?'];
    if (adminId) {
      whereParts.push('m.admin_id = ?');
      params.push(adminId);
    }
    if (before) {
      whereParts.push('m.created_at < ?');
      params.push(before);
    }
    const whereClause = `WHERE ${whereParts.join(' AND ')}`;
    const [messages] = await connection.query(
      `
        SELECT m.*, u.name as user_name, a.name as admin_name
        FROM messages m
        LEFT JOIN contacts u ON m.user_id = u.id
        LEFT JOIN admins a ON m.admin_id = a.id
        ${whereClause}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ?
        OFFSET ?
      `,
      [...params, limit, offset]
    );
    return messages;
  } finally {
    connection.release();
  }
}

export async function markMessagesRead(userId, adminId = null) {
  const connection = await getConnection();
  try {
    const params = [userId];
    const whereParts = ['user_id = ?', "message_type = 'incoming'", "status <> 'read'"];
    if (adminId) {
      whereParts.push('admin_id = ?');
      params.push(adminId);
    }
    const whereClause = `WHERE ${whereParts.join(' AND ')}`;
    const [, result] = await connection.query(
      `
        UPDATE messages
        SET status = 'read'
        ${whereClause}
      `,
      params
    );
    return Number(result?.rowCount || 0);
  } finally {
    connection.release();
  }
}

// Get all leads with user info
export async function getAllRequirements(
  adminId = null,
  { search = '', status = 'all', limit = 50, offset = 0 } = {}
) {
  const connection = await getConnection();
  try {
    const params = [];
    const whereParts = [];
    if (adminId) {
      whereParts.push('u.assigned_admin_id = ?');
      params.push(adminId);
    }
    if (status && status !== 'all') {
      whereParts.push('r.status = ?');
      params.push(status);
    }
    if (search) {
      const q = `%${search.toLowerCase()}%`;
      whereParts.push('(LOWER(u.name) LIKE ? OR LOWER(r.requirement_text) LIKE ?)');
      params.push(q, q);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [leads] = await connection.query(
      `
        SELECT r.*, u.name, u.phone
        FROM leads r
        LEFT JOIN contacts u ON r.user_id = u.id
        ${whereClause}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ?
        OFFSET ?
      `,
      [...params, limit, offset]
    );
    return leads;
  } finally {
    connection.release();
  }
}

export async function updateRequirementStatus(requirementId, status, adminId = null) {
  const connection = await getConnection();
  try {
    if (adminId) {
      await connection.query(
        `UPDATE leads r
         SET status = ?
         FROM contacts u
         WHERE r.user_id = u.id AND r.id = ? AND u.assigned_admin_id = ?`,
        [status, requirementId, adminId]
      );
    } else {
      await connection.query(
        `UPDATE leads SET status = ? WHERE id = ?`,
        [status, requirementId]
      );
    }

    const params = [requirementId];
    let whereClause = 'WHERE r.id = ?';
    if (adminId) {
      whereClause += ' AND u.assigned_admin_id = ?';
      params.push(adminId);
    }
    const [rows] = await connection.query(
      `SELECT r.*, u.name, u.phone
       FROM leads r
       LEFT JOIN contacts u ON r.user_id = u.id
       ${whereClause}
       LIMIT 1`,
      params
    );
    return rows[0] || null;
  } finally {
    connection.release();
  }
}

export async function getAppointments(
  adminId = null,
  { search = '', status = 'all', limit = 50, offset = 0 } = {}
) {
  const connection = await getConnection();
  try {
    const params = [];
    const whereParts = [];
    if (adminId) {
      whereParts.push('a.admin_id = ?');
      params.push(adminId);
    }
    if (status && status !== 'all') {
      whereParts.push('a.status = ?');
      params.push(status);
    }
    if (search) {
      const q = `%${search.toLowerCase()}%`;
      whereParts.push('(LOWER(u.name) LIKE ? OR u.phone LIKE ? OR LOWER(a.appointment_type) LIKE ?)');
      params.push(q, q, q);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [rows] = await connection.query(
      `
        ${appointmentSelectWithPayments}
        ${whereClause}
        ORDER BY a.start_time DESC, a.id DESC
        LIMIT ?
        OFFSET ?
      `,
      [...params, limit, offset]
    );
    return rows;
  } finally {
    connection.release();
  }
}

const normalizeAmount = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const appointmentSelectWithPayments = `
  SELECT
    a.*,
    u.name as user_name,
    u.phone,
    u.email,
    a.payment_total,
    COALESCE(a.payment_paid, 0) as payment_paid,
    GREATEST(COALESCE(a.payment_total, 0) - COALESCE(a.payment_paid, 0), 0) as payment_due,
    CASE
      WHEN a.payment_total IS NULL OR a.payment_total <= 0 THEN 'unpaid'
      WHEN COALESCE(a.payment_paid, 0) <= 0 THEN 'unpaid'
      WHEN COALESCE(a.payment_paid, 0) < a.payment_total THEN 'partial'
      ELSE 'paid'
    END as payment_status,
    a.payment_method,
    a.payment_notes
  FROM appointments a
  LEFT JOIN contacts u ON a.user_id = u.id
`;

export async function updateAppointment(appointmentId, updates = {}, adminId = null) {
  const connection = await getConnection();
  try {
    const fields = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
      fields.push('status = ?');
      params.push(updates.status);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'appointment_type')) {
      fields.push('appointment_type = ?');
      params.push(updates.appointment_type || null);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'start_time')) {
      fields.push('start_time = ?');
      params.push(updates.start_time);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'end_time')) {
      fields.push('end_time = ?');
      params.push(updates.end_time);
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'payment_total')) {
      fields.push('payment_total = ?');
      params.push(normalizeAmount(updates.payment_total));
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'payment_paid')) {
      fields.push('payment_paid = ?');
      params.push(normalizeAmount(updates.payment_paid));
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'payment_method')) {
      fields.push('payment_method = ?');
      params.push(updates.payment_method || null);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'payment_notes')) {
      fields.push('payment_notes = ?');
      params.push(updates.payment_notes || null);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'payment_currency')) {
      fields.push('payment_currency = ?');
      params.push(updates.payment_currency || null);
    }

    if (fields.length === 0) {
      return null;
    }

    fields.push('updated_at = NOW()');
    params.push(appointmentId);
    if (adminId) {
      params.push(adminId);
    }

    if (adminId) {
      await connection.query(
        `UPDATE appointments a
         SET ${fields.join(', ')}
         FROM contacts u
         WHERE a.user_id = u.id AND a.id = ? AND a.admin_id = ?`,
        params
      );
    } else {
      await connection.query(
        `UPDATE appointments
         SET ${fields.join(', ')}
         WHERE id = ?`,
        params
      );
    }

    const fetchParams = [appointmentId];
    let whereClause = 'WHERE a.id = ?';
    if (adminId) {
      whereClause += ' AND a.admin_id = ?';
      fetchParams.push(adminId);
    }
    const [rows] = await connection.query(
      `
        ${appointmentSelectWithPayments}
        ${whereClause}
        LIMIT 1
      `,
      fetchParams
    );
    return rows[0] || null;
  } finally {
    connection.release();
  }
}

export async function updateAppointmentStatus(appointmentId, status, adminId = null) {
  return updateAppointment(appointmentId, { status }, adminId);
}

export async function createAppointment(
  {
    user_id,
    admin_id,
    appointment_type,
    start_time,
    end_time,
    status = 'booked',
    payment_total,
    payment_paid,
    payment_method,
    payment_notes,
  } = {}
) {
  const connection = await getConnection();
  try {
    const normalizedTotal = normalizeAmount(payment_total);
    const normalizedPaid = normalizeAmount(payment_paid);

    const [rows] = await connection.query(
      `
        INSERT INTO appointments
          (user_id, admin_id, appointment_type, start_time, end_time, status, payment_total, payment_paid, payment_method, payment_notes, payment_currency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `,
      [
        user_id,
        admin_id,
        appointment_type || null,
        start_time,
        end_time,
        status,
        normalizedTotal,
        normalizedPaid,
        payment_method || null,
        payment_notes || null,
        null,
      ]
    );
    const appointmentId = rows?.[0]?.id;
    if (!appointmentId) return null;

    const [created] = await connection.query(
      `
        ${appointmentSelectWithPayments}
        WHERE a.id = ?
        LIMIT 1
      `,
      [appointmentId]
    );
    return created[0] || null;
  } finally {
    connection.release();
  }
}

const orderSelectWithPayments = `
  SELECT
    o.*,
    o.payment_total as total_amount,
    o.payment_total as payment_total,
    COALESCE(o.payment_paid, 0) as payment_paid,
    GREATEST(COALESCE(o.payment_total, 0) - COALESCE(o.payment_paid, 0), 0) as payment_due,
    CASE
      WHEN o.payment_status IN ('failed', 'refunded') THEN o.payment_status
      WHEN o.payment_total IS NULL OR o.payment_total <= 0 THEN 'pending'
      WHEN COALESCE(o.payment_paid, 0) >= o.payment_total THEN 'paid'
      ELSE 'pending'
    END as payment_status,
    o.payment_method as payment_method,
    o.payment_notes as payment_notes
  FROM orders o
`;

export async function getOrders(
  adminId = null,
  { limit = 200, offset = 0 } = {}
) {
  const connection = await getConnection();
  try {
    const params = [];
    const whereParts = [];
    if (adminId) {
      whereParts.push('o.admin_id = ?');
      params.push(adminId);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [rows] = await connection.query(
      `
        ${orderSelectWithPayments}
        ${whereClause}
        ORDER BY COALESCE(o.placed_at, o.created_at) DESC, o.id DESC
        LIMIT ?
        OFFSET ?
      `,
      [...params, limit, offset]
    );
    return rows;
  } finally {
    connection.release();
  }
}

export async function updateOrder(orderId, updates = {}, adminId = null) {
  const connection = await getConnection();
  try {
    const fields = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
      fields.push('status = ?');
      params.push(updates.status);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'fulfillment_status')) {
      fields.push('fulfillment_status = ?');
      params.push(updates.fulfillment_status);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'assigned_to')) {
      fields.push('assigned_to = ?');
      params.push(updates.assigned_to || null);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'notes')) {
      fields.push('notes = ?');
      params.push(
        Array.isArray(updates.notes) || updates.notes === null
          ? updates.notes
          : null
      );
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'payment_total')) {
      fields.push('payment_total = ?');
      params.push(normalizeAmount(updates.payment_total));
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'payment_paid')) {
      fields.push('payment_paid = ?');
      params.push(normalizeAmount(updates.payment_paid));
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'payment_method')) {
      fields.push('payment_method = ?');
      params.push(updates.payment_method || null);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'payment_status')) {
      fields.push('payment_status = ?');
      params.push(updates.payment_status || 'pending');
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'payment_notes')) {
      fields.push('payment_notes = ?');
      params.push(updates.payment_notes || null);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'payment_currency')) {
      fields.push('payment_currency = ?');
      params.push(updates.payment_currency || null);
    }

    if (fields.length === 0) {
      return null;
    }

    fields.push('updated_at = NOW()');
    params.push(orderId);
    if (adminId) {
      params.push(adminId);
    }

    if (adminId) {
      await connection.query(
        `UPDATE orders o
         SET ${fields.join(', ')}
         WHERE o.id = ? AND o.admin_id = ?`,
        params
      );
    } else {
      await connection.query(
        `UPDATE orders
         SET ${fields.join(', ')}
         WHERE id = ?`,
        params
      );
    }

    const fetchParams = [orderId];
    let whereClause = 'WHERE o.id = ?';
    if (adminId) {
      whereClause += ' AND o.admin_id = ?';
      fetchParams.push(adminId);
    }
    const [rows] = await connection.query(
      `
        ${orderSelectWithPayments}
        ${whereClause}
        LIMIT 1
      `,
      fetchParams
    );
    return rows[0] || null;
  } finally {
    connection.release();
  }
}

export async function countOrdersSince(adminId = null, since = null) {
  const connection = await getConnection();
  try {
    const params = [];
    const whereParts = [];
    if (adminId) {
      whereParts.push('o.admin_id = ?');
      params.push(adminId);
    }
    if (since) {
      whereParts.push('COALESCE(o.placed_at, o.created_at) > ?');
      params.push(since);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [rows] = await connection.query(
      `
        SELECT COUNT(*) as count
        FROM orders o
        ${whereClause}
      `,
      params
    );
    return Number(rows?.[0]?.count || 0);
  } finally {
    connection.release();
  }
}

// Get all needs with user and admin info
export async function getAllNeeds(
  adminId = null,
  { search = '', status = 'all', limit = 50, offset = 0 } = {}
) {
  const connection = await getConnection();
  try {
    const params = [];
    const whereParts = [];
    if (adminId) {
      whereParts.push('u.assigned_admin_id = ?');
      params.push(adminId);
    }
    if (status && status !== 'all') {
      whereParts.push('n.status = ?');
      params.push(status);
    }
    if (search) {
      const q = `%${search.toLowerCase()}%`;
      whereParts.push('(LOWER(u.name) LIKE ? OR LOWER(n.need_text) LIKE ?)');
      params.push(q, q);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [needs] = await connection.query(
      `
        SELECT n.*, u.name, u.phone, a.name as assigned_admin_name
        FROM tasks n
        LEFT JOIN contacts u ON n.user_id = u.id
        LEFT JOIN admins a ON n.assigned_to = a.id
        ${whereClause}
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ?
        OFFSET ?
      `,
      [...params, limit, offset]
    );
    return needs;
  } finally {
    connection.release();
  }
}

// Add new user
export async function addUser(phone, name, email, assigned_admin_id) {
  const connection = await getConnection();
  try {
    const normalizedPhone = sanitizePhone(phone);
    if (!normalizedPhone) {
      throw new Error('Invalid phone number');
    }
    const normalizedName = sanitizeNameUpper(name);
    const normalizedEmail = sanitizeEmail(email);
    const [rows] = await connection.query(
      `
        INSERT INTO contacts (phone, name, email, assigned_admin_id)
        VALUES (?, ?, ?, ?)
        RETURNING id
      `,
      [normalizedPhone, normalizedName, normalizedEmail, assigned_admin_id]
    );
    return rows[0]?.id || null;
  } finally {
    connection.release();
  }
}

// Add new message
export async function addMessage(user_id, admin_id, message_text, message_type) {
  const connection = await getConnection();
  try {
    const [rows] = await connection.query(
      `
        INSERT INTO messages (user_id, admin_id, message_text, message_type, status)
        VALUES (?, ?, ?, ?, 'sent')
        RETURNING id
      `,
      [user_id, admin_id, message_text, message_type]
    );
    return rows[0]?.id || null;
  } finally {
    connection.release();
  }
}

// Get dashboard stats
export async function getDashboardStats(adminId = null) {
  const connection = await getConnection();
  try {
    if (!adminId) {
      const [stats] = await connection.query(`
        SELECT 
          (SELECT COUNT(*) FROM contacts) as total_users,
          (SELECT COUNT(*) FROM messages WHERE message_type = 'incoming') as incoming_messages,
          (SELECT COUNT(*) FROM leads WHERE status = 'in_progress') as active_requirements,
          (SELECT COUNT(*) FROM tasks WHERE status = 'open') as open_needs
      `);
      return stats[0];
    }

    const [stats] = await connection.query(
      `
        SELECT
          (SELECT COUNT(*) FROM contacts WHERE assigned_admin_id = ?) as total_users,
          (SELECT COUNT(*) FROM messages WHERE message_type = 'incoming' AND admin_id = ?) as incoming_messages,
          (SELECT COUNT(*)
           FROM leads r
           JOIN contacts u ON r.user_id = u.id
           WHERE r.status = 'in_progress' AND u.assigned_admin_id = ?) as active_requirements,
          (SELECT COUNT(*)
           FROM tasks n
           JOIN contacts u ON n.user_id = u.id
           WHERE n.status = 'open' AND u.assigned_admin_id = ?) as open_needs
      `,
      [adminId, adminId, adminId, adminId]
    );
    return stats[0];
  } finally {
    connection.release();
  }
}

export async function getAdminById(adminId) {
  const connection = await getConnection();
  try {
    await connection.query(
      `UPDATE admins
       SET status = 'inactive'
       WHERE status = 'active'
         AND access_expires_at IS NOT NULL
         AND access_expires_at <= NOW()`
    );

    const [rows] = await connection.query(
      `SELECT id, name, email, phone, admin_tier, status,
              business_category, business_type, access_expires_at,
              whatsapp_number, whatsapp_name, whatsapp_connected_at,
              ai_enabled, ai_prompt, ai_blocklist,
              created_at, updated_at
       FROM admins
       WHERE id = ?
       LIMIT 1`,
      [adminId]
    );
    return rows[0] || null;
  } finally {
    connection.release();
  }
}

export async function getAdmins() {
  const connection = await getConnection();
  try {
    await connection.query(
      `UPDATE admins
       SET status = 'inactive'
       WHERE status = 'active'
         AND access_expires_at IS NOT NULL
         AND access_expires_at <= NOW()`
    );

    const [rows] = await connection.query(
      `SELECT id, name, email, phone, admin_tier, status,
              business_category, business_type, access_expires_at,
              created_at, updated_at
       FROM admins
       ORDER BY created_at DESC`
    );
    return rows;
  } finally {
    connection.release();
  }
}

export async function updateAdminAccess(
  adminId,
  {
    admin_tier,
    status,
    business_category,
    business_type,
    access_expires_at,
  } = {}
) {
  const payload = arguments[1] || {};
  const connection = await getConnection();
  try {
    const updates = [];
    const values = [];
    if (admin_tier) {
      updates.push('admin_tier = ?');
      values.push(admin_tier);
    }
    if (status) {
      updates.push('status = ?');
      values.push(status);
    }
    if (typeof business_category === 'string') {
      updates.push('business_category = ?');
      values.push(business_category.trim() || null);
    }
    if (typeof business_type === 'string') {
      const normalized = business_type.trim().toLowerCase();
      if (ALLOWED_BUSINESS_TYPES.has(normalized)) {
        updates.push('business_type = ?');
        values.push(normalized);
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'access_expires_at')) {
      updates.push('access_expires_at = ?');
      values.push(access_expires_at || null);
    }
    if (updates.length === 0) {
      const [rows] = await connection.query(
        `SELECT id, name, email, phone, admin_tier, status,
                business_category, business_type, access_expires_at,
                created_at, updated_at
         FROM admins
         WHERE id = ?
         LIMIT 1`,
        [adminId]
      );
      return rows[0] || null;
    }
    values.push(adminId);
    await connection.query(
      `UPDATE admins SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    const [rows] = await connection.query(
      `SELECT id, name, email, phone, admin_tier, status,
              business_category, business_type, access_expires_at,
              created_at, updated_at
       FROM admins
       WHERE id = ?
       LIMIT 1`,
      [adminId]
    );
    return rows[0] || null;
  } finally {
    connection.release();
  }
}

export async function countSuperAdmins() {
  const connection = await getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT COUNT(*) as count FROM admins WHERE admin_tier = 'super_admin'`
    );
    return Number(rows?.[0]?.count || 0);
  } finally {
    connection.release();
  }
}

export async function deleteAdminAndData(adminId, transferToAdminId = null) {
  const connection = await getConnection();
  try {
    const [adminRows] = await connection.query(
      `SELECT id, name, admin_tier FROM admins WHERE id = ? LIMIT 1`,
      [adminId]
    );
    const admin = adminRows?.[0] || null;
    if (!admin) {
      return { ok: false, reason: 'not_found' };
    }

    let targetSuperAdminId = Number.isFinite(Number(transferToAdminId))
      ? Number(transferToAdminId)
      : null;
    if (targetSuperAdminId === adminId) {
      targetSuperAdminId = null;
    }
    if (targetSuperAdminId) {
      const [superRows] = await connection.query(
        `SELECT id FROM admins WHERE id = ? AND admin_tier = 'super_admin' LIMIT 1`,
        [targetSuperAdminId]
      );
      if (!superRows?.length) {
        targetSuperAdminId = null;
      }
    }
    if (!targetSuperAdminId) {
      const [superRows] = await connection.query(
        `SELECT id
         FROM admins
         WHERE admin_tier = 'super_admin' AND id <> ?
         ORDER BY id ASC
         LIMIT 1`,
        [adminId]
      );
      targetSuperAdminId = superRows?.[0]?.id || null;
    }
    if (!targetSuperAdminId) {
      return { ok: false, reason: 'no_super_admin_to_transfer' };
    }

    const [contactRows] = await connection.query(
      `SELECT id FROM contacts WHERE assigned_admin_id = ?`,
      [adminId]
    );
    const contactIds = contactRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));

    await connection.query('BEGIN');

    await connection.query(
      `UPDATE contacts
       SET assigned_admin_id = ?,
           previous_owner_admin = CASE
             WHEN COALESCE(btrim(previous_owner_admin), '') = '' THEN ?
             ELSE previous_owner_admin
           END
       WHERE assigned_admin_id = ?`,
      [targetSuperAdminId, `${admin.id}:${admin.name || ''}`.slice(0, 180), adminId]
    );

    if (contactIds.length > 0) {
      const placeholders = contactIds.map(() => '?').join(', ');
      await connection.query(
        `DELETE FROM messages WHERE user_id IN (${placeholders})`,
        contactIds
      );
      await connection.query(
        `DELETE FROM leads WHERE user_id IN (${placeholders})`,
        contactIds
      );
      await connection.query(
        `DELETE FROM tasks WHERE user_id IN (${placeholders})`,
        contactIds
      );
      await connection.query(
        `DELETE FROM appointments WHERE user_id IN (${placeholders})`,
        contactIds
      );
    }

    await connection.query(`DELETE FROM messages WHERE admin_id = ?`, [adminId]);
    await connection.query(`DELETE FROM tasks WHERE assigned_to = ?`, [adminId]);
    await connection.query(`DELETE FROM appointments WHERE admin_id = ?`, [adminId]);
    await connection.query(`DELETE FROM orders WHERE admin_id = ?`, [adminId]);
    await connection.query(`DELETE FROM catalog_items WHERE admin_id = ?`, [adminId]);
    await connection.query(`DELETE FROM broadcasts WHERE created_by = ?`, [adminId]);
    await connection.query(`DELETE FROM templates WHERE created_by = ?`, [adminId]);

    const [deletedRows] = await connection.query(
      `DELETE FROM admins WHERE id = ? RETURNING id, name, email, phone, admin_tier`,
      [adminId]
    );

    await connection.query('COMMIT');
    return { ok: true, admin: deletedRows?.[0] || null, adminTier: admin.admin_tier };
  } catch (error) {
    try {
      await connection.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to rollback admin delete:', rollbackError?.message || rollbackError);
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function getAdminAISettings(adminId) {
  const connection = await getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT ai_enabled, ai_prompt, ai_blocklist, automation_enabled
       FROM admins
       WHERE id = ?
       LIMIT 1`,
      [adminId]
    );
    return rows[0] || null;
  } finally {
    connection.release();
  }
}

export async function updateAdminAISettings(
  adminId,
  { ai_enabled, ai_prompt, ai_blocklist, automation_enabled }
) {
  const connection = await getConnection();
  try {
    const updates = [];
    const values = [];

    if (typeof ai_enabled === 'boolean') {
      updates.push('ai_enabled = ?');
      values.push(ai_enabled);
    }
    if (typeof ai_prompt === 'string') {
      updates.push('ai_prompt = ?');
      values.push(ai_prompt.trim() || null);
    }
    if (typeof ai_blocklist === 'string') {
      updates.push('ai_blocklist = ?');
      values.push(ai_blocklist.trim() || null);
    }
    if (typeof automation_enabled === 'boolean') {
      updates.push('automation_enabled = ?');
      values.push(automation_enabled);
    }

    if (updates.length === 0) {
      return await getAdminAISettings(adminId);
    }

    values.push(adminId);
    await connection.query(
      `UPDATE admins SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return await getAdminAISettings(adminId);
  } finally {
    connection.release();
  }
}

export async function updateAdminProfile(
  adminId,
  { name, email, business_category, business_type }
) {
  const connection = await getConnection();
  try {
    const updates = [];
    const values = [];
    if (typeof name === 'string') {
      const normalizedName = sanitizeNameUpper(name);
      if (normalizedName) {
        updates.push('name = ?');
        values.push(normalizedName);
      }
    }
    if (typeof email === 'string') {
      const normalizedEmail = sanitizeEmail(email);
      updates.push('email = ?');
      values.push(normalizedEmail);
    }
    if (typeof business_category === 'string') {
      const normalizedCategory = business_category.trim();
      updates.push('business_category = ?');
      values.push(normalizedCategory || null);
    }
    if (typeof business_type === 'string') {
      const normalizedType = business_type.trim().toLowerCase();
      if (ALLOWED_BUSINESS_TYPES.has(normalizedType)) {
        updates.push('business_type = ?');
        values.push(normalizedType);
      }
    }
    if (updates.length === 0) {
      return await getAdminById(adminId);
    }
    values.push(adminId);
    await connection.query(
      `UPDATE admins SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return await getAdminById(adminId);
  } finally {
    connection.release();
  }
}

export async function getLatestRequirementForUser(userId, adminId = null) {
  const connection = await getConnection();
  try {
    const params = [userId];
    let whereClause = 'WHERE r.user_id = ?';
    if (adminId) {
      whereClause += ' AND u.assigned_admin_id = ?';
      params.push(adminId);
    }
    const [rows] = await connection.query(
      `
        SELECT r.*
        FROM leads r
        LEFT JOIN contacts u ON r.user_id = u.id
        ${whereClause}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 1
      `,
      params
    );
    return rows[0] || null;
  } finally {
    connection.release();
  }
}

export async function createRequirementFromRecentMessages(userId, adminId = null) {
  const connection = await getConnection();
  try {
    const params = [userId];
    const whereParts = ['m.user_id = ?'];
    if (adminId) {
      whereParts.push('m.admin_id = ?');
      params.push(adminId);
    }
    const whereClause = `WHERE ${whereParts.join(' AND ')}`;
    const [messages] = await connection.query(
      `
        SELECT m.message_text, m.message_type, m.created_at
        FROM messages m
        ${whereClause}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 20
      `,
      params
    );

    if (!messages.length) return null;
    const ordered = [...messages].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );
    const incoming = ordered.filter((msg) => msg.message_type === 'incoming');
    const latestIncoming = incoming[incoming.length - 1];
    const fallbackLatest = ordered[ordered.length - 1];

    const reasonOfContacting = sanitizeText(
      latestIncoming?.message_text ||
      fallbackLatest?.message_text ||
      'Customer contacted for product/service information.',
      220
    );
    const summary = sanitizeText(
      [
        'Auto-generated lead summary from recent conversation.',
        ...ordered
          .slice(-12)
          .map(
            (msg) =>
              `${msg.message_type === 'incoming' ? 'Customer' : 'Business'}: ${sanitizeText(
                msg.message_text,
                280
              )}`
          ),
      ].join('\n'),
      4000
    );
    const category = sanitizeText(
      reasonOfContacting.split(/\s+/).slice(0, 6).join(' ') || 'General',
      120
    );

    const [rows] = await connection.query(
      `
        INSERT INTO leads (user_id, requirement_text, category, reason_of_contacting, status)
        VALUES (?, ?, ?, ?, 'pending')
        RETURNING *
      `,
      [userId, summary, category || 'General', reasonOfContacting || null]
    );
    return rows[0] || null;
  } finally {
    connection.release();
  }
}

function parseTemplateVariables(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

export async function getAllBroadcasts(
  adminId = null,
  { search = '', limit = 50, offset = 0 } = {}
) {
  const connection = await getConnection();
  try {
    const params = [];
    const whereParts = [];
    if (adminId) {
      whereParts.push('b.created_by = ?');
      params.push(adminId);
    }
    if (search) {
      const q = `%${search.toLowerCase()}%`;
      whereParts.push('(LOWER(b.title) LIKE ? OR LOWER(b.message) LIKE ?)');
      params.push(q, q);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [rows] = await connection.query(
      `
        SELECT b.*, a.name as created_by_name
        FROM broadcasts b
        LEFT JOIN admins a ON b.created_by = a.id
        ${whereClause}
        ORDER BY b.created_at DESC, b.id DESC
        LIMIT ?
        OFFSET ?
      `,
      [...params, limit, offset]
    );
    return rows;
  } finally {
    connection.release();
  }
}

export async function getBroadcastStats(adminId = null) {
  const connection = await getConnection();
  try {
    const params = [];
    let whereClause = '';
    if (adminId) {
      whereClause = 'WHERE created_by = ?';
      params.push(adminId);
    }
    const [rows] = await connection.query(
      `
        SELECT
          COUNT(*)::int as total_count,
          COALESCE(SUM(sent_count), 0)::int as total_sent,
          COALESCE(SUM(delivered_count), 0)::int as total_delivered,
          SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END)::int as scheduled_count
        FROM broadcasts
        ${whereClause}
      `,
      params
    );
    return rows[0] || {
      total_count: 0,
      total_sent: 0,
      total_delivered: 0,
      scheduled_count: 0,
    };
  } finally {
    connection.release();
  }
}

export async function getBroadcastById(broadcastId) {
  const connection = await getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT b.*, a.name as created_by_name
       FROM broadcasts b
       LEFT JOIN admins a ON b.created_by = a.id
       WHERE b.id = ?
       LIMIT 1`,
      [broadcastId]
    );
    return rows[0] || null;
  } finally {
    connection.release();
  }
}

export async function createBroadcast({
  title,
  message,
  targetAudienceType,
  scheduledAt,
  status,
  createdBy,
}) {
  const connection = await getConnection();
  try {
    const [rows] = await connection.query(
      `INSERT INTO broadcasts
       (title, message, target_audience_type, scheduled_at, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        title,
        message,
        targetAudienceType || 'all',
        scheduledAt || null,
        status || 'draft',
        createdBy || null,
      ]
    );
    return await getBroadcastById(rows[0]?.id);
  } finally {
    connection.release();
  }
}

export async function getAllTemplates(
  adminId = null,
  { search = '', limit = 50, offset = 0 } = {}
) {
  const connection = await getConnection();
  try {
    const params = [];
    const whereParts = [];
    if (adminId) {
      whereParts.push('t.created_by = ?');
      params.push(adminId);
    }
    if (search) {
      const q = `%${search.toLowerCase()}%`;
      whereParts.push('(LOWER(t.name) LIKE ? OR LOWER(t.category) LIKE ? OR LOWER(t.content) LIKE ?)');
      params.push(q, q, q);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [rows] = await connection.query(
      `
        SELECT t.*, a.name as created_by_name
        FROM templates t
        LEFT JOIN admins a ON t.created_by = a.id
        ${whereClause}
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT ?
        OFFSET ?
      `,
      [...params, limit, offset]
    );
    return rows.map((row) => ({
      ...row,
      variables: parseTemplateVariables(row.variables_json),
    }));
  } finally {
    connection.release();
  }
}

export async function getTemplateById(templateId) {
  const connection = await getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT t.*, a.name as created_by_name
       FROM templates t
       LEFT JOIN admins a ON t.created_by = a.id
       WHERE t.id = ?
       LIMIT 1`,
      [templateId]
    );
    const row = rows[0];
    if (!row) return null;
    return { ...row, variables: parseTemplateVariables(row.variables_json) };
  } finally {
    connection.release();
  }
}

export async function createTemplate({ name, category, content, variables, createdBy }) {
  const connection = await getConnection();
  try {
    const variablesJson = Array.isArray(variables) ? JSON.stringify(variables) : null;
    const [rows] = await connection.query(
      `INSERT INTO templates (name, category, content, variables_json, created_by)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id`,
      [name, category, content, variablesJson, createdBy || null]
    );
    return await getTemplateById(rows[0]?.id);
  } finally {
    connection.release();
  }
}

const parseCatalogKeywords = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;\n]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const serializeCatalogKeywords = (value) => {
  const keywords = parseCatalogKeywords(value);
  return keywords.length ? keywords.join(', ') : null;
};

const DURATION_UNIT_FACTORS = {
  minutes: 1,
  minute: 1,
  min: 1,
  mins: 1,
  hours: 60,
  hour: 60,
  hr: 60,
  hrs: 60,
  weeks: 60 * 24 * 7,
  week: 60 * 24 * 7,
  months: 60 * 24 * 30,
  month: 60 * 24 * 30,
};

const normalizeDurationUnit = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (['minutes', 'minute', 'min', 'mins'].includes(raw)) return 'minutes';
  if (['hours', 'hour', 'hr', 'hrs'].includes(raw)) return 'hours';
  if (['weeks', 'week'].includes(raw)) return 'weeks';
  if (['months', 'month'].includes(raw)) return 'months';
  return null;
};

const normalizePriceLabelInr = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.includes('₹')) {
    return text.replace(/₹\s*/g, '₹ ').replace(/\s{2,}/g, ' ').trim();
  }
  let normalized = text.replace(/^\s*(?:inr|rs\.?|rupees?)\s*/i, '₹ ');
  if (!normalized.includes('₹') && /^\d/.test(normalized)) {
    normalized = `₹ ${normalized}`;
  }
  return normalized.replace(/\s{2,}/g, ' ').trim();
};

const normalizeQuantityUnit = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, 40);
};

const parseFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export async function getCatalogItems(
  adminId,
  { type = 'all', status = 'all', search = '', limit = 200, offset = 0 } = {}
) {
  const connection = await getConnection();
  try {
    const params = [adminId];
    const whereParts = ['admin_id = ?'];
    if (type && type !== 'all') {
      whereParts.push('item_type = ?');
      params.push(type);
    }
    if (status && status !== 'all') {
      whereParts.push('is_active = ?');
      params.push(status === 'active');
    }
    if (search) {
      const q = `%${search.toLowerCase()}%`;
      whereParts.push(
        '(LOWER(name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(description) LIKE ?)'
      );
      params.push(q, q, q);
    }
    const whereClause = `WHERE ${whereParts.join(' AND ')}`;
    const [rows] = await connection.query(
      `
        SELECT *
        FROM catalog_items
        ${whereClause}
        ORDER BY sort_order ASC, name ASC, id ASC
        LIMIT ?
        OFFSET ?
      `,
      [...params, limit, offset]
    );
    return rows.map((row) => ({
      ...row,
      keywords: parseCatalogKeywords(row.keywords),
    }));
  } finally {
    connection.release();
  }
}

export async function getCatalogItemById(itemId, adminId) {
  const connection = await getConnection();
  try {
    const params = [itemId];
    let whereClause = 'WHERE id = ?';
    if (adminId) {
      whereClause += ' AND admin_id = ?';
      params.push(adminId);
    }
    const [rows] = await connection.query(
      `
        SELECT *
        FROM catalog_items
        ${whereClause}
        LIMIT 1
      `,
      params
    );
    const row = rows[0];
    if (!row) return null;
    return { ...row, keywords: parseCatalogKeywords(row.keywords) };
  } finally {
    connection.release();
  }
}

export async function createCatalogItem({
  adminId,
  item_type,
  name,
  category,
  description,
  price_label,
  duration_value,
  duration_unit,
  duration_minutes,
  quantity_value,
  quantity_unit,
  details_prompt,
  keywords,
  is_active,
  sort_order,
  is_bookable,
}) {
  const connection = await getConnection();
  try {
    const keywordsValue = serializeCatalogKeywords(keywords);
    const normalizedDurationUnit = normalizeDurationUnit(duration_unit) || null;
    const normalizedDurationValue = parseFiniteNumber(duration_value);
    const legacyDurationMinutes = parseFiniteNumber(duration_minutes);
    let computedDurationMinutes = null;
    let computedDurationValue = null;
    let computedDurationUnit = null;

    if (normalizedDurationValue !== null && normalizedDurationValue > 0) {
      const unit = normalizedDurationUnit || 'minutes';
      const factor = DURATION_UNIT_FACTORS[unit] || 1;
      computedDurationValue = normalizedDurationValue;
      computedDurationUnit = unit;
      computedDurationMinutes = Math.round(normalizedDurationValue * factor);
    } else if (legacyDurationMinutes !== null && legacyDurationMinutes > 0) {
      computedDurationValue = legacyDurationMinutes;
      computedDurationUnit = normalizedDurationUnit || 'minutes';
      computedDurationMinutes = Math.round(legacyDurationMinutes);
    }

    const parsedQuantityValue = parseFiniteNumber(quantity_value);
    const computedQuantityValue =
      item_type === 'product' && parsedQuantityValue !== null && parsedQuantityValue > 0
        ? parsedQuantityValue
        : null;
    const computedQuantityUnit =
      computedQuantityValue !== null ? normalizeQuantityUnit(quantity_unit) || 'unit' : null;

    const [rows] = await connection.query(
      `INSERT INTO catalog_items
       (admin_id, item_type, name, category, description, price_label, duration_value, duration_unit, duration_minutes, quantity_value, quantity_unit, details_prompt, keywords, is_active, sort_order, is_bookable)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        adminId,
        item_type,
        name,
        category || null,
        description || null,
        normalizePriceLabelInr(price_label),
        computedDurationValue,
        computedDurationUnit,
        computedDurationMinutes,
        computedQuantityValue,
        computedQuantityUnit,
        details_prompt || null,
        keywordsValue,
        typeof is_active === 'boolean' ? is_active : true,
        Number.isFinite(sort_order) ? sort_order : 0,
        typeof is_bookable === 'boolean' ? is_bookable : false,
      ]
    );
    return await getCatalogItemById(rows[0]?.id, adminId);
  } finally {
    connection.release();
  }
}

export async function updateCatalogItem(itemId, adminId, updates = {}) {
  const connection = await getConnection();
  try {
    const fields = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(updates, 'item_type')) {
      fields.push('item_type = ?');
      params.push(updates.item_type);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'category')) {
      fields.push('category = ?');
      params.push(updates.category || null);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'description')) {
      fields.push('description = ?');
      params.push(updates.description || null);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'price_label')) {
      fields.push('price_label = ?');
      params.push(normalizePriceLabelInr(updates.price_label));
    }

    const hasDurationValue = Object.prototype.hasOwnProperty.call(updates, 'duration_value');
    const hasDurationUnit = Object.prototype.hasOwnProperty.call(updates, 'duration_unit');
    const hasDurationMinutes = Object.prototype.hasOwnProperty.call(updates, 'duration_minutes');
    if (hasDurationValue || hasDurationUnit || hasDurationMinutes) {
      const normalizedDurationUnit = normalizeDurationUnit(updates.duration_unit);
      const parsedDurationValue = parseFiniteNumber(updates.duration_value);
      const parsedDurationMinutes = parseFiniteNumber(updates.duration_minutes);

      let computedDurationValue = null;
      let computedDurationUnit = null;
      let computedDurationMinutes = null;

      if (parsedDurationValue !== null && parsedDurationValue > 0) {
        computedDurationUnit = normalizedDurationUnit || 'minutes';
        computedDurationValue = parsedDurationValue;
        computedDurationMinutes = Math.round(
          parsedDurationValue * (DURATION_UNIT_FACTORS[computedDurationUnit] || 1)
        );
      } else if (parsedDurationMinutes !== null && parsedDurationMinutes > 0) {
        computedDurationUnit = normalizedDurationUnit || 'minutes';
        computedDurationValue = parsedDurationMinutes;
        computedDurationMinutes = Math.round(parsedDurationMinutes);
      }

      fields.push('duration_value = ?');
      params.push(computedDurationValue);
      fields.push('duration_unit = ?');
      params.push(computedDurationUnit);
      fields.push('duration_minutes = ?');
      params.push(computedDurationMinutes);
    }

    const hasQuantityValue = Object.prototype.hasOwnProperty.call(updates, 'quantity_value');
    const hasQuantityUnit = Object.prototype.hasOwnProperty.call(updates, 'quantity_unit');
    if (hasQuantityValue || hasQuantityUnit) {
      const parsedQuantityValue = parseFiniteNumber(updates.quantity_value);
      const computedQuantityValue = parsedQuantityValue !== null && parsedQuantityValue > 0
        ? parsedQuantityValue
        : null;
      const computedQuantityUnit =
        computedQuantityValue !== null ? normalizeQuantityUnit(updates.quantity_unit) || 'unit' : null;

      fields.push('quantity_value = ?');
      params.push(computedQuantityValue);
      fields.push('quantity_unit = ?');
      params.push(computedQuantityUnit);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'details_prompt')) {
      fields.push('details_prompt = ?');
      params.push(updates.details_prompt || null);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'keywords')) {
      fields.push('keywords = ?');
      params.push(serializeCatalogKeywords(updates.keywords));
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'is_active')) {
      fields.push('is_active = ?');
      params.push(Boolean(updates.is_active));
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'sort_order')) {
      const order = updates.sort_order;
      fields.push('sort_order = ?');
      params.push(Number.isFinite(order) ? order : 0);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'is_bookable')) {
      fields.push('is_bookable = ?');
      params.push(Boolean(updates.is_bookable));
    }

    if (fields.length === 0) {
      return await getCatalogItemById(itemId, adminId);
    }

    fields.push('updated_at = NOW()');
    params.push(itemId, adminId);

    await connection.query(
      `UPDATE catalog_items
       SET ${fields.join(', ')}
       WHERE id = ? AND admin_id = ?`,
      params
    );
    return await getCatalogItemById(itemId, adminId);
  } finally {
    connection.release();
  }
}

export async function deleteCatalogItem(itemId, adminId) {
  const connection = await getConnection();
  try {
    const [rows] = await connection.query(
      `DELETE FROM catalog_items
       WHERE id = ? AND admin_id = ?
       RETURNING id`,
      [itemId, adminId]
    );
    return rows[0] || null;
  } finally {
    connection.release();
  }
}

export async function getReportOverview(startDate, adminId = null) {
  const connection = await getConnection();
  try {
    const messageParams = [startDate];
    let messageWhere = "WHERE created_at >= ? AND message_type = 'incoming'";
    if (adminId) {
      messageWhere += ' AND admin_id = ?';
      messageParams.push(adminId);
    }
    const [messageStats] = await connection.query(
      `
        SELECT date_trunc('day', created_at) as date, COUNT(*) as count
        FROM messages
        ${messageWhere}
        GROUP BY date_trunc('day', created_at)
        ORDER BY date_trunc('day', created_at)
      `,
      messageParams
    );

    const totalParams = [];
    let totalWhere = "WHERE message_type = 'incoming'";
    if (adminId) {
      totalWhere += ' AND admin_id = ?';
      totalParams.push(adminId);
    }
    const [totalRows] = await connection.query(
      `
        SELECT COUNT(*) as count
        FROM messages
        ${totalWhere}
      `,
      totalParams
    );
    const totalMessages = Number(totalRows?.[0]?.count || 0);

    if (adminId) {
      const [leadStats] = await connection.query(
        `
          SELECT r.status, COUNT(*) as count
          FROM leads r
          JOIN contacts u ON r.user_id = u.id
          WHERE u.assigned_admin_id = ?
          GROUP BY r.status
        `,
        [adminId]
      );
      const [contactRows] = await connection.query(
        `
          SELECT COUNT(*) as count
          FROM contacts
          WHERE assigned_admin_id = ?
        `,
        [adminId]
      );
      const totalContacts = Number(contactRows?.[0]?.count || 0);

      const [agentPerformance] = await connection.query(
        `
          SELECT
            a.id,
            a.name,
            a.admin_tier,
            a.status,
            SUM(CASE WHEN m.message_type = 'outgoing' THEN 1 ELSE 0 END) AS messages_sent,
            COUNT(DISTINCT CASE
              WHEN m.created_at >= (NOW() - INTERVAL '7 days') THEN m.user_id
              ELSE NULL
            END) AS active_chats
          FROM admins a
          LEFT JOIN messages m ON m.admin_id = a.id
          WHERE a.id = ?
          GROUP BY a.id, a.name, a.admin_tier, a.status
        `,
        [adminId]
      );

      const [topCampaigns] = await connection.query(
        `
          SELECT id, title, status, sent_count, delivered_count, created_at
          FROM broadcasts
          WHERE created_by = ?
          ORDER BY sent_count DESC, created_at DESC
          LIMIT 5
        `,
        [adminId]
      );

      return {
        messageStats,
        totalMessages,
        leadStats,
        totalContacts,
        agentPerformance,
        topCampaigns,
        revenueSources: [],
      };
    }

    const [leadStats] = await connection.query(
      `
        SELECT status, COUNT(*) as count
        FROM leads
        GROUP BY status
      `
    );
    const [contactRows] = await connection.query(
      `
        SELECT COUNT(*) as count
        FROM contacts
      `
    );
    const totalContacts = Number(contactRows?.[0]?.count || 0);

    const [agentPerformance] = await connection.query(`
      SELECT
        a.id,
        a.name,
        a.admin_tier,
        a.status,
        SUM(CASE WHEN m.message_type = 'outgoing' THEN 1 ELSE 0 END) AS messages_sent,
        COUNT(DISTINCT CASE
          WHEN m.created_at >= (NOW() - INTERVAL '7 days') THEN m.user_id
          ELSE NULL
        END) AS active_chats
      FROM admins a
      LEFT JOIN messages m ON m.admin_id = a.id
      GROUP BY a.id, a.name, a.admin_tier, a.status, a.created_at
      ORDER BY a.created_at DESC
    `);

    const [topCampaigns] = await connection.query(`
      SELECT id, title, status, sent_count, delivered_count, created_at
      FROM broadcasts
      ORDER BY sent_count DESC, created_at DESC
      LIMIT 5
    `);

    return {
      messageStats,
      totalMessages,
      leadStats,
      totalContacts,
      agentPerformance,
      topCampaigns,
      revenueSources: [],
    };
  } finally {
    connection.release();
  }
}
