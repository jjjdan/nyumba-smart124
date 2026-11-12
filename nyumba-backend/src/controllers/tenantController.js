const { query, withTransaction } = require('../config/database');
const { createError } = require('../middleware/errorHandler');

async function archiveTenant(req, res, next) {
  try {
    const { id } = req.params;
    const result = await withTransaction(async (client) => {
      const tenant = await client.query(
        `SELECT t.id, t.user_id, t.property_id FROM tenants t
         LEFT JOIN properties p ON p.id = t.property_id
         LEFT JOIN landlords l ON l.id = p.landlord_id
         WHERE (t.id = $1 OR t.user_id = $1)
           AND ($2 = 'admin' OR l.user_id = $3) FOR UPDATE`, [id, req.user.role, req.user.id]
      );
      if (!tenant.rows.length) throw createError('Tenant not found', 404);
      const row = tenant.rows[0];
      await client.query(
        `UPDATE tenants SET is_archived = TRUE, archived_at = NOW(), archived_by = $1,
         unlinked_at = CASE WHEN property_id IS NOT NULL THEN NOW() ELSE unlinked_at END,
         unlinked_by = CASE WHEN property_id IS NOT NULL THEN $1 ELSE unlinked_by END,
         property_id = NULL WHERE id = $2`, [req.user.id, row.id]
      );
      if (row.property_id) {
        await client.query(
          `UPDATE properties SET tenant_user_id = NULL, status = 'Vacant'
           WHERE id = $1 AND tenant_user_id = $2`, [row.property_id, row.user_id]
        );
      }
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
         VALUES ($1, 'TENANT_ARCHIVED', 'tenant', $2, $3)`,
        [req.user.id, row.id, JSON.stringify({ unlinked: Boolean(row.property_id) })]
      );
      return row;
    });
    res.json({ message: 'Tenant archived and unlinked', tenantId: result.id });
  } catch (err) { next(err); }
}

async function unlinkTenant(req, res, next) {
  try {
    const { id } = req.params;
    const result = await withTransaction(async (client) => {
      const tenant = await client.query(
        `SELECT t.id, t.user_id, t.property_id FROM tenants t
         LEFT JOIN properties p ON p.id = t.property_id
         LEFT JOIN landlords l ON l.id = p.landlord_id
         WHERE (t.id = $1 OR t.user_id = $1)
           AND ($2 = 'admin' OR l.user_id = $3) FOR UPDATE`, [id, req.user.role, req.user.id]
      );
      if (!tenant.rows.length) throw createError('Tenant not found', 404);
      const row = tenant.rows[0];
      await client.query(
        `UPDATE tenants SET property_id = NULL, unlinked_at = NOW(), unlinked_by = $1 WHERE id = $2`,
        [req.user.id, row.id]
      );
      if (row.property_id) await client.query(
        `UPDATE properties SET tenant_user_id = NULL, status = 'Vacant'
         WHERE id = $1 AND tenant_user_id = $2`, [row.property_id, row.user_id]
      );
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id)
         VALUES ($1, 'TENANT_UNLINKED', 'tenant', $2)`, [req.user.id, row.id]
      );
      return row;
    });
    res.json({ message: 'Tenant unlinked; history preserved', tenantId: result.id });
  } catch (err) { next(err); }
}

module.exports = { archiveTenant, unlinkTenant };
