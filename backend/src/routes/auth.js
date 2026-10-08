const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username.toLowerCase()]);
    const user = rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        role: user.role,
        cell_id: user.cell_id,
        must_change_password: user.must_change_password,
        can_view_finance: user.can_view_finance,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor al iniciar sesión.' });
  }
});

// GET /api/auth/me  -> datos del usuario autenticado
router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, full_name, username, role, cell_id, phone, must_change_password, can_view_finance FROM users WHERE id = $1',
    [req.user.id]
  );
  res.json(rows[0]);
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }

  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query(
    'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
    [newHash, req.user.id]
  );
  res.json({ ok: true, message: 'Contraseña actualizada correctamente.' });
});

// POST /api/auth/create-member  (solo admin/superadmin) -> crea credenciales de un miembro
router.post('/create-member', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { full_name, username, cell_id, phone, temp_password, role } = req.body;

  if (!full_name || !username || !temp_password) {
    return res.status(400).json({ error: 'Nombre, usuario y contraseña temporal son requeridos.' });
  }

  // Solo un superadmin puede crear otros admins. Finanzas, secretaría y educación los puede asignar cualquier admin.
  let assignedRole = 'member';
  if (role === 'admin' && req.user.role === 'superadmin') assignedRole = 'admin';
  else if (['finance', 'secretary', 'education'].includes(role)) assignedRole = role;

  try {
    const hash = await bcrypt.hash(temp_password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, username, password_hash, role, cell_id, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, full_name, username, role, cell_id`,
      [full_name, username.toLowerCase(), hash, assignedRole, cell_id || null, phone || null]
    );

    // Notificación de bienvenida dentro del portal.
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
      [
        rows[0].id,
        'Bienvenido al portal',
        `Hola ${full_name}, ya tienes acceso al portal de la iglesia. Tu usuario es ${username}.`,
      ]
    );

    res.status(201).json({ member: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre de usuario.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error del servidor al crear el miembro.' });
  }
});

function randomTempPassword() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `Fe-${num}`;
}

// PATCH /api/auth/members/:id/reset-password (solo admin) -> genera una nueva contraseña temporal
router.patch('/members/:id/reset-password', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const tempPassword = randomTempPassword();
  const hash = await bcrypt.hash(tempPassword, 10);

  const { rows } = await pool.query(
    `UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2
     RETURNING id, full_name, username`,
    [hash, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Miembro no encontrado.' });

  await pool.query(
    `INSERT INTO notifications (user_id, title, message, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
    [req.params.id, 'Tu contraseña fue restablecida', 'Un administrador restableció tu contraseña. Pide tu nueva contraseña temporal y cámbiala al ingresar.']
  );

  res.json({ member: rows[0], temp_password: tempPassword });
});

// PATCH /api/auth/members/:id (solo admin) -> editar nombre y teléfono
router.patch('/members/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { full_name, phone, can_view_finance } = req.body;
  if (!full_name) return res.status(400).json({ error: 'El nombre completo es requerido.' });

  const { rows } = await pool.query(
    `UPDATE users SET full_name = $1, phone = $2, can_view_finance = COALESCE($3, can_view_finance) WHERE id = $4
     RETURNING id, full_name, username, phone, can_view_finance`,
    [full_name, phone || null, can_view_finance, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Miembro no encontrado.' });
  res.json(rows[0]);
});

// PATCH /api/auth/members/:id/toggle-active (solo admin) -> activar/desactivar acceso
router.patch('/members/:id/toggle-active', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE users SET is_active = NOT is_active WHERE id = $1
     RETURNING id, full_name, is_active`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Miembro no encontrado.' });
  res.json(rows[0]);
});

// DELETE /api/auth/members/:id -> eliminar una cuenta por completo (no solo desactivar).
// Pensado para cuentas creadas por error, sin actividad todavía. Si ya tiene actividad
// registrada en otras tablas (programaciones, finanzas, etc.), se rechaza con un mensaje claro
// en vez de arrastrar ese historial — para eso está "Desactivar".
router.delete('/members/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
  }
  try {
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Miembro no encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar: esta cuenta ya tiene actividad registrada (programaciones, finanzas, etc.). Usa "Desactivar" en su lugar.',
      });
    }
    console.error(err);
    res.status(500).json({ error: 'Error del servidor al eliminar.' });
  }
});

// GET /api/auth/active-members -> listado y conteo de todas las cuentas activas (cualquier credencial cuenta como miembro oficial)
router.get('/active-members', requireAuth, requireRole('admin', 'superadmin', 'secretary'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, full_name, role, created_at FROM users WHERE is_active = true AND role != 'superadmin' ORDER BY full_name`
  );
  res.json(rows);
});

module.exports = router;