import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function ForcePasswordChange() {
  const { token, API_URL, markPasswordChanged, logout, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      return setError('La nueva contraseña debe tener al menos 8 caracteres.');
    }
    if (newPassword !== confirmPassword) {
      return setError('Las contraseñas nuevas no coinciden.');
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cambiar la contraseña.');
      markPasswordChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Cambia tu contraseña</h1>
        <p className="subtitle">
          {user ? `Hola ${user.full_name.split(' ')[0]}, ` : ''}
          por seguridad, debes crear una contraseña propia antes de continuar.
        </p>

        <label>Contraseña temporal actual</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />

        <label>Nueva contraseña</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Mínimo 8 caracteres"
          required
        />

        <label>Confirmar nueva contraseña</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />

        {error && <p className="error">{error}</p>}

        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar y continuar'}
        </button>

        <p className="hint" style={{ cursor: 'pointer' }} onClick={logout}>Cerrar sesión</p>
      </form>
    </div>
  );
}
