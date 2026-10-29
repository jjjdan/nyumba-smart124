const { query, withTransaction } = require('../config/database');
const { createError } = require('../middleware/errorHandler');

/**
 * GET /api/complaints
 */
async function listComplaints(req, res, next) {
  try {
    const { user } = req;
    const { status, priority, limit = 50, offset = 0 } = req.query;

    let baseWhere = '';
    const params = [];
    let idx = 1;

    const conditions = [];

    if (user.role === 'landlord') {
      conditions.push(
        `c.property_id IN (
           SELECT p.id FROM properties p
           JOIN landlords l ON l.id = p.landlord_id
           WHERE l.user_id = $${idx++}
         )`
      );
      params.push(user.id);
    } else if (user.role === 'tenant') {
      conditions.push(
        `c.raised_by_id = $${idx++}`
      );
      params.push(user.id);
    }

    if (status) {
      conditions.push(`c.status = $${idx++}`);
      params.push(status);
    }
    if (priority) {
      conditions.push(`c.priority = $${idx++}`);
      params.push(priority);
    }

    if (conditions.length) {
      baseWhere = 'WHERE ' + conditions.join(' AND ');
    }

    params.push(limit, offset);

    const result = await query(
      `SELECT c.*
       FROM complaints c
       ${baseWhere}
       ORDER BY
         CASE c.priority WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
         c.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    res.json({ complaints: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/complaints
 */
async function createComplaint(req, res, next) {
  try {
    const {
      propertyId, title, description,
      category, priority = 'Medium',
      offlineRecord = false, deviceId
    } = req.body;
    const { user } = req;

    // Validate property
    const propRes = await query(
      `SELECT name FROM properties WHERE id = $1 AND is_active = TRUE`,
      [propertyId]
    );
    if (!propRes.rows.length) throw createError('Property not found', 404);

    const result = await query(
      `INSERT INTO complaints
         (property_id, property_name, title, description, category, priority,
          status, raised_by_id, raised_by_name, is_offline_record, device_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'Received', $7, $8, $9, $10)
       RETURNING *`,
      [
        propertyId,
        propRes.rows[0].name,
        title,
        description,
        category,
        priority,
        user.id,
        user.name,
        offlineRecord,
        deviceId || null,
      ]
    );

    res.status(201).json({ complaint: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/complaints/:id
 * Landlord or admin can update status.
 */
async function updateComplaint(req, res, next) {
  try {
    const { id } = req.params;
    const { status, priority } = req.body;
    const { user } = req;

    // Verify landlord owns the property this complaint belongs to
    if (user.role === 'landlord') {
      const check = await query(
        `SELECT c.id FROM complaints c
         JOIN properties p ON p.id = c.property_id
         JOIN landlords l ON l.id = p.landlord_id
         WHERE c.id = $1 AND l.user_id = $2`,
        [id, user.id]
      );
      if (!check.rows.length) throw createError('Complaint not found or access denied', 404);
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (status) {
      fields.push(`status = $${idx++}`);
      values.push(status);
      if (status === 'Settled') {
        fields.push(`resolved_by = $${idx++}`, `resolved_at = NOW()`);
        values.push(user.id);
      }
    }
    if (priority) {
      fields.push(`priority = $${idx++}`);
      values.push(priority);
    }

    if (!fields.length) throw createError('Nothing to update', 400);

    values.push(id);
    const result = await query(
      `UPDATE complaints SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (!result.rows.length) throw createError('Complaint not found', 404);

    res.json({ complaint: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/complaints/sync
 * Bulk-upload offline complaints.
 */
async function syncOfflineComplaints(req, res, next) {
  try {
    const { complaints } = req.body;
    if (!Array.isArray(complaints) || !complaints.length) {
      throw createError('No offline complaints provided', 400);
    }

    const results = { synced: [], failed: [] };

    for (const c of complaints) {
      try {
        const propRes = await query(
          `SELECT name FROM properties WHERE id = $1`,
          [c.propertyId]
        );

        await query(
          `INSERT INTO complaints
             (property_id, property_name, title, description, category, priority,
              status, raised_by_id, raised_by_name, is_offline_record, device_id, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'Received', $7, $8, TRUE, $9, NOW())`,
          [
            c.propertyId,
            propRes.rows[0]?.name || c.propertyName,
            c.title,
            c.description,
            c.category,
            c.priority || 'Medium',
            req.user.id,
            req.user.name,
            c.deviceId || null,
          ]
        );
        results.synced.push({ localId: c.localId });
      } catch (err) {
        results.failed.push({ localId: c.localId, error: err.message });
      }
    }

    res.json({
      message: `Synced ${results.synced.length} complaints, ${results.failed.length} failed`,
      ...results,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listComplaints, createComplaint, updateComplaint, syncOfflineComplaints };
