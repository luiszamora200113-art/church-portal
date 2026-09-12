import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

function randomPassword() {
  // Genera una contraseña temporal legible, ej: "Fe-4821"
  const num = Math.floor(1000 + Math.random() * 9000);
  return `Fe-${num}`;
}

export default function AdminCreateMember() {
  const { token, user, API_URL } = useAuth();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    cell_group: '',
    phone: '',
    temp_password: randomPassword(),
  });
  const [message, setMessage] = useState(null);
  const [error, setError] = useState('');

  if (!user || !['admin', 'superadmin'].includes(user.role)) {
    return <p className="muted">No tienes permiso para ver esta página.</p>;
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/create-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el miembro.');

      setMessage(
        `Miembro creado: ${data.member.email}. Contraseña temporal: ${form.temp_password} (compártela por un medio seguro; se le notificará dentro del portal).`
      );
      setForm({
        full_name: '',
        email: '',
        cell_group: '',
        phone: '',
        temp_password: randomPassword(),
      });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="admin-page">
      <h1>Crear credenciales de miembro</h1>
      <form className="card" onSubmit={handleSubmit}>
        <label>Nombre completo</label>
        <input value={form.full_name} onChange={(e) => update('full_name', e.target.value)} required />

        <label>Correo electrónico</label>
        <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />

        <label>Célula (opcional)</label>
        <input value={form.cell_group} onChange={(e) => update('cell_group', e.target.value)} />

        <label>Teléfono (opcional)</label>
        <input value={form.phone} onChange={(e) => update('phone', e.target.value)} />

        <label>Contraseña temporal</label>
        <input value={form.temp_password} onChange={(e) => update('temp_password', e.target.value)} required />

        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}

        <button type="submit">Crear miembro</button>
      </form>
    </div>
  );
}
