const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const VALID_FIELD_TYPES = ['texto', 'fecha', 'miembro'];

function validateFields(fields) {
  if (!Array.isArray(fields)) return false;
  return fields.every(
    (f) => f && typeof f.key === 'string' && typeof f.label === 'string' && VALID_FIELD_TYPES.includes(f.type)
  );
}

// GET /api/custom-templates -> lista de plantillas personalizadas (cualquier miembro autenticado, para armar Documentos)
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM custom_templates ORDER BY created_at');
  res.json(rows);
});

// POST /api/custom-templates -> crear una plantilla nueva (solo superadmin)
router.post('/', requireAuth, requireRole('superadmin'), async (req, res) => {
  const { name, description, icon, header_fields, row_fields, allowed_roles } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es requerido.' });
  if (!validateFields(header_fields || [])) return res.status(400).json({ error: 'Campos de encabezado inválidos.' });
  if (!validateFields(row_fields || [])) return res.status(400).json({ error: 'Campos de tabla inválidos.' });

  const typeKey = name
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

  try {
    const { rows } = await pool.query(
      `INSERT INTO custom_templates (type_key, name, description, icon, header_fields, row_fields, allowed_roles, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        typeKey,
        name.trim(),
        description || null,
        icon || '📄',
        JSON.stringify(header_fields || []),
        JSON.stringify(row_fields || []),
        allowed_roles && allowed_roles.length > 0 ? JSON.stringify(allowed_roles) : null,
        req.user.id,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una plantilla con un nombre muy similar.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error del servidor al crear la plantilla.' });
  }
});

// DELETE /api/custom-templates/:id -> quitar una plantilla (solo superadmin). No borra programaciones ya enviadas con ese tipo.
router.delete('/:id', requireAuth, requireRole('superadmin'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM custom_templates WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'No encontrada.' });
  res.json({ ok: true });
});

module.exports = router;
