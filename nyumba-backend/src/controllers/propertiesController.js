const { query, withTransaction } = require('../config/database');
const { createError } = require('../middleware/errorHandler');

/**
 * GET /api/properties
 * Landlord sees their own; admin sees all; tenant sees their unit.
 */
async function listProperties(req, res, next) {
  try {
    const { user } = req;
    let rows;

    if (user.role === 'admin') {
      const result = await query(
        `SELECT p.*, u.name as landlord_name, u.phone as landlord_phone
         FROM properties p
         JOIN landlords l ON l.id = p.landlord_id
         JOIN users u ON u.id = l.user_id
         WHERE p.is_active = TRUE
         ORDER BY p.created_at DESC`
      );
      rows = result.rows;

    } else if (user.role === 'landlord') {
      const result = await query(
        `SELECT p.*
         FROM properties p
         JOIN landlords l ON l.id = p.landlord_id AND l.user_id = $1
         WHERE p.is_active = TRUE
         ORDER BY p.created_at DESC`,
        [user.id]
      );
      rows = result.rows;

    } else {
      // Tenant — single property
      const result = await query(
        `SELECT p.*
         FROM properties p
         JOIN tenants t ON t.property_id = p.id AND t.user_id = $1
         WHERE p.is_active = TRUE`,
        [user.id]
      );
      rows = result.rows;
    }

    res.json({ properties: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/properties/:id
 */
async function getProperty(req, res, next) {
  try {
    const { id } = req.params;
    const { user } = req;

    const result = await query(
      `SELECT p.*
       FROM properties p
       WHERE p.id = $1 AND p.is_active = TRUE`,
      [id]
    );

    if (!result.rows.length) throw createError('Property not found', 404);
    const prop = result.rows[0];

    // Access control: tenant can only see their own property
    if (user.role === 'tenant') {
      const tenantCheck = await query(
        `SELECT id FROM tenants WHERE user_id = $1 AND property_id = $2`,
        [user.id, id]
      );
      if (!tenantCheck.rows.length) throw createError('Access denied', 403);
    }

    // Landlord can only see their own properties
    if (user.role === 'landlord') {
      const landlordCheck = await query(
        `SELECT l.id FROM landlords l
         JOIN properties p ON p.landlord_id = l.id
         WHERE l.user_id = $1 AND p.id = $2`,
        [user.id, id]
      );
      if (!landlordCheck.rows.length) throw createError('Access denied', 403);
    }

    res.json({ property: prop });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/properties
 * Landlord only.
 */
async function createProperty(req, res, next) {
  try {
    const { name, address, tenantName, tenantPhone, monthlyRent } = req.body;
    const { user } = req;

    const landlordRes = await query(
      `SELECT id, landlord_code, units_count FROM landlords WHERE user_id = $1`,
      [user.id]
    );
    if (!landlordRes.rows.length) throw createError('Landlord profile not found', 404);
    const landlord = landlordRes.rows[0];

    const result = await withTransaction(async (client) => {
      // Insert property
      const propRes = await client.query(
        `INSERT INTO properties
           (landlord_id, landlord_code, name, address, tenant_name, tenant_phone, monthly_rent, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Overdue')
         RETURNING *`,
        [
          landlord.id, landlord.landlord_code,
          name, address,
          tenantName || null,
          (tenantPhone || '').replace(/\s+/g, '') || null,
          parseInt(monthlyRent, 10)
        ]
      );
      const property = propRes.rows[0];

      // Update units count on landlord row
      await client.query(
        `UPDATE landlords SET units_count = units_count + 1 WHERE id = $1`,
        [landlord.id]
      );

      // Re-evaluate subscription tier
      await client.query(
        `UPDATE landlords l
         SET subscription_id = (
           SELECT id FROM subscription_tiers
           WHERE min_units <= (l.units_count + 1)
             AND max_units >= (l.units_count + 1)
           LIMIT 1
         )
         WHERE id = $1`,
        [landlord.id]
      );

      return property;
    });

    await query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id)
       VALUES ($1, 'CREATE_PROPERTY', 'properties', $2)`,
      [user.id, result.id]
    );

    res.status(201).json({ property: result });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/properties/:id
 * Landlord can update their own property.
 */
async function updateProperty(req, res, next) {
  try {
    const { id } = req.params;
    const { name, address, tenantName, tenantPhone, monthlyRent, status } = req.body;
    const { user } = req;

    // Verify ownership
    const check = await query(
      `SELECT p.id FROM properties p
       JOIN landlords l ON l.id = p.landlord_id
       WHERE p.id = $1 AND l.user_id = $2 AND p.is_active = TRUE`,
      [id, user.id]
    );
    if (!check.rows.length && user.role !== 'admin') {
      throw createError('Property not found or access denied', 404);
    }

    const updateFields = [];
    const values = [];
    let paramIdx = 1;

    if (name !== undefined)        { updateFields.push(`name = $${paramIdx++}`);         values.push(name); }
    if (address !== undefined)     { updateFields.push(`address = $${paramIdx++}`);       values.push(address); }
    if (tenantName !== undefined)  { updateFields.push(`tenant_name = $${paramIdx++}`);   values.push(tenantName); }
    if (tenantPhone !== undefined) { updateFields.push(`tenant_phone = $${paramIdx++}`);  values.push(tenantPhone.replace(/\s+/g, '')); }
    if (monthlyRent !== undefined) { updateFields.push(`monthly_rent = $${paramIdx++}`);  values.push(parseInt(monthlyRent, 10)); }
    if (status !== undefined)      { updateFields.push(`status = $${paramIdx++}`);        values.push(status); }

    if (!updateFields.length) throw createError('No fields to update', 400);

    values.push(id);
    const result = await query(
      `UPDATE properties SET ${updateFields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );

    res.json({ property: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/properties/:id
 * Soft delete — sets is_active = false.
 */
async function deleteProperty(req, res, next) {
  try {
    const { id } = req.params;
    const { user } = req;

    const check = await query(
      `SELECT p.id FROM properties p
       JOIN landlords l ON l.id = p.landlord_id
       WHERE p.id = $1 AND l.user_id = $2 AND p.is_active = TRUE`,
      [id, user.id]
    );
    if (!check.rows.length && user.role !== 'admin') {
      throw createError('Property not found or access denied', 404);
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE properties SET is_active = FALSE WHERE id = $1`,
        [id]
      );
      await client.query(
        `UPDATE landlords l SET units_count = GREATEST(units_count - 1, 0)
         FROM properties p WHERE p.id = $1 AND p.landlord_id = l.id`,
        [id]
      );
    });

    res.json({ message: 'Property removed from your portfolio' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listProperties, getProperty, createProperty, updateProperty, deleteProperty };
