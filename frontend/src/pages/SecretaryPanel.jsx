import React, { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const TYPE_LABEL = { bautismo: 'Bautismo', presentacion: 'Presentación de niño' };

function RecordSection({ type, title, token, API_URL, records, reload }) {
  const [form, setForm] = useState({ full_name: '', record_date: '', officiant: '', notes: '' });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.full_name) return;
    await fetch(`${API_URL}/api/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type, ...form }),
    });
    setForm({ full_name: '', record_date: '', officiant: '', notes: '' });
    reload();
  }

  function startEdit(r) {
    setEditingId(r.id);
    setEditDraft({ full_name: r.full_name, record_date: r.record_date ? r.record_date.slice(0, 10) : '', officiant: r.officiant || '', notes: r.notes || '' });
  }

  async function saveEdit(id) {
    await fetch(`${API_URL}/api/records/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(editDraft),
    });
    setEditingId(null);
    reload();
  }

  async function remove(id) {
    if (!window.confirm('¿Borrar este registro?')) return;
    await fetch(`${API_URL}/api/records/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    reload();
  }

  return (
    <div className="card">
      <h2>{title}</h2>

      <form onSubmit={handleAdd} style={{ maxWidth: 480, marginBottom: 20 }}>
        <label>Nombre completo</label>
        <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
        <label>Fecha</label>
        <input type="date" value={form.record_date} onChange={(e) => setForm((f) => ({ ...f, record_date: e.target.value }))} />
        <label>Ofició (pastor/encargado)</label>
        <input value={form.officiant} onChange={(e) => setForm((f) => ({ ...f, officiant: e.target.value }))} />
        <label>Notas (opcional)</label>
        <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        <button className="primary" type="submit">Registrar</button>
      </form>

      {records.length === 0 && <p className="muted">Aún no hay registros de este tipo.</p>}

      {records.map((r) => (
        <div key={r.id} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
          {editingId === r.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={editDraft.full_name} onChange={(e) => setEditDraft((d) => ({ ...d, full_name: e.target.value }))} />
              <input type="date" value={editDraft.record_date} onChange={(e) => setEditDraft((d) => ({ ...d, record_date: e.target.value }))} />
              <input value={editDraft.officiant} onChange={(e) => setEditDraft((d) => ({ ...d, officiant: e.target.value }))} placeholder="Ofició" />
              <input value={editDraft.notes} onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Notas" />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="primary" style={{ marginTop: 0, padding: '6px 14px' }} onClick={() => saveEdit(r.id)}>Guardar</button>
                <button className="btn-outline" onClick={() => setEditingId(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <strong>{r.full_name}</strong>
                <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                  {r.record_date ? new Date(r.record_date).toLocaleDateString('es-NI', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Sin fecha'}
                  {r.officiant ? ` · Ofició: ${r.officiant}` : ''}
                  {r.notes ? ` · ${r.notes}` : ''}
                </p>
              </div>
              <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => startEdit(r)}>Editar</button>
              <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => remove(r.id)}>Borrar</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SecretaryPanel() {
  const { user, loading, token, API_URL, logout } = useAuth();
  const [records, setRecords] = useState([]);
  const [activeMembers, setActiveMembers] = useState([]);
  const [cells, setCells] = useState([]);
  const [selectedCell, setSelectedCell] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/auth/active-members`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setActiveMembers)
      .catch(() => {});
    fetch(`${API_URL}/api/cells`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setCells)
      .catch(() => {});
  }, [token]);

  function loadRecords() {
    fetch(`${API_URL}/api/records`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setRecords)
      .catch(() => {});
  }

  useEffect(() => { if (token) loadRecords(); }, [token]);

  // El PDF requiere el token: se descarga como blob y se dispara como archivo.
  async function downloadMembersReport() {
    const path = selectedCell ? `/api/reports/miembros.pdf?cell_id=${selectedCell}` : '/api/reports/miembros.pdf';
    const cell = cells.find((c) => String(c.id) === selectedCell);
    const safeName = cell ? cell.name.replace(/[^a-z0-9]+/gi, '-') : 'todas';
    const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'No se pudo generar el reporte.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-miembros-${safeName}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p className="muted center">Cargando…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!['secretary', 'admin', 'superadmin'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const baptisms = records.filter((r) => r.type === 'bautismo');
  const presentations = records.filter((r) => r.type === 'presentacion');

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <img className="brand-logo" src="/assets/logo-claro.png" alt="Logo" />
          <span>Secretaría</span>
        </div>
        <nav className="admin-nav">
          <span className="active">Registros</span>
        </nav>
        <Link className="admin-back" to="/dashboard">← Volver al portal</Link>
      </aside>
      <main className="admin-content">
        <h1>Registro de Secretaría</h1>
        <p className="subtitle" style={{ marginBottom: 20 }}>Respaldo digital del acta física — bautizos y presentaciones de niños.</p>
        <RecordSection type="bautismo" title={`Bautismos (${baptisms.length})`} token={token} API_URL={API_URL} records={baptisms} reload={loadRecords} />
        <RecordSection type="presentacion" title={`Presentaciones de niños (${presentations.length})`} token={token} API_URL={API_URL} records={presentations} reload={loadRecords} />

        <div className="card">
          <h2>Reporte de membresía</h2>
          <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            Descarga el listado de miembros en PDF, de toda la iglesia o de una sola célula.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={selectedCell} onChange={(e) => setSelectedCell(e.target.value)} style={{ maxWidth: 260 }}>
              <option value="">Todos los miembros</option>
              {cells.map((c) => (
                <option key={c.id} value={c.id}>Solo {c.name}</option>
              ))}
            </select>
            <button className="primary" style={{ marginTop: 0, width: 'auto', padding: '10px 18px' }} onClick={downloadMembersReport}>
              Descargar PDF
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Miembros activos ({activeMembers.length})</h2>
          <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            Cualquier persona con credenciales creadas en el portal cuenta como miembro oficial.
          </p>
          {activeMembers.map((m) => (
            <div className="member-row" key={m.id}>
              <div className="avatar">{m.full_name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</div>
              {m.full_name}
              {m.role !== 'member' && (
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 11, textTransform: 'capitalize' }}>{m.role}</span>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
