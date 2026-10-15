const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const MANAGE = ['education', 'admin', 'superadmin']; // pueden subir material
const REVIEW = ['admin', 'superadmin']; // aprueban, editan y administran categorías
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB por archivo

// El tipo se deduce de la extensión (no se confía en lo que mande el navegador).
const MIME_BY_EXT = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain; charset=utf-8',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};
const extOf = (name) => (String(name).split('.').pop() || '').toLowerCase();

// ---------------------------------------------------------------------------
// Esquema: se crea solo la primera vez (idempotente), no requiere correr migraciones.
// El archivo vive en Postgres (BYTEA) porque Railway no conserva archivos entre despliegues.
// ---------------------------------------------------------------------------
const SCHEMA = `
CREATE TABLE IF NOT EXISTS biblioteca_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) UNIQUE NOT NULL,
  description VARCHAR(255),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS biblioteca_resources (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  category_id INTEGER REFERENCES biblioteca_categories(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  file_size INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  review_comment TEXT,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  published_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- El contenido va aparte para que los listados sean livianos.
CREATE TABLE IF NOT EXISTS biblioteca_files (
  resource_id INTEGER PRIMARY KEY REFERENCES biblioteca_resources(id) ON DELETE CASCADE,
  data BYTEA NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_biblioteca_resources_status ON biblioteca_resources(status);
`;

const DEFAULT_CATEGORIES = [
  'Estudios Bíblicos y Doctrinales',
  'Temas para Células',
  'Discipulado',
  'Escuela Dominical',
  'Jóvenes',
  'Niños',
  'Devocionales',
  'Evangelismo',
  'Otros',
];

const ready = (async () => {
  try {
    await pool.query(SCHEMA);
    const { rows } = await pool.query('SELECT COUNT(*) FROM biblioteca_categories');
    if (Number(rows[0].count) === 0) {
      for (const name of DEFAULT_CATEGORIES) {
        await pool.query('INSERT INTO biblioteca_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
      }
    }
  } catch (err) {
    console.error('Error preparando las tablas de la biblioteca:', err);
  }
})();

router.use((req, res, next) => ready.then(() => next()));

// Express 4 no captura errores de funciones async; este envoltorio evita que tumben el servidor.
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor en la biblioteca.' });
  });

const SELECT_RESOURCE = `
  SELECT r.id, r.title, r.description, r.category_id, c.name AS category_name,
         r.file_name, r.mime_type, r.file_size, r.status, r.review_comment,
         r.uploaded_by, u.full_name AS uploaded_by_name,
         r.created_at, r.published_at, r.reviewed_at
  FROM biblioteca_resources r
  LEFT JOIN biblioteca_categories c ON c.id = r.category_id
  LEFT JOIN users u ON u.id = r.uploaded_by
`;

const isReviewer = (req) => REVIEW.includes(req.user.role);

async function notifyReviewers(title, message, exceptUserId) {
  await pool.query(
    `INSERT INTO notifications (user_id, title, message, expires_at)
     SELECT id, $1, $2, NOW() + INTERVAL '7 days'
     FROM users WHERE role IN ('admin', 'superadmin') AND is_active = true AND id <> $3`,
    [title, message, exceptUserId]
  );
}

async function notifyUser(userId, title, message) {
  if (!userId) return;
  await pool.query(
    `INSERT INTO notifications (user_id, title, message, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
    [userId, title, message]
  );
}

// Valida y decodifica el archivo recibido en base64. Devuelve { buffer, mime, ext } o { error }.
function decodeFile(file_name, file_base64) {
  if (!file_name || !file_base64) return { error: 'Debes adjuntar un archivo.' };
  const ext = extOf(file_name);
  if (!MIME_BY_EXT[ext]) {
    return { error: 'Tipo de archivo no permitido. Usa PDF, Word, PowerPoint, Excel, TXT o imagen (JPG/PNG).' };
  }
  const buffer = Buffer.from(file_base64, 'base64');
  if (buffer.length === 0) return { error: 'El archivo está vacío.' };
  if (buffer.length > MAX_BYTES) return { error: 'El archivo supera el máximo de 15 MB.' };
  return { buffer, mime: MIME_BY_EXT[ext], ext };
}

// ----------------------------- CATEGORÍAS ----------------------------------

// GET /api/biblioteca/categories -> activas (cualquier usuario). Con ?all=1 y rol admin: todas + conteo.
router.get('/categories', requireAuth, wrap(async (req, res) => {
  const all = req.query.all === '1' && isReviewer(req);
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.description, c.active,
            (SELECT COUNT(*) FROM biblioteca_resources r WHERE r.category_id = c.id) AS resource_count
     FROM biblioteca_categories c
     ${all ? '' : 'WHERE c.active = true'}
     ORDER BY c.name`
  );
  res.json(rows.map((r) => ({ ...r, resource_count: Number(r.resource_count) })));
}));

router.post('/categories', requireAuth, requireRole(...REVIEW), wrap(async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'El nombre de la categoría es requerido.' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO biblioteca_categories (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, (req.body.description || '').trim() || null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' });
    throw err;
  }
}));

router.put('/categories/:id', requireAuth, requireRole(...REVIEW), wrap(async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'El nombre de la categoría es requerido.' });
  try {
    const { rows } = await pool.query(
      `UPDATE biblioteca_categories
       SET name = $1, description = $2, active = COALESCE($3, active)
       WHERE id = $4 RETURNING *`,
      [name, (req.body.description || '').trim() || null, typeof req.body.active === 'boolean' ? req.body.active : null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Categoría no encontrada.' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' });
    throw err;
  }
}));

// Si la categoría tiene recursos, solo se desactiva (no se pierde nada); si está vacía, se borra.
router.delete('/categories/:id', requireAuth, requireRole(...REVIEW), wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*) FROM biblioteca_resources WHERE category_id = $1', [req.params.id]);
  if (Number(rows[0].count) > 0) {
    await pool.query('UPDATE biblioteca_categories SET active = false WHERE id = $1', [req.params.id]);
    return res.json({ ok: true, deactivated: true });
  }
  const { rowCount } = await pool.query('DELETE FROM biblioteca_categories WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Categoría no encontrada.' });
  res.json({ ok: true, deactivated: false });
}));

// ------------------------------ RECURSOS -----------------------------------

// GET /api/biblioteca/resources -> SOLO aprobados (biblioteca pública para la congregación)
router.get('/resources', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(`${SELECT_RESOURCE} WHERE r.status = 'approved' ORDER BY r.published_at DESC NULLS LAST, r.id DESC`);
  res.json(rows);
}));

// GET /api/biblioteca/mine -> lo que yo subí, con su estado y observaciones
router.get('/mine', requireAuth, requireRole(...MANAGE), wrap(async (req, res) => {
  const { rows } = await pool.query(`${SELECT_RESOURCE} WHERE r.uploaded_by = $1 ORDER BY r.created_at DESC`, [req.user.id]);
  res.json(rows);
}));

// GET /api/biblioteca/pending -> bandeja del Pastor/SuperAdmin
router.get('/pending', requireAuth, requireRole(...REVIEW), wrap(async (req, res) => {
  const { rows } = await pool.query(`${SELECT_RESOURCE} WHERE r.status = 'pending' ORDER BY r.created_at`);
  res.json(rows);
}));

// GET /api/biblioteca/all -> todo, con cualquier estado (admin)
router.get('/all', requireAuth, requireRole(...REVIEW), wrap(async (req, res) => {
  const { rows } = await pool.query(`${SELECT_RESOURCE} ORDER BY r.created_at DESC`);
  res.json(rows);
}));

// POST /api/biblioteca/resources -> subir material (queda 'pending')
router.post('/resources', requireAuth, requireRole(...MANAGE), wrap(async (req, res) => {
  const { title, description, category_id, file_name, file_base64 } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'El título es requerido.' });
  if (!category_id) return res.status(400).json({ error: 'Elige una categoría.' });

  const cat = await pool.query('SELECT id FROM biblioteca_categories WHERE id = $1 AND active = true', [category_id]);
  if (cat.rows.length === 0) return res.status(400).json({ error: 'La categoría elegida no está disponible.' });

  const file = decodeFile(file_name, file_base64);
  if (file.error) return res.status(400).json({ error: file.error });

  const client = await pool.connect();
  let resource;
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO biblioteca_resources (title, description, category_id, file_name, mime_type, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [title.trim(), (description || '').trim() || null, category_id, file_name, file.mime, file.buffer.length, req.user.id]
    );
    await client.query('INSERT INTO biblioteca_files (resource_id, data) VALUES ($1, $2)', [ins.rows[0].id, file.buffer]);
    await client.query('COMMIT');
    resource = ins.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await notifyReviewers(
    'Nuevo recurso pendiente de aprobación',
    `${req.user.full_name} envió "${title.trim()}" a la Biblioteca de Educación Cristiana.`,
    req.user.id
  );
  res.status(201).json({ id: resource.id, status: 'pending' });
}));

// PUT /api/biblioteca/resources/:id
//  - Admin/SuperAdmin: edita ficha (y opcionalmente reemplaza el archivo); el estado no cambia.
//  - Dueño (gestor) cuyo recurso fue rechazado: corrige y lo reenvía (vuelve a 'pending').
router.put('/resources/:id', requireAuth, requireRole(...MANAGE), wrap(async (req, res) => {
  const { rows: found } = await pool.query('SELECT * FROM biblioteca_resources WHERE id = $1', [req.params.id]);
  if (found.length === 0) return res.status(404).json({ error: 'Recurso no encontrado.' });
  const current = found[0];

  const reviewer = isReviewer(req);
  const ownerResubmit = current.uploaded_by === req.user.id && current.status === 'rejected';
  if (!reviewer && !ownerResubmit) return res.status(403).json({ error: 'No puedes editar este recurso.' });

  const { title, description, category_id, file_name, file_base64 } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'El título es requerido.' });
  if (!category_id) return res.status(400).json({ error: 'Elige una categoría.' });

  let file = null;
  if (file_base64) {
    file = decodeFile(file_name, file_base64);
    if (file.error) return res.status(400).json({ error: file.error });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE biblioteca_resources
       SET title = $1, description = $2, category_id = $3, updated_at = NOW(),
           status = $4, review_comment = $5
       WHERE id = $6`,
      [
        title.trim(),
        (description || '').trim() || null,
        category_id,
        ownerResubmit && !reviewer ? 'pending' : current.status,
        ownerResubmit && !reviewer ? null : current.review_comment,
        current.id,
      ]
    );
    if (file) {
      await client.query(
        'UPDATE biblioteca_resources SET file_name = $1, mime_type = $2, file_size = $3 WHERE id = $4',
        [file_name, file.mime, file.buffer.length, current.id]
      );
      await client.query('UPDATE biblioteca_files SET data = $1 WHERE resource_id = $2', [file.buffer, current.id]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (ownerResubmit && !reviewer) {
    await notifyReviewers(
      'Recurso corregido y reenviado',
      `${req.user.full_name} corrigió y reenvió "${title.trim()}" para su aprobación.`,
      req.user.id
    );
  }
  res.json({ ok: true });
}));

// PATCH /api/biblioteca/resources/:id/review -> aprobar o rechazar (rechazo exige observación)
router.patch('/resources/:id/review', requireAuth, requireRole(...REVIEW), wrap(async (req, res) => {
  const { approve, comment } = req.body;
  const note = (comment || '').trim();
  if (!approve && !note) return res.status(400).json({ error: 'Escribe la observación del rechazo para que el gestor sepa qué corregir.' });

  const { rows } = await pool.query(
    `UPDATE biblioteca_resources
     SET status = $1, review_comment = $2, reviewed_by = $3, reviewed_at = NOW(),
         published_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $4 AND status = 'pending'
     RETURNING id, title, uploaded_by`,
    [approve ? 'approved' : 'rejected', note || null, req.user.id, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'El recurso no existe o ya fue revisado.' });

  const r = rows[0];
  await notifyUser(
    r.uploaded_by,
    approve ? 'Recurso aprobado y publicado' : 'Recurso rechazado',
    approve
      ? `"${r.title}" fue aprobado y ya está en la Biblioteca.`
      : `"${r.title}" fue rechazado. Observación: ${note}`
  );
  res.json({ ok: true, status: approve ? 'approved' : 'rejected' });
}));

// GET /api/biblioteca/resources/:id/file -> contenido (inline para el visor, ?download=1 para descargar)
router.get('/resources/:id/file', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.file_name, r.mime_type, r.status, r.uploaded_by, f.data
     FROM biblioteca_resources r JOIN biblioteca_files f ON f.resource_id = r.id
     WHERE r.id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Archivo no encontrado.' });
  const r = rows[0];

  const allowed = r.status === 'approved' || isReviewer(req) || r.uploaded_by === req.user.id;
  if (!allowed) return res.status(403).json({ error: 'Este recurso aún no está publicado.' });

  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', r.mime_type);
  res.setHeader('Content-Length', r.data.length);
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(r.file_name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(r.data);
}));

// DELETE /api/biblioteca/resources/:id -> admin siempre; el gestor solo si aún no está publicado
router.delete('/resources/:id', requireAuth, requireRole(...MANAGE), wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT status, uploaded_by FROM biblioteca_resources WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Recurso no encontrado.' });
  const r = rows[0];
  const ownerCanDelete = r.uploaded_by === req.user.id && r.status !== 'approved';
  if (!isReviewer(req) && !ownerCanDelete) return res.status(403).json({ error: 'No puedes eliminar este recurso.' });
  await pool.query('DELETE FROM biblioteca_resources WHERE id = $1', [req.params.id]); // biblioteca_files cae en cascada
  res.json({ ok: true });
}));

module.exports = router;
