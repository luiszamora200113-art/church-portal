const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const VALID_TYPES = ['evento', 'culto_mensual', 'celula', 'escuela_dominical'];

async function validateType(req, res, next) {
  const type = req.body.type || req.query.type;
  if (VALID_TYPES.includes(type)) return next();

  // ¿Es una plantilla personalizada creada por el superadmin?
  const { rows } = await pool.query('SELECT id FROM custom_templates WHERE type_key = $1', [type]);
  if (rows.length > 0) return next();

  return res.status(400).json({ error: `Tipo de programación inválido: "${type}".` });
}

// GET /api/schedules?type=evento&cell_id=1 -> lista aprobadas de un tipo (opcionalmente filtrado por célula)
router.get('/', requireAuth, async (req, res) => {
  const { type, cell_id } = req.query;
  const params = [];
  let where = "s.status = 'approved'";
  if (type) {
    params.push(type);
    where += ` AND s.type = $${params.length}`;
  }
  if (cell_id) {
    params.push(cell_id);
    where += ` AND s.cell_id = $${params.length}`;
  }
  // Un evento ya pasado deja de ser relevante para "Eventos" — desaparece solo el día después de su fecha.
  if (type === 'evento') {
    where += ` AND (s.reference_date IS NULL OR s.reference_date >= CURRENT_DATE)`;
  }
  const { rows } = await pool.query(
    `SELECT s.*, u.full_name AS created_by_name
     FROM schedules s JOIN users u ON u.id = s.created_by
     WHERE ${where} ORDER BY s.reference_date DESC NULLS LAST, s.created_at DESC`,
    params
  );
  res.json(rows);
});

// GET /api/schedules/:id -> detalle con filas (cualquiera con acceso a la aprobada; admin ve cualquier estado)
router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'No encontrado.' });
  const schedule = rows[0];

  if (schedule.status !== 'approved' && !['admin', 'superadmin'].includes(req.user.role) && schedule.created_by !== req.user.id) {
    return res.status(403).json({ error: 'No tienes acceso a esta programación aún.' });
  }

  const { rows: scheduleRows } = await pool.query(
    'SELECT * FROM schedule_rows WHERE schedule_id = $1 ORDER BY row_order',
    [req.params.id]
  );
  res.json({ ...schedule, rows: scheduleRows });
});

// POST /api/schedules -> crear una programación nueva (cualquier miembro puede proponerla; queda 'pending')
// body: { type, title, reference_date, location, meta: {...campos extra}, rows: [{...}, ...] }
// Ciertos tipos son institucionales: solo admin/superadmin/secretaría pueden crearlos.
// Eventos, Célula y Escuela Dominical los puede proponer cualquier miembro con la cuenta correspondiente.
const RESTRICTED_TYPES = { culto_mensual: ['admin', 'superadmin', 'secretary'] };

router.post('/', requireAuth, validateType, async (req, res) => {
  const { type, title, reference_date, location, meta, rows, cell_id } = req.body;
  if (!title) return res.status(400).json({ error: 'El título es requerido.' });

  const allowedRoles = RESTRICTED_TYPES[type];
  if (allowedRoles && !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'No tienes permiso para enviar este tipo de programación.' });
  }
  if (!allowedRoles) {
    // No es uno de los tipos fijos restringidos; si es una plantilla personalizada, respeta sus roles permitidos.
    const { rows: templateRows } = await pool.query(
      'SELECT allowed_roles FROM custom_templates WHERE type_key = $1',
      [type]
    );
    const customAllowed = templateRows[0]?.allowed_roles;
    const isPrivileged = ['admin', 'superadmin'].includes(req.user.role);
    if (customAllowed && !customAllowed.includes(req.user.role) && !isPrivileged) {
      return res.status(403).json({ error: 'No tienes permiso para enviar este tipo de programación.' });
    }
  }

  // La programación de célula solo la puede enviar el líder de esa célula (o admin/superadmin/secretaría).
  if (type === 'celula' && !['admin', 'superadmin', 'secretary'].includes(req.user.role)) {
    const { rows: cellRows } = await pool.query('SELECT leader_id FROM cells WHERE id = $1', [cell_id]);
    if (!cellRows.length || cellRows[0].leader_id !== req.user.id) {
      return res.status(403).json({ error: 'Solo el líder de la célula puede enviar su programación.' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: inserted } = await client.query(
      `INSERT INTO schedules (type, title, reference_date, location, meta, cell_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [type, title, reference_date || null, location || null, JSON.stringify(meta || {}), cell_id || null, req.user.id]
    );
    const schedule = inserted[0];

    if (Array.isArray(rows)) {
      for (let i = 0; i < rows.length; i++) {
        await client.query(
          'INSERT INTO schedule_rows (schedule_id, row_order, data) VALUES ($1, $2, $3)',
          [schedule.id, i, JSON.stringify(rows[i])]
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json(schedule);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error del servidor al crear la programación.' });
  } finally {
    client.release();
  }
});

// GET /api/schedules/pending/list -> pendientes de aprobar (solo admin/superadmin/pastor)
router.get('/pending/list', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, u.full_name AS created_by_name, c.name AS cell_name
     FROM schedules s
     JOIN users u ON u.id = s.created_by
     LEFT JOIN cells c ON c.id = s.cell_id
     WHERE s.status = 'pending' ORDER BY s.created_at`
  );
  res.json(rows);
});

// PATCH /api/schedules/:id/review -> aprobar o rechazar (solo admin/superadmin, ej. pastor con ese rol)
// Etiquetas legibles para los campos "<campo>_user_id" que aparecen en las filas de una programación.
const ASSIGNMENT_FIELD_LABELS = {
  lectura: 'Lectura bíblica',
  predica: 'Prédica',
  dirige: 'Dirigir la célula',
  reflexion: 'Reflexión',
  participante: 'Participación en el evento',
};
function prettyLabel(key) {
  return ASSIGNMENT_FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

router.patch('/:id/review', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { approve, comment } = req.body;
  const status = approve ? 'approved' : 'rejected';

  const { rows } = await pool.query(
    `UPDATE schedules SET status = $1, reviewed_by = $2, review_comment = $3, reviewed_at = NOW()
     WHERE id = $4 RETURNING *`,
    [status, req.user.id, comment || null, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'No encontrado.' });

  const schedule = rows[0];
  const title = approve ? 'Programación aprobada' : 'Programación rechazada';
  let message = approve
    ? `"${schedule.title}" fue aprobada y ya está visible en el portal.`
    : `"${schedule.title}" fue rechazada.`;
  if (comment) message += ` Comentario: ${comment}`;

  await pool.query(
    `INSERT INTO notifications (user_id, title, message, expires_at, schedule_id) VALUES ($1, $2, $3, NOW() + INTERVAL '1 day', $4)`,
    [schedule.created_by, title, message, schedule.id]
  );

  // Si se aprobó, avisa también a cada persona asignada — tanto en filas (schedule_rows) como en campos de encabezado (meta).
  if (approve) {
    const { rows: dataRows } = await pool.query(
      'SELECT data FROM schedule_rows WHERE schedule_id = $1',
      [schedule.id]
    );
    // El meta cuenta como una "fila" más para reutilizar el mismo bucle (usa la fecha general de la programación).
    const allSources = [...dataRows.map((r) => r.data), { ...(schedule.meta || {}), fecha: schedule.reference_date }];

    for (const data of allSources) {
      for (const [key, value] of Object.entries(data || {})) {
        if (!key.endsWith('_user_id') || !value) continue;
        const baseField = key.replace('_user_id', '');
        const label = prettyLabel(baseField);
        const dateLabel = data.fecha
          ? new Date(data.fecha).toLocaleDateString('es-NI', { day: 'numeric', month: 'long' })
          : '';
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, expires_at, schedule_id) VALUES ($1, $2, $3, $4, $5)`,
          [
            value,
            'Se te asignó un privilegio',
            `Te toca "${label}"${dateLabel ? ` el ${dateLabel}` : ''} en "${schedule.title}".`,
            data.fecha || null, // se elimina sola en cuanto pasa la fecha del evento/reunión
            schedule.id, // y también se elimina al toque si el evento se borra por completo
          ]
        );
      }
    }
  }

  res.json(schedule);
});

// GET /api/schedules/assignments/mine -> privilegios asignados a mí en programaciones aprobadas (solo próximos, no pasados)
router.get('/assignments/mine', requireAuth, async (req, res) => {
  const { rows: approved } = await pool.query(
    `SELECT id, title, reference_date, meta FROM schedules WHERE status = 'approved'`
  );
  const { rows: rowData } = await pool.query(
    `SELECT sr.schedule_id, sr.data, s.title
     FROM schedule_rows sr JOIN schedules s ON s.id = sr.schedule_id
     WHERE s.status = 'approved'`
  );

  const today = new Date().toISOString().slice(0, 10);
  const assignments = [];

  // De las filas de tabla (ej. lectura_user_id en cada fecha)
  for (const row of rowData) {
    for (const [key, value] of Object.entries(row.data || {})) {
      if (!key.endsWith('_user_id') || Number(value) !== req.user.id) continue;
      if (row.data.fecha && row.data.fecha < today) continue;
      const baseField = key.replace('_user_id', '');
      assignments.push({
        schedule_id: row.schedule_id,
        schedule_title: row.title,
        field: baseField,
        label: prettyLabel(baseField),
        fecha: row.data.fecha || null,
        completed: !!row.data[`${baseField}_cumplido`],
      });
    }
  }

  // De los campos de encabezado (meta) de cada programación
  for (const sched of approved) {
    const fecha = sched.reference_date ? sched.reference_date.toISOString().slice(0, 10) : null;
    if (fecha && fecha < today) continue;
    for (const [key, value] of Object.entries(sched.meta || {})) {
      if (!key.endsWith('_user_id') || Number(value) !== req.user.id) continue;
      const baseField = key.replace('_user_id', '');
      assignments.push({
        schedule_id: sched.id,
        schedule_title: sched.title,
        field: baseField,
        label: prettyLabel(baseField),
        fecha,
        completed: !!sched.meta[`${baseField}_cumplido`],
      });
    }
  }

  assignments.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  res.json(assignments);
});

// GET /api/schedules/assignments/all -> lo mismo que /mine pero de TODOS los miembros (solo admin/superadmin),
// para poder marcar quién cumplió su privilegio.
router.get('/assignments/all', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { rows: approved } = await pool.query(
    `SELECT id, title, reference_date, meta FROM schedules WHERE status = 'approved'`
  );
  const { rows: rowData } = await pool.query(
    `SELECT sr.id AS row_id, sr.schedule_id, sr.data, s.title
     FROM schedule_rows sr JOIN schedules s ON s.id = sr.schedule_id
     WHERE s.status = 'approved'`
  );
  const { rows: users } = await pool.query('SELECT id, full_name FROM users');
  const nameOf = (id) => users.find((u) => u.id === Number(id))?.full_name || `#${id}`;

  const assignments = [];

  for (const row of rowData) {
    for (const [key, value] of Object.entries(row.data || {})) {
      if (!key.endsWith('_user_id') || !value) continue;
      const baseField = key.replace('_user_id', '');
      assignments.push({
        schedule_id: row.schedule_id,
        row_id: row.row_id,
        schedule_title: row.title,
        field: baseField,
        label: prettyLabel(baseField),
        fecha: row.data.fecha || null,
        user_id: Number(value),
        user_name: nameOf(value),
        completed: !!row.data[`${baseField}_cumplido`],
      });
    }
  }

  for (const sched of approved) {
    const fecha = sched.reference_date ? sched.reference_date.toISOString().slice(0, 10) : null;
    for (const [key, value] of Object.entries(sched.meta || {})) {
      if (!key.endsWith('_user_id') || !value) continue;
      const baseField = key.replace('_user_id', '');
      assignments.push({
        schedule_id: sched.id,
        row_id: null,
        schedule_title: sched.title,
        field: baseField,
        label: prettyLabel(baseField),
        fecha,
        user_id: Number(value),
        user_name: nameOf(value),
        completed: !!sched.meta[`${baseField}_cumplido`],
      });
    }
  }

  assignments.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')); // más reciente primero
  res.json(assignments);
});

// PATCH /api/schedules/:id/complete -> el admin marca si alguien cumplió su privilegio asignado.
// body: { field, row_id (opcional, si el campo está en una fila de tabla), completed }
router.patch('/:id/complete', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { field, row_id, completed } = req.body;
  if (!field) return res.status(400).json({ error: 'field es requerido.' });

  if (row_id) {
    const { rows } = await pool.query('SELECT data FROM schedule_rows WHERE id = $1 AND schedule_id = $2', [row_id, req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Fila no encontrada.' });
    const newData = { ...rows[0].data, [`${field}_cumplido`]: !!completed };
    await pool.query('UPDATE schedule_rows SET data = $1 WHERE id = $2', [JSON.stringify(newData), row_id]);
  } else {
    const { rows } = await pool.query('SELECT meta FROM schedules WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'No encontrado.' });
    const newMeta = { ...rows[0].meta, [`${field}_cumplido`]: !!completed };
    await pool.query('UPDATE schedules SET meta = $1 WHERE id = $2', [JSON.stringify(newMeta), req.params.id]);
  }

  res.json({ ok: true });
});

// DELETE /api/schedules/:id -> el admin borra una programación (evento, célula, etc.) por completo.
router.delete('/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM schedules WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'No encontrado.' });
  res.json({ ok: true });
});

module.exports = router;
