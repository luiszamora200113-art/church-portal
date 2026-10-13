const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const CAN_MANAGE = ['admin', 'superadmin', 'secretary'];
const STATUSES = ['pendiente', 'en_proceso', 'cumplido'];

// Consulta base: reuniones con sus acuerdos anidados (fechas como texto YYYY-MM-DD para evitar desfases de zona horaria).
const SELECT_MEETINGS = `
  SELECT m.id, to_char(m.meeting_date, 'YYYY-MM-DD') AS meeting_date, m.meeting_type, m.attendees, m.created_at,
    COALESCE((
      SELECT json_agg(json_build_object(
        'id', a.id, 'description', a.description, 'responsible', a.responsible,
        'due_date', to_char(a.due_date, 'YYYY-MM-DD'), 'status', a.status
      ) ORDER BY a.row_order, a.id)
      FROM meeting_agreements a WHERE a.meeting_id = m.id
    ), '[]'::json) AS agreements
  FROM leader_meetings m`;

// Valida y normaliza el cuerpo de crear/editar.
function parseBody(body) {
  const { meeting_date, meeting_type, attendees, agreements } = body || {};
  if (!meeting_date || !/^\d{4}-\d{2}-\d{2}$/.test(meeting_date)) return { error: 'La fecha de la reunión es requerida.' };
  if (!meeting_type || !String(meeting_type).trim()) return { error: 'El tipo de reunión es requerido.' };
  const list = Array.isArray(attendees)
    ? [...new Set(attendees.map((a) => String(a).trim()).filter(Boolean))]
    : [];
  const rows = (Array.isArray(agreements) ? agreements : [])
    .filter((a) => a && String(a.description || '').trim())
    .map((a) => ({
      description: String(a.description).trim(),
      responsible: String(a.responsible || '').trim() || null,
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(a.due_date || '') ? a.due_date : null,
      status: STATUSES.includes(a.status) ? a.status : 'pendiente',
    }));
  return { meeting_date, meeting_type: String(meeting_type).trim(), attendees: list, agreements: rows };
}

async function insertAgreements(client, meetingId, agreements) {
  for (let i = 0; i < agreements.length; i++) {
    const a = agreements[i];
    await client.query(
      `INSERT INTO meeting_agreements (meeting_id, row_order, description, responsible, due_date, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [meetingId, i, a.description, a.responsible, a.due_date, a.status]
    );
  }
}

// GET /api/meetings -> historial completo (más reciente primero)
router.get('/', requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const { rows } = await pool.query(`${SELECT_MEETINGS} ORDER BY m.meeting_date DESC, m.id DESC`);
  res.json(rows);
});

// POST /api/meetings -> registrar una reunión con sus acuerdos
router.post('/', requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const data = parseBody(req.body);
  if (data.error) return res.status(400).json({ error: data.error });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO leader_meetings (meeting_date, meeting_type, attendees, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [data.meeting_date, data.meeting_type, JSON.stringify(data.attendees), req.user.id]
    );
    await insertAgreements(client, rows[0].id, data.agreements);
    await client.query('COMMIT');
    const { rows: full } = await pool.query(`${SELECT_MEETINGS} WHERE m.id = $1`, [rows[0].id]);
    res.status(201).json(full[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error del servidor al guardar la reunión.' });
  } finally {
    client.release();
  }
});

// PUT /api/meetings/:id -> editar cabecera y reemplazar la lista de acuerdos (corregir tipeo, actualizar estados)
router.put('/:id', requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const data = parseBody(req.body);
  if (data.error) return res.status(400).json({ error: data.error });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `UPDATE leader_meetings SET meeting_date = $1, meeting_type = $2, attendees = $3 WHERE id = $4`,
      [data.meeting_date, data.meeting_type, JSON.stringify(data.attendees), req.params.id]
    );
    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reunión no encontrada.' });
    }
    await client.query('DELETE FROM meeting_agreements WHERE meeting_id = $1', [req.params.id]);
    await insertAgreements(client, req.params.id, data.agreements);
    await client.query('COMMIT');
    const { rows: full } = await pool.query(`${SELECT_MEETINGS} WHERE m.id = $1`, [req.params.id]);
    res.json(full[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error del servidor al actualizar la reunión.' });
  } finally {
    client.release();
  }
});

// PATCH /api/meetings/:id/agreements/:aid -> cambiar solo el estado de un acuerdo (actualización rápida desde la tabla)
router.patch('/:id/agreements/:aid', requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Estado inválido.' });
  const { rows } = await pool.query(
    `UPDATE meeting_agreements SET status = $1 WHERE id = $2 AND meeting_id = $3 RETURNING id, status`,
    [status, req.params.aid, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Acuerdo no encontrado.' });
  res.json(rows[0]);
});

// DELETE /api/meetings/:id -> eliminar una reunión (sus acuerdos se borran en cascada)
router.delete('/:id', requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM leader_meetings WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Reunión no encontrada.' });
  res.json({ ok: true });
});

module.exports = router;
