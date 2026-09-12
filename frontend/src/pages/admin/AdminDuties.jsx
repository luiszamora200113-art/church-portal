import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AdminDuties() {
  const { token, API_URL } = useAuth();
  const [progress, setProgress] = useState([]);
  const [form, setForm] = useState({ title: '', description: '' });
  const [message, setMessage] = useState('');

  async function loadProgress() {
    const res = await fetch(`${API_URL}/api/duties/progress`, { headers: { Authorization: `Bearer ${token}` } });
    setProgress(await res.json());
  }

  useEffect(() => { loadProgress(); }, [token]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    await fetch(`${API_URL}/api/duties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    setMessage(`Deber "${form.title}" creado.`);
    setForm({ title: '', description: '' });
    loadProgress();
  }

  return (
    <div>
      <h1>Deberes — Administración</h1>

      <div className="card">
        <h2>Crear nuevo deber</h2>
        <form onSubmit={handleCreate} style={{ maxWidth: 480 }}>
          <label>Título</label>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
          <label>Descripción (opcional)</label>
          <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          {message && <p className="success">{message}</p>}
          <button className="primary" type="submit">Crear deber</button>
        </form>
      </div>

      <div className="card">
        <h2>Progreso por miembro</h2>
        {progress.map((p) => (
          <div className="member-row" key={p.user_id}>
            <div className="avatar">{p.full_name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</div>
            {p.full_name}
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>
              {p.completed} / {p.total_duties}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
