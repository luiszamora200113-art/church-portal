const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const CAN_MANAGE = ['admin', 'superadmin', 'secretary'];
const VALID_TYPES = ['bautismo', 'presentacion'];

// GET /api/records?type=bautismo -> lista de registros (secretaría/admin)
router.get('/', requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const { type } = req.query;
  const params = [];
  let where = '1=1';
  if (type) {
    params.push(type);
    where += ` AND type = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT r.*, u.full_name AS registered_by_name
     FROM church_records r LEFT JOIN users u ON u.id = r.registered_by
     WHERE ${where} ORDER BY r.record_date DESC NULLS LAST, r.created_at DESC`,
    params
  );
  res.json(rows);
});

// POST /api/records -> crear un registro nuevo (secretaría/admin)
router.post('/', requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const { type, full_name, record_date, officiant, notes } = req.body;
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `Tipo inválido. Usa uno de: ${VALID_TYPES.join(', ')}` });
  }
  if (!full_name) return res.status(400).json({ error: 'El nombre completo es requerido.' });

  const { rows } = await pool.query(
    `INSERT INTO church_records (type, full_name, record_date, officiant, notes, registered_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [type, full_name, record_date || null, officiant || null, notes || null, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/records/:id -> corregir un registro (secretaría/admin)
router.patch('/:id', requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const { full_name, record_date, officiant, notes } = req.body;
  if (!full_name) return res.status(400).json({ error: 'El nombre completo es requerido.' });

  const { rows } = await pool.query(
    `UPDATE church_records SET full_name = $1, record_date = $2, officiant = $3, notes = $4
     WHERE id = $5 RETURNING *`,
    [full_name, record_date || null, officiant || null, notes || null, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado.' });
  res.json(rows[0]);
});

// DELETE /api/records/:id -> borrar un registro hecho por error (secretaría/admin)
router.delete('/:id', requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM church_records WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Registro no encontrado.' });
  res.json({ ok: true });
});

module.exports = router;
