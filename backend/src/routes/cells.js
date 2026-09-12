const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/cells -> lista todas las células (para selector y panel admin)
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT c.*, u.full_name AS leader_name,
      (SELECT COUNT(*) FROM users m WHERE m.cell_id = c.id) AS member_count
    FROM cells c
    LEFT JOIN users u ON u.id = c.leader_id
    ORDER BY c.name
  `);
  res.json(rows);
});

// GET /api/cells/mine -> la célula del usuario autenticado, con sus miembros
router.get('/mine', requireAuth, async (req, res) => {
  const { rows: userRows } = await pool.query('SELECT cell_id FROM users WHERE id = $1', [req.user.id]);
  const cellId = userRows[0]?.cell_id;

  if (!cellId) {
    return res.json({ cell: null, members: [] });
  }

  const { rows: cellRows } = await pool.query(
    `SELECT c.*, u.full_name AS leader_name
     FROM cells c LEFT JOIN users u ON u.id = c.leader_id
     WHERE c.id = $1`,
    [cellId]
  );
  const { rows: members } = await pool.query(
    'SELECT id, full_name, role FROM users WHERE cell_id = $1 ORDER BY full_name',
    [cellId]
  );

  res.json({ cell: cellRows[0], members });
});

// POST /api/cells -> crear célula (solo admin/superadmin)
router.post('/', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { name, leader_id, meeting_day, meeting_time, location } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre de la célula es requerido.' });

  const { rows } = await pool.query(
    `INSERT INTO cells (name, leader_id, meeting_day, meeting_time, location)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, leader_id || null, meeting_day || null, meeting_time || null, location || null]
  );
  res.status(201).json(rows[0]);
});

// GET /api/cells/roster -> solo id + nombre de cuentas activas, para selectores "elegir miembro" en formularios.
// Accesible a cualquier miembro autenticado (no expone teléfono, célula ni rol).
router.get('/roster', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, full_name FROM users WHERE is_active = true ORDER BY full_name`
  );
  res.json(rows);
});

// GET /api/cells/members-overview -> lista de miembros con su célula actual (solo admin, para reasignar)
router.get('/members-overview', requireAuth, requireRole('admin', 'superadmin', 'secretary'), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.full_name, u.phone, u.is_active, u.role, u.cell_id, c.name AS cell_name
    FROM users u
    LEFT JOIN cells c ON c.id = u.cell_id
    WHERE u.role IN ('member', 'finance', 'secretary', 'education')
    ORDER BY u.full_name
  `);
  res.json(rows);
});

// PATCH /api/cells/:id/assign -> un admin asigna o reasigna a un miembro a una célula específica.
// La célula se asigna al crear el usuario y, después, solo un admin puede cambiarla (no es autoservicio).
router.patch('/:id/assign', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id es requerido.' });

  await pool.query('UPDATE users SET cell_id = $1 WHERE id = $2', [req.params.id, user_id]);
  res.json({ ok: true });
});

// PATCH /api/cells/:id -> editar una célula existente: líder, día, hora, lugar (solo admin/superadmin)
router.patch('/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { leader_id, meeting_day, meeting_time, location } = req.body;
  const { rows } = await pool.query(
    `UPDATE cells SET leader_id = $1, meeting_day = $2, meeting_time = $3, location = $4
     WHERE id = $5 RETURNING *`,
    [leader_id || null, meeting_day || null, meeting_time || null, location || null, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Célula no encontrada.' });
  res.json(rows[0]);
});

module.exports = router;
