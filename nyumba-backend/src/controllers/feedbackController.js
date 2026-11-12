const { query } = require('../config/database');
const { createError } = require('../middleware/errorHandler');

async function submitFeedback(req, res, next) {
  try {
    const { subject, message } = req.body;
    const result = await query(
      `INSERT INTO feedback (user_id, subject, message) VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, subject, message]);
    res.status(201).json({ feedback: result.rows[0] });
  } catch (err) { next(err); }
}

async function listFeedback(req, res, next) {
  try {
    const isAdmin = req.user.role === 'admin';
    const result = await query(
      `SELECT f.*, u.name AS user_name,
        COALESCE(json_agg(json_build_object('id', r.id, 'message', r.message,
          'userId', r.user_id, 'createdAt', r.created_at) ORDER BY r.created_at)
          FILTER (WHERE r.id IS NOT NULL), '[]') AS replies
       FROM feedback f LEFT JOIN users u ON u.id = f.user_id
       LEFT JOIN feedback_replies r ON r.feedback_id = f.id
       WHERE ${isAdmin ? 'TRUE' : 'f.user_id = $1'}
       GROUP BY f.id, u.name ORDER BY f.created_at DESC`,
      isAdmin ? [] : [req.user.id]);
    res.json({ feedback: result.rows });
  } catch (err) { next(err); }
}

async function replyFeedback(req, res, next) {
  try {
    const result = await query(
      `INSERT INTO feedback_replies (feedback_id, user_id, message)
       SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM feedback WHERE id = $1)
       RETURNING *`, [req.params.id, req.user.id, req.body.message]);
    if (!result.rows.length) throw createError('Feedback not found', 404);
    await query(`UPDATE feedback SET status = 'in_progress' WHERE id = $1 AND status <> 'resolved'`, [req.params.id]);
    res.status(201).json({ reply: result.rows[0] });
  } catch (err) { next(err); }
}

async function resolveFeedback(req, res, next) {
  try {
    const result = await query(
      `UPDATE feedback SET status = 'resolved', resolved_at = NOW(), resolved_by = $1
       WHERE id = $2 RETURNING *`, [req.user.id, req.params.id]);
    if (!result.rows.length) throw createError('Feedback not found', 404);
    res.json({ feedback: result.rows[0] });
  } catch (err) { next(err); }
}

module.exports = { submitFeedback, listFeedback, replyFeedback, resolveFeedback };
