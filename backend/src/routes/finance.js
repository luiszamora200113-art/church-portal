const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/finance/summary -> total general + ingresos del mes en curso (todos los miembros)
router.get('/summary', requireAuth, async (req, res) => {
  const { rows: totalRows } = await pool.query('SELECT COALESCE(SUM(amount), 0) AS total FROM finance_entries');

  const { rows: monthRows } = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM finance_entries
    WHERE date_trunc('month', entry_month) = date_trunc('month', CURRENT_DATE)
  `);

  res.json({
    total: Number(totalRows[0].total),
    currentMonth: Number(monthRows[0].total),
  });
});

// GET /api/finance/breakdown -> desglose por categoría. Todos ven el mes en curso;
// solo admin/superadmin/finance pueden pasar ?month=YYYY-MM-DD para ver meses anteriores.
router.get('/breakdown', requireAuth, async (req, res) => {
  const canSeeHistory = ['admin', 'superadmin', 'finance'].includes(req.user.role);
  const month = canSeeHistory && req.query.month ? req.query.month : null;

  const { rows } = await pool.query(
    `SELECT fc.id, fc.name, fc.color, COALESCE(SUM(fe.amount), 0) AS total
     FROM finance_categories fc
     LEFT JOIN finance_entries fe
       ON fe.category_id = fc.id
       AND date_trunc('month', fe.entry_month) = date_trunc('month', ${month ? '$1::date' : 'CURRENT_DATE'})
     GROUP BY fc.id, fc.name, fc.color
     ORDER BY fc.name`,
    month ? [month] : []
  );
  res.json(rows.map((r) => ({ ...r, total: Number(r.total) })));
});

// GET /api/finance/categories -> lista de categorías (para el formulario de admin)
router.get('/categories', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM finance_categories ORDER BY name');
  res.json(rows);
});

// POST /api/finance/categories -> crear nueva categoría (solo admin)
router.post('/categories', requireAuth, requireRole('admin', 'superadmin', 'finance'), async (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre de la categoría es requerido.' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO finance_categories (name, color, created_by) VALUES ($1, $2, $3) RETURNING *`,
      [name, color || '#2f4d3a', req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' });
    console.error(err);
    res.status(500).json({ error: 'Error del servidor al crear la categoría.' });
  }
});

// POST /api/finance/entries -> registrar un monto (solo admin)
router.post('/entries', requireAuth, requireRole('admin', 'superadmin', 'finance'), async (req, res) => {
  const { category_id, amount, entry_month, note } = req.body;
  if (!category_id || !amount || !entry_month) {
    return res.status(400).json({ error: 'category_id, amount y entry_month son requeridos.' });
  }

  const { rows } = await pool.query(
    `INSERT INTO finance_entries (category_id, amount, entry_month, note, registered_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [category_id, amount, entry_month, note || null, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// GET /api/finance/entries -> lista de movimientos recientes, con nombre de categoría (solo admin)
router.get('/entries', requireAuth, requireRole('admin', 'superadmin', 'finance'), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT fe.*, fc.name AS category_name
    FROM finance_entries fe
    JOIN finance_categories fc ON fc.id = fe.category_id
    ORDER BY fe.entry_month DESC, fe.created_at DESC
    LIMIT 100
  `);
  res.json(rows);
});

// PATCH /api/finance/entries/:id -> corregir un monto ya registrado (solo admin)
router.patch('/entries/:id', requireAuth, requireRole('admin', 'superadmin', 'finance'), async (req, res) => {
  const { category_id, amount, entry_month, note } = req.body;
  if (!category_id || !amount || !entry_month) {
    return res.status(400).json({ error: 'category_id, amount y entry_month son requeridos.' });
  }
  const { rows } = await pool.query(
    `UPDATE finance_entries SET category_id = $1, amount = $2, entry_month = $3, note = $4
     WHERE id = $5 RETURNING *`,
    [category_id, amount, entry_month, note || null, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado.' });
  res.json(rows[0]);
});

// DELETE /api/finance/entries/:id -> borrar un monto registrado por error (solo admin)
router.delete('/entries/:id', requireAuth, requireRole('admin', 'superadmin', 'finance'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM finance_entries WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Registro no encontrado.' });
  res.json({ ok: true });
});

module.exports = router;
