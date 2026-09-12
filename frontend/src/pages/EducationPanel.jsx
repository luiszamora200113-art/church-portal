import React, { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const emptyRow = () => ({ fecha: '', tema: '', encargado: '', cita: '' });

export default function EducationPanel() {
  const { user, loading, token, API_URL, logout } = useAuth();
  const [mine, setMine] = useState([]);
  const [form, setForm] = useState({ title: '', reference_date: '' });
  const [rows, setRows] = useState([emptyRow(), emptyRow()]);
  const [message, setMessage] = useState('');

  function loadMine() {
    fetch(`${API_URL}/api/schedules?type=escuela_dominical`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setMine)
      .catch(() => {});
  }

  useEffect(() => { if (token) loadMine(); }, [token]);

  function updateRow(i, field, value) {
    const copy = [...rows];
    copy[i] = { ...copy[i], [field]: value };
    setRows(copy);
  }

  async function handleSubmit() {
    setMessage('Enviando…');
    try {
      const res = await fetch(`${API_URL}/api/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: 'escuela_dominical', ...form, rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar.');
      setMessage('Enviado. Quedó pendiente de aprobación del pastor.');
      setForm({ title: '', reference_date: '' });
      setRows([emptyRow(), emptyRow()]);
      loadMine();
    } catch (err) {
      setMessage(err.message);
    }
  }

  if (loading) return <p className="muted center">Cargando…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!['education', 'admin', 'superadmin'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <img className="brand-logo" src="/assets/logo-claro.png" alt="Logo" />
          <span>Educación Cristiana</span>
        </div>
        <nav className="admin-nav">
          <span className="active">Temas</span>
        </nav>
        <Link className="admin-back" to="/dashboard">← Volver al portal</Link>
      </aside>
      <main className="admin-content">
        <h1>Escuela Dominical</h1>
        <p className="subtitle" style={{ marginBottom: 20 }}>
          Publica los temas del próximo domingo o de varias semanas. El pastor los aprueba antes de que se vean en el portal.
        </p>

        <div className="card">
          <h2>Publicar temas</h2>
          <label>Título (ej. Temas de Escuela Dominical — Septiembre 2026)</label>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <label>Fecha de referencia</label>
          <input type="date" value={form.reference_date} onChange={(e) => setForm((f) => ({ ...f, reference_date: e.target.value }))} />

          <label style={{ marginTop: 14 }}>Temas</label>
          <table className="sched-table" style={{ marginTop: 6 }}>
            <thead><tr><th>Fecha</th><th>Tema</th><th>Encargado</th><th>Cita</th></tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td><input type="date" value={row.fecha} onChange={(e) => updateRow(i, 'fecha', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0 }} /></td>
                  <td><input value={row.tema} onChange={(e) => updateRow(i, 'tema', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0 }} /></td>
                  <td><input value={row.encargado} onChange={(e) => updateRow(i, 'encargado', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0 }} /></td>
                  <td><input value={row.cita} onChange={(e) => updateRow(i, 'cita', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0 }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-outline" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setRows((r) => [...r, emptyRow()])}>
            + Agregar fecha
          </button>

          {message && <p className={message.startsWith('Enviado') ? 'success' : 'error'}>{message}</p>}
          <button className="primary" style={{ marginTop: 16 }} onClick={handleSubmit}>Enviar para aprobación</button>
        </div>

        <div className="card">
          <h2>Aprobados recientemente</h2>
          <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Lo que envíes queda pendiente de aprobación del pastor — cuando lo apruebe, te llega una notificación y aparece aquí.
          </p>
          {mine.length === 0 && <p className="muted">Todavía no tienes temas aprobados.</p>}
          {mine.map((s) => (
            <div key={s.id} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
              <strong>{s.title}</strong>
              <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>Aprobado</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
