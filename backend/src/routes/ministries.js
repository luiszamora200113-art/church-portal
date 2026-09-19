const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const VALID_FIELD_TYPES = ['texto', 'fecha', 'miembro', 'miembros'];

function validateRowFields(fields) {
  if (!Array.isArray(fields)) return false;
  return fields.every(
    (f) => f && typeof f.key === 'string' && typeof f.label === 'string' && VALID_FIELD_TYPES.includes(f.type)
  );
}

// GET /api/ministries -> lista completa con sus líderes (cualquier miembro autenticado)
router.get('/', requireAuth, async (req, res) => {
  const { rows: ministries } = await pool.query('SELECT * FROM ministries ORDER BY name');
  const { rows: leaders } = await pool.query(`
    SELECT ml.ministry_id, u.id AS user_id, u.full_name
    FROM ministry_leaders ml JOIN users u ON u.id = ml.user_id
    ORDER BY u.full_name
  `);
  const withLeaders = ministries.map((m) => ({
    ...m,
    leaders: leaders.filter((l) => l.ministry_id === m.id).map((l) => ({ id: l.user_id, full_name: l.full_name })),
  }));
  res.json(withLeaders);
});

// GET /api/ministries/mine -> ministerios donde YO soy líder (para saber qué formularios mostrarme)
router.get('/mine', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.* FROM ministries m
     JOIN ministry_leaders ml ON ml.ministry_id = m.id
     WHERE ml.user_id = $1 ORDER BY m.name`,
    [req.user.id]
  );
  res.json(rows);
});

// POST /api/ministries -> crear un ministerio nuevo, con sus columnas propias (admin/superadmin)
router.post('/', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { name, description, icon, row_fields } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es requerido.' });
  if (row_fields && !validateRowFields(row_fields)) return res.status(400).json({ error: 'Columnas inválidas.' });
  try {
    const { rows } = await pool.query(
      row_fields
        ? `INSERT INTO ministries (name, description, icon, row_fields) VALUES ($1, $2, $3, $4) RETURNING *`
        : `INSERT INTO ministries (name, description, icon) VALUES ($1, $2, $3) RETURNING *`,
      row_fields
        ? [name.trim(), description || null, icon || '🙏', JSON.stringify(row_fields)]
        : [name.trim(), description || null, icon || '🙏']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un ministerio con ese nombre.' });
    console.error(err);
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// PUT /api/ministries/:id -> editar nombre/descripción/ícono/columnas (admin/superadmin)
router.put('/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { name, description, icon, row_fields } = req.body;
  if (row_fields && !validateRowFields(row_fields)) return res.status(400).json({ error: 'Columnas inválidas.' });
  const { rows } = await pool.query(
    `UPDATE ministries SET name=$1, description=$2, icon=$3, row_fields=COALESCE($4, row_fields) WHERE id=$5 RETURNING *`,
    [name, description || null, icon || '🙏', row_fields ? JSON.stringify(row_fields) : null, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'No encontrado.' });
  res.json(rows[0]);
});

// DELETE /api/ministries/:id -> borrar un ministerio por completo (admin/superadmin)
router.delete('/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM ministries WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'No encontrado.' });
  res.json({ ok: true });
});

// POST /api/ministries/:id/leaders -> agregar un líder a un ministerio (admin/superadmin)
router.post('/:id/leaders', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id es requerido.' });
  try {
    await pool.query(`INSERT INTO ministry_leaders (ministry_id, user_id) VALUES ($1, $2)`, [req.params.id, user_id]);
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya es líder de este ministerio.' });
    console.error(err);
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// DELETE /api/ministries/:id/leaders/:userId -> quitar un líder de un ministerio (admin/superadmin)
router.delete('/:id/leaders/:userId', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  await pool.query('DELETE FROM ministry_leaders WHERE ministry_id = $1 AND user_id = $2', [req.params.id, req.params.userId]);
  res.json({ ok: true });
});

module.exports = router;
