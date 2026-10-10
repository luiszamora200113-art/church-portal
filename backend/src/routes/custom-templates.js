const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { userCanFill } = require('../utils/templateAccess');

const router = express.Router();
const VALID_FIELD_TYPES = ['texto', 'fecha', 'miembro', 'miembros'];
const VALID_PUBLISH = ['ninguno', 'eventos', 'programacion'];

function validateFields(fields) {
  if (!Array.isArray(fields)) return false;
  return fields.every(
    (f) => f && typeof f.key === 'string' && typeof f.label === 'string' && VALID_FIELD_TYPES.includes(f.type)
  );
}

function normalizeAssigned(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

async function notifyAssigned(userIds, templateName) {
  for (const uid of userIds) {
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
      [uid, 'Se te asignó un documento', `Te asignaron llenar "${templateName}". Búscalo en Documentos.`]
    );
  }
}

// GET /api/custom-templates -> lista de plantillas personalizadas (cualquier miembro autenticado)
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM custom_templates ORDER BY created_at');
  res.json(rows);
});

// GET /api/custom-templates/mine -> solo las plantillas que ESTE usuario puede llenar (encargado asignado o rol permitido)
router.get('/mine', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM custom_templates ORDER BY created_at');
  res.json(rows.filter((t) => userCanFill(t, req.user)));
});

// POST /api/custom-templates -> crear una plantilla nueva (admin/superadmin)
router.post('/', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { name, description, icon, header_fields, row_fields, allowed_roles, publish_to, assigned_users } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es requerido.' });
  if (!validateFields(header_fields || [])) return res.status(400).json({ error: 'Campos de encabezado inválidos.' });
  if (!validateFields(row_fields || [])) return res.status(400).json({ error: 'Campos de tabla inválidos.' });
  if (publish_to && !VALID_PUBLISH.includes(publish_to)) return res.status(400).json({ error: 'Destino de publicación inválido.' });

  const assigned = normalizeAssigned(assigned_users);
  const typeKey = name
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

  try {
    const { rows } = await pool.query(
      `INSERT INTO custom_templates (type_key, name, description, icon, header_fields, row_fields, allowed_roles, publish_to, assigned_users, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        typeKey,
        name.trim(),
        description || null,
        icon || '📄',
        JSON.stringify(header_fields || []),
        JSON.stringify(row_fields || []),
        allowed_roles && allowed_roles.length > 0 ? JSON.stringify(allowed_roles) : null,
        publish_to || 'ninguno',
        assigned.length > 0 ? JSON.stringify(assigned) : null,
        req.user.id,
      ]
    );
    await notifyAssigned(assigned, rows[0].name);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una plantilla con un nombre muy similar.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error del servidor al crear la plantilla.' });
  }
});

// PUT /api/custom-templates/:id -> editar una plantilla existente (admin/superadmin)
router.put('/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { name, description, icon, header_fields, row_fields, allowed_roles, publish_to, assigned_users } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es requerido.' });
  if (!validateFields(header_fields || [])) return res.status(400).json({ error: 'Campos de encabezado inválidos.' });
  if (!validateFields(row_fields || [])) return res.status(400).json({ error: 'Campos de tabla inválidos.' });
  if (publish_to && !VALID_PUBLISH.includes(publish_to)) return res.status(400).json({ error: 'Destino de publicación inválido.' });

  const assigned = normalizeAssigned(assigned_users);
  const { rows: before } = await pool.query('SELECT assigned_users FROM custom_templates WHERE id = $1', [req.params.id]);
  const previous = normalizeAssigned(before[0]?.assigned_users);

  const { rows } = await pool.query(
    `UPDATE custom_templates SET name=$1, description=$2, icon=$3, header_fields=$4, row_fields=$5, allowed_roles=$6,
       publish_to=$7, assigned_users=$8
     WHERE id=$9 RETURNING *`,
    [
      name.trim(),
      description || null,
      icon || '📄',
      JSON.stringify(header_fields || []),
      JSON.stringify(row_fields || []),
      allowed_roles && allowed_roles.length > 0 ? JSON.stringify(allowed_roles) : null,
      publish_to || 'ninguno',
      assigned.length > 0 ? JSON.stringify(assigned) : null,
      req.params.id,
    ]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'No encontrada.' });
  // Avisa solo a los encargados recién agregados.
  await notifyAssigned(assigned.filter((id) => !previous.includes(id)), rows[0].name);
  res.json(rows[0]);
});

// DELETE /api/custom-templates/:id -> quitar una plantilla (admin/superadmin). No borra programaciones ya enviadas con ese tipo.
router.delete('/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM custom_templates WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'No encontrada.' });
  res.json({ ok: true });
});

module.exports = router;
