const { query } = require('../config/database');
const { createError } = require('../middleware/errorHandler');

async function createNotification(req, res, next) {
  try {
    const { userId, type = 'general', title, message, data = {} } = req.body;
    const result = await query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, type, title, message, data]);
    res.status(201).json({ notification: result.rows[0] });
  } catch (err) { next(err); }
}

async function listNotifications(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.user.id, limit]);
    res.json({ notifications: result.rows });
  } catch (err) { next(err); }
}

async function markRead(req, res, next) {
  try {
    const result = await query(
      `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND user_id = $2 RETURNING *`, [req.params.id, req.user.id]);
    if (!result.rows.length) throw createError('Notification not found', 404);
    res.json({ notification: result.rows[0] });
  } catch (err) { next(err); }
}

async function markAllRead(req, res, next) {
  try {
    const result = await query(
      `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
      [req.user.id]);
    res.json({ updated: result.rowCount });
  } catch (err) { next(err); }
}

module.exports = { createNotification, listNotifications, markRead, markAllRead };
