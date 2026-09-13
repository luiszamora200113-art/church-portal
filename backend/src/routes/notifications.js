const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications -> notificaciones del usuario autenticado
router.get('/', requireAuth, async (req, res) => {
  // Limpieza perezosa: borra las vencidas (de cualquier usuario) cada vez que alguien consulta.
  await pool.query('DELETE FROM notifications WHERE expires_at IS NOT NULL AND expires_at < NOW()');

  const { rows } = await pool.query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  res.json(rows);
});

// PATCH /api/notifications/:id/read -> marcar como leída
router.patch('/:id/read', requireAuth, async (req, res) => {
  await pool.query(
    'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  res.json({ ok: true });
});

// DELETE /api/notifications/:id -> el usuario descarta manualmente una notificación suya
router.delete('/:id', requireAuth, async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'No encontrada.' });
  res.json({ ok: true });
});

module.exports = router;
