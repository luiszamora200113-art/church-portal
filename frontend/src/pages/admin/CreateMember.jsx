import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

function randomPassword() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `Fe-${num}`;
}

export default function CreateMember() {
  const { user: currentUser, token, API_URL } = useAuth();
  const [cells, setCells] = useState([]);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({
    full_name: '',
    username: '',
    cell_id: '',
    phone: '',
    role: 'member',
    temp_password: randomPassword(),
  });
  const [message, setMessage] = useState(null);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ full_name: '', phone: '' });
  const [resetInfo, setResetInfo] = useState(null); // { id, temp_password }

  function loadMembers() {
    fetch(`${API_URL}/api/cells/members-overview`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setMembers)
      .catch(() => {});
  }

  useEffect(() => {
    fetch(`${API_URL}/api/cells`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setCells)
      .catch(() => {});
    loadMembers();
  }, [token]);

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, cell_id: form.cell_id || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el miembro.');

      setMessage(
        `Miembro creado: ${data.member.username}. Contraseña temporal: ${form.temp_password} (compártela por un medio seguro; se le notificará dentro del portal).`
      );
      setForm({ full_name: '', username: '', cell_id: '', phone: '', role: 'member', temp_password: randomPassword() });
      loadMembers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReassign(userId, newCellId) {
    if (!newCellId) return;
    await fetch(`${API_URL}/api/cells/${newCellId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user_id: userId }),
    });
    loadMembers();
  }

  function startEdit(m) {
    setEditingId(m.id);
    setEditDraft({ full_name: m.full_name, phone: m.phone || '' });
    setResetInfo(null);
  }

  async function saveEdit(id) {
    await fetch(`${API_URL}/api/auth/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(editDraft),
    });
    setEditingId(null);
    loadMembers();
  }

  async function resetPassword(id) {
    const res = await fetch(`${API_URL}/api/auth/members/${id}/reset-password`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setResetInfo({ id, temp_password: data.temp_password });
  }

  async function toggleFinanceAccess(m) {
    await fetch(`${API_URL}/api/auth/members/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ full_name: m.full_name, phone: m.phone, can_view_finance: !m.can_view_finance }),
    });
    loadMembers();
  }

  async function toggleActive(id) {
    await fetch(`${API_URL}/api/auth/members/${id}/toggle-active`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    loadMembers();
  }

  return (
    <div>
      <h1>Crear credenciales de miembro</h1>
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        <label>Nombre completo</label>
        <input value={form.full_name} onChange={(e) => update('full_name', e.target.value)} required />

        <label>Usuario</label>
        <input type="text" value={form.username} onChange={(e) => update('username', e.target.value)} placeholder="Ej. maria.gonzalez" required />

        <label>Célula</label>
        <select value={form.cell_id} onChange={(e) => update('cell_id', e.target.value)}>
          <option value="">Sin asignar todavía</option>
          {cells.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <label>Rol</label>
        <select value={form.role} onChange={(e) => update('role', e.target.value)}>
          <option value="member">Miembro</option>
          <option value="finance">Finanzas / Tesorería</option>
          <option value="secretary">Secretaría</option>
          <option value="education">Educación Cristiana</option>
          {currentUser?.role === 'superadmin' && <option value="admin">Administrador</option>}
        </select>
        {form.role !== 'member' && (
          <p className="muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 12 }}>
            {form.role === 'admin' && 'Podrá aprobar programaciones, crear miembros y administrar todo el portal.'}
            {form.role === 'finance' && 'Solo verá el panel de Tesorería (registrar y corregir montos).'}
            {form.role === 'secretary' && 'Solo verá el panel de Secretaría (bautizos y presentaciones).'}
            {form.role === 'education' && 'Solo verá el panel de Educación Cristiana (publicar temas de escuela dominical).'}
          </p>
        )}

        <label>Teléfono (opcional)</label>
        <input value={form.phone} onChange={(e) => update('phone', e.target.value)} />

        <label>Contraseña temporal</label>
        <input value={form.temp_password} onChange={(e) => update('temp_password', e.target.value)} required />

        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}

        <button className="primary" type="submit">Crear miembro</button>
      </form>

      <div className="card">
        <h2>Miembros</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Célula, edición, restablecer contraseña o desactivar acceso — todo desde aquí. El miembro no puede cambiar su célula por su cuenta.
        </p>
        {members.length === 0 && <p className="muted">Aún no hay miembros registrados.</p>}

        {members.map((m) => (
          <div key={m.id} style={{ borderBottom: '1px solid var(--line)', padding: '12px 0' }}>
            {editingId === m.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={editDraft.full_name} onChange={(e) => setEditDraft((d) => ({ ...d, full_name: e.target.value }))} placeholder="Nombre completo" />
                <input value={editDraft.phone} onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="Teléfono" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" style={{ marginTop: 0, padding: '6px 14px' }} onClick={() => saveEdit(m.id)}>Guardar</button>
                  <button className="btn-outline" onClick={() => setEditingId(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="member-row">
                <div className="avatar">
                  {m.full_name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div>
                    {m.full_name}
                    {m.role !== 'member' && (
                      <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
                        ({m.role === 'finance' ? 'Finanzas' : m.role === 'secretary' ? 'Secretaría' : 'Educación'})
                      </span>
                    )}
                    {!m.is_active && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>(Desactivado)</span>}
                  </div>
                </div>
                <select
                  className="cell-select"
                  style={{ fontSize: 12, padding: '5px 10px' }}
                  value={m.cell_id || ''}
                  onChange={(e) => handleReassign(m.id, e.target.value)}
                >
                  <option value="" disabled>Sin célula</option>
                  {cells.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => startEdit(m)}>Editar</button>
                <button
                  className="btn-outline"
                  style={{ fontSize: 12, padding: '5px 10px', color: m.can_view_finance ? 'var(--moss-dark)' : undefined, borderColor: m.can_view_finance ? 'var(--moss-dark)' : undefined }}
                  onClick={() => toggleFinanceAccess(m)}
                >
                  {m.can_view_finance ? '💰 Finanzas ✓' : '💰 Ver finanzas'}
                </button>
                <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => resetPassword(m.id)}>Restablecer clave</button>
                <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => toggleActive(m.id)}>
                  {m.is_active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            )}

            {resetInfo && resetInfo.id === m.id && (
              <p className="success" style={{ marginTop: 8 }}>
                Nueva contraseña temporal: <strong>{resetInfo.temp_password}</strong> — compártela con {m.full_name} por un medio seguro. Deberá cambiarla al ingresar.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}