const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const currentMonth = () => new Date().toISOString().slice(0, 7) + '-01';

// GET /api/tithe/mine -> ¿ya confirmé mi diezmo este mes?
router.get('/mine', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id FROM tithe_confirmations WHERE user_id = $1 AND month = $2',
    [req.user.id, currentMonth()]
  );
  res.json({ confirmed: rows.length > 0 });
});

// PATCH /api/tithe/toggle -> marcar/desmarcar el diezmo del mes en curso
router.patch('/toggle', requireAuth, async (req, res) => {
  const month = currentMonth();
  const { rows } = await pool.query(
    'SELECT id FROM tithe_confirmations WHERE user_id = $1 AND month = $2',
    [req.user.id, month]
  );

  if (rows.length > 0) {
    await pool.query('DELETE FROM tithe_confirmations WHERE id = $1', [rows[0].id]);
    return res.json({ confirmed: false });
  }

  await pool.query(
    'INSERT INTO tithe_confirmations (user_id, month) VALUES ($1, $2)',
    [req.user.id, month]
  );
  res.json({ confirmed: true });
});

// GET /api/tithe/status -> lista de miembros con su estado del mes (solo admin/superadmin)
// Nunca incluye montos ni salario, solo nombre y si confirmó o no.
router.get('/status', requireAuth, requireRole('admin', 'superadmin', 'finance'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.full_name,
            (tc.id IS NOT NULL) AS confirmed
     FROM users u
     LEFT JOIN tithe_confirmations tc
       ON tc.user_id = u.id AND tc.month = $1
     WHERE u.role = 'member'
     ORDER BY u.full_name`,
    [currentMonth()]
  );
  res.json(rows);
});

module.exports = router;
