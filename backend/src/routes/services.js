const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/services -> servicios activos + próximas cancelaciones (cualquier miembro autenticado)
router.get('/', requireAuth, async (req, res) => {
  const { rows: services } = await pool.query(
    'SELECT * FROM church_services WHERE active = true ORDER BY day_of_week, order_index'
  );
  const { rows: cancellations } = await pool.query(
    'SELECT * FROM service_cancellations WHERE cancel_date >= CURRENT_DATE ORDER BY cancel_date'
  );
  res.json({ services, cancellations });
});

// GET /api/services/all -> todos (incluye inactivos) + todas las cancelaciones (admin, para administrarlos)
router.get('/all', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { rows: services } = await pool.query('SELECT * FROM church_services ORDER BY day_of_week, order_index');
  const { rows: cancellations } = await pool.query(
    `SELECT sc.*, s.name AS service_name FROM service_cancellations sc
     JOIN church_services s ON s.id = sc.service_id
     WHERE sc.cancel_date >= CURRENT_DATE ORDER BY sc.cancel_date`
  );
  res.json({ services, cancellations });
});

// POST /api/services -> crear un servicio recurrente nuevo (admin/superadmin)
router.post('/', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { name, day_of_week, time_label, location, icon } = req.body;
  if (!name || day_of_week === undefined || !time_label) {
    return res.status(400).json({ error: 'Nombre, día y hora son requeridos.' });
  }
  const { rows } = await pool.query(
    `INSERT INTO church_services (name, day_of_week, time_label, location, icon) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, day_of_week, time_label, location || null, icon || '⛪']
  );
  res.status(201).json(rows[0]);
});

// PUT /api/services/:id -> editar o activar/desactivar un servicio (admin/superadmin)
router.put('/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { name, day_of_week, time_label, location, icon, active } = req.body;
  const { rows } = await pool.query(
    `UPDATE church_services SET name=$1, day_of_week=$2, time_label=$3, location=$4, icon=$5, active=$6 WHERE id=$7 RETURNING *`,
    [name, day_of_week, time_label, location || null, icon || '⛪', active !== false, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'No encontrado.' });
  res.json(rows[0]);
});

// DELETE /api/services/:id -> borrar un servicio por completo (admin/superadmin)
router.delete('/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM church_services WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'No encontrado.' });
  res.json({ ok: true });
});

// POST /api/services/:id/cancel -> cancelar una fecha puntual de un servicio (admin/superadmin)
router.post('/:id/cancel', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { cancel_date, note } = req.body;
  if (!cancel_date) return res.status(400).json({ error: 'La fecha es requerida.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO service_cancellations (service_id, cancel_date, note, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, cancel_date, note || null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Esa fecha ya estaba marcada como cancelada.' });
    console.error(err);
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// DELETE /api/services/cancellations/:id -> deshacer una cancelación (admin/superadmin)
router.delete('/cancellations/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM service_cancellations WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'No encontrada.' });
  res.json({ ok: true });
});

module.exports = router;
