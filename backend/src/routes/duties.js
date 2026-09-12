const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/duties/mine -> lista de deberes con el estado del usuario autenticado
router.get('/mine', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.title, d.description,
            COALESCE(ud.status, 'pending') AS status,
            ud.completed_at
     FROM duties d
     LEFT JOIN user_duties ud ON ud.duty_id = d.id AND ud.user_id = $1
     ORDER BY d.created_at`,
    [req.user.id]
  );
  res.json(rows);
});

// PATCH /api/duties/:id/toggle -> marcar/desmarcar un deber como cumplido
router.patch('/:id/toggle', requireAuth, async (req, res) => {
  const dutyId = req.params.id;

  const { rows: existing } = await pool.query(
    'SELECT * FROM user_duties WHERE user_id = $1 AND duty_id = $2',
    [req.user.id, dutyId]
  );

  if (existing.length === 0) {
    await pool.query(
      `INSERT INTO user_duties (user_id, duty_id, status, completed_at)
       VALUES ($1, $2, 'done', NOW())`,
      [req.user.id, dutyId]
    );
    return res.json({ status: 'done' });
  }

  const newStatus = existing[0].status === 'done' ? 'pending' : 'done';
  await pool.query(
    `UPDATE user_duties SET status = $1, completed_at = $2 WHERE user_id = $3 AND duty_id = $4`,
    [newStatus, newStatus === 'done' ? new Date() : null, req.user.id, dutyId]
  );
  res.json({ status: newStatus });
});

// POST /api/duties -> crear un nuevo deber (solo admin/superadmin)
router.post('/', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'El título del deber es requerido.' });

  const { rows } = await pool.query(
    'INSERT INTO duties (title, description) VALUES ($1, $2) RETURNING *',
    [title, description || null]
  );
  res.status(201).json(rows[0]);
});

// GET /api/duties/progress -> resumen de cumplimiento por miembro (solo admin, para el panel)
router.get('/progress', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id AS user_id, u.full_name,
      COUNT(d.id) AS total_duties,
      COUNT(ud.id) FILTER (WHERE ud.status = 'done') AS completed
    FROM users u
    CROSS JOIN duties d
    LEFT JOIN user_duties ud ON ud.user_id = u.id AND ud.duty_id = d.id
    WHERE u.role = 'member'
    GROUP BY u.id, u.full_name
    ORDER BY u.full_name
  `);
  res.json(rows);
});

module.exports = router;
