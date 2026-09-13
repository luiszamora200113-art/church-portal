const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/church-info -> info general + líderes (cualquier miembro autenticado)
router.get('/', requireAuth, async (req, res) => {
  const { rows: infoRows } = await pool.query('SELECT * FROM church_info WHERE id = 1');
  const { rows: leaders } = await pool.query('SELECT * FROM church_leaders ORDER BY order_index, id');
  res.json({ info: infoRows[0] || {}, leaders });
});

// PUT /api/church-info -> actualizar la info general (solo superadmin)
router.put('/', requireAuth, requireRole('superadmin'), async (req, res) => {
  const { vision, mission, address, schedule_info, facebook, instagram, whatsapp, contact_phone, contact_email } = req.body;
  const { rows } = await pool.query(
    `UPDATE church_info SET
       vision = $1, mission = $2, address = $3, schedule_info = $4,
       facebook = $5, instagram = $6, whatsapp = $7, contact_phone = $8, contact_email = $9,
       updated_at = NOW()
     WHERE id = 1 RETURNING *`,
    [vision || null, mission || null, address || null, schedule_info || null, facebook || null, instagram || null, whatsapp || null, contact_phone || null, contact_email || null]
  );
  res.json(rows[0]);
});

// POST /api/church-info/leaders -> agregar un líder (solo superadmin)
router.post('/leaders', requireAuth, requireRole('superadmin'), async (req, res) => {
  const { full_name, role_title, photo_data, order_index } = req.body;
  if (!full_name || !role_title) return res.status(400).json({ error: 'Nombre y cargo son requeridos.' });
  const { rows } = await pool.query(
    `INSERT INTO church_leaders (full_name, role_title, photo_data, order_index) VALUES ($1, $2, $3, $4) RETURNING *`,
    [full_name, role_title, photo_data || null, order_index || 0]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/church-info/leaders/:id -> editar un líder (solo superadmin)
router.put('/leaders/:id', requireAuth, requireRole('superadmin'), async (req, res) => {
  const { full_name, role_title, photo_data, order_index } = req.body;
  const { rows } = await pool.query(
    `UPDATE church_leaders SET full_name = $1, role_title = $2, photo_data = $3, order_index = $4 WHERE id = $5 RETURNING *`,
    [full_name, role_title, photo_data || null, order_index || 0, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'No encontrado.' });
  res.json(rows[0]);
});

// DELETE /api/church-info/leaders/:id -> quitar un líder (solo superadmin)
router.delete('/leaders/:id', requireAuth, requireRole('superadmin'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM church_leaders WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'No encontrado.' });
  res.json({ ok: true });
});

module.exports = router;
