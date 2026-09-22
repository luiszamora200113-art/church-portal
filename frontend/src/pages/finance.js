const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Los roles admin/superadmin/finance siempre pueden. Cualquier otro necesita can_view_finance = true,
// que el admin activa persona por persona — se revisa en vivo (no en el token) para que el cambio
// surta efecto de inmediato, sin esperar a que la persona vuelva a iniciar sesión.
async function requireFinanceAccess(req, res, next) {
  if (['admin', 'superadmin', 'finance'].includes(req.user.role)) return next();
  const { rows } = await pool.query('SELECT can_view_finance FROM users WHERE id = $1', [req.user.id]);
  if (rows[0]?.can_view_finance) return next();
  return res.status(403).json({ error: 'No tienes acceso a la sección de Finanzas.' });
}

// GET /api/finance/summary -> total general + ingresos/egresos/balance del mes en curso
router.get('/summary', requireAuth, requireFinanceAccess, async (req, res) => {
  const { rows: totalRows } = await pool.query(`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE entry_type = 'ingreso'), 0) AS ingresos,
      COALESCE(SUM(amount) FILTER (WHERE entry_type = 'egreso'), 0) AS egresos
    FROM finance_entries
  `);

  const { rows: monthRows } = await pool.query(`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE entry_type = 'ingreso'), 0) AS ingresos,
      COALESCE(SUM(amount) FILTER (WHERE entry_type = 'egreso'), 0) AS egresos
    FROM finance_entries
    WHERE date_trunc('month', entry_month) = date_trunc('month', CURRENT_DATE)
  `);

  const t = totalRows[0];
  const m = monthRows[0];
  res.json({
    total: Number(t.ingresos) - Number(t.egresos),
    totalIngresos: Number(t.ingresos),
    totalEgresos: Number(t.egresos),
    currentMonth: Number(m.ingresos) - Number(m.egresos),
    currentMonthIngresos: Number(m.ingresos),
    currentMonthEgresos: Number(m.egresos),
  });
});

// GET /api/finance/breakdown -> desglose por categoría (ingresos y egresos por separado). Todos ven el mes en curso;
// solo admin/superadmin/finance pueden pasar ?month=YYYY-MM-DD para ver meses anteriores.
router.get('/breakdown', requireAuth, requireFinanceAccess, async (req, res) => {
  const canSeeHistory = ['admin', 'superadmin', 'finance'].includes(req.user.role);
  const month = canSeeHistory && req.query.month ? req.query.month : null;

  const { rows } = await pool.query(
    `SELECT fc.id, fc.name, fc.color,
       COALESCE(SUM(fe.amount) FILTER (WHERE fe.entry_type = 'ingreso'), 0) AS ingresos,
       COALESCE(SUM(fe.amount) FILTER (WHERE fe.entry_type = 'egreso'), 0) AS egresos
     FROM finance_categories fc
     LEFT JOIN finance_entries fe
       ON fe.category_id = fc.id
       AND date_trunc('month', fe.entry_month) = date_trunc('month', ${month ? '$1::date' : 'CURRENT_DATE'})
     GROUP BY fc.id, fc.name, fc.color
     ORDER BY fc.name`,
    month ? [month] : []
  );
  res.json(rows.map((r) => ({ ...r, ingresos: Number(r.ingresos), egresos: Number(r.egresos), total: Number(r.ingresos) })));
});

// GET /api/finance/report?from=2026-08-01&to=2026-09-30 -> reporte flexible (un mes, varios meses, o el año completo).
// Trae totales, desglose por categoría, y desglose por mes (para cuando el rango cubre más de un mes) — este mismo
// endpoint alimenta tanto la pantalla como el PDF, y sirve de historial: cualquier rango pasado se puede volver a consultar.
router.get('/report', requireAuth, requireFinanceAccess, async (req, res) => {
  let { from, to } = req.query;
  if (!from || !to) {
    from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    to = from;
  }

  const { rows: totals } = await pool.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE entry_type = 'ingreso'), 0) AS ingresos,
       COALESCE(SUM(amount) FILTER (WHERE entry_type = 'egreso'), 0) AS egresos
     FROM finance_entries
     WHERE entry_month >= $1 AND entry_month <= $2`,
    [from, to]
  );

  const { rows: byCategory } = await pool.query(
    `SELECT fc.name, fc.color,
       COALESCE(SUM(fe.amount) FILTER (WHERE fe.entry_type = 'ingreso'), 0) AS ingresos,
       COALESCE(SUM(fe.amount) FILTER (WHERE fe.entry_type = 'egreso'), 0) AS egresos
     FROM finance_categories fc
     LEFT JOIN finance_entries fe ON fe.category_id = fc.id AND fe.entry_month >= $1 AND fe.entry_month <= $2
     GROUP BY fc.name, fc.color
     HAVING COALESCE(SUM(fe.amount), 0) > 0
     ORDER BY fc.name`,
    [from, to]
  );

  const { rows: byMonth } = await pool.query(
    `SELECT to_char(entry_month, 'YYYY-MM') AS month,
       COALESCE(SUM(amount) FILTER (WHERE entry_type = 'ingreso'), 0) AS ingresos,
       COALESCE(SUM(amount) FILTER (WHERE entry_type = 'egreso'), 0) AS egresos
     FROM finance_entries
     WHERE entry_month >= $1 AND entry_month <= $2
     GROUP BY month ORDER BY month`,
    [from, to]
  );

  res.json({
    from, to,
    ingresos: Number(totals[0].ingresos),
    egresos: Number(totals[0].egresos),
    balance: Number(totals[0].ingresos) - Number(totals[0].egresos),
    byCategory: byCategory.map((r) => ({ ...r, ingresos: Number(r.ingresos), egresos: Number(r.egresos) })),
    byMonth: byMonth.map((r) => ({ ...r, ingresos: Number(r.ingresos), egresos: Number(r.egresos) })),
  });
});

// GET /api/finance/categories -> lista de categorías (para el formulario de admin)
router.get('/categories', requireAuth, requireFinanceAccess, async (req, res) => {
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

// POST /api/finance/entries -> registrar un monto, de ingreso o egreso (admin/superadmin/finance)
router.post('/entries', requireAuth, requireRole('admin', 'superadmin', 'finance'), async (req, res) => {
  const { category_id, amount, entry_month, entry_type, note } = req.body;
  if (!category_id || !amount || !entry_month) {
    return res.status(400).json({ error: 'category_id, amount y entry_month son requeridos.' });
  }
  if (entry_type && !['ingreso', 'egreso'].includes(entry_type)) {
    return res.status(400).json({ error: 'entry_type debe ser "ingreso" o "egreso".' });
  }

  const { rows } = await pool.query(
    `INSERT INTO finance_entries (category_id, amount, entry_month, entry_type, note, registered_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [category_id, amount, entry_month, entry_type || 'ingreso', note || null, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// GET /api/finance/entries -> lista de movimientos recientes, con nombre de categoría (admin/superadmin/finance)
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

// PATCH /api/finance/entries/:id -> corregir un monto ya registrado (admin/superadmin/finance)
router.patch('/entries/:id', requireAuth, requireRole('admin', 'superadmin', 'finance'), async (req, res) => {
  const { category_id, amount, entry_month, entry_type, note } = req.body;
  if (!category_id || !amount || !entry_month) {
    return res.status(400).json({ error: 'category_id, amount y entry_month son requeridos.' });
  }
  if (entry_type && !['ingreso', 'egreso'].includes(entry_type)) {
    return res.status(400).json({ error: 'entry_type debe ser "ingreso" o "egreso".' });
  }
  const { rows } = await pool.query(
    `UPDATE finance_entries SET category_id = $1, amount = $2, entry_month = $3, entry_type = COALESCE($4, entry_type), note = $5
     WHERE id = $6 RETURNING *`,
    [category_id, amount, entry_month, entry_type, note || null, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado.' });
  res.json(rows[0]);
});

// DELETE /api/finance/entries/:id -> borrar un monto registrado por error (admin/superadmin/finance)
router.delete('/entries/:id', requireAuth, requireRole('admin', 'superadmin', 'finance'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM finance_entries WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Registro no encontrado.' });
  res.json({ ok: true });
});

module.exports = router;
