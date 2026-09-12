import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

const money = (n) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n);
const todayMonth = () => new Date().toISOString().slice(0, 7) + '-01';

export default function AdminFinance() {
  const { token, API_URL } = useAuth();
  const [categories, setCategories] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [viewMonth, setViewMonth] = useState(todayMonth());
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({ category_id: '', amount: '', entry_month: todayMonth(), note: '' });
  const [newCatName, setNewCatName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  async function loadAll(month) {
    const m = month || viewMonth;
    const [catsRes, breakdownRes, entriesRes] = await Promise.all([
      fetch(`${API_URL}/api/finance/categories`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/finance/breakdown?month=${m}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/finance/entries`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    setCategories(await catsRes.json());
    setBreakdown(await breakdownRes.json());
    setEntries(await entriesRes.json());
  }

  useEffect(() => { loadAll(); }, [token]);
  useEffect(() => { loadAll(viewMonth); }, [viewMonth]);

  function shiftMonth(delta) {
    const d = new Date(viewMonth + 'T00:00:00');
    d.setMonth(d.getMonth() + delta);
    setViewMonth(d.toISOString().slice(0, 7) + '-01');
  }

  async function handleAddEntry(e) {
    e.preventDefault();
    setError(''); setMessage('');
    if (!form.category_id || !form.amount) return;
    const res = await fetch(`${API_URL}/api/finance/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || 'No se pudo registrar el monto.');
    setMessage('Monto registrado correctamente.');
    setForm({ category_id: '', amount: '', entry_month: todayMonth(), note: '' });
    loadAll();
  }

  async function handleAddCategory(e) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await fetch(`${API_URL}/api/finance/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newCatName.trim() }),
    });
    setNewCatName('');
    loadAll();
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setEditDraft({
      category_id: entry.category_id,
      amount: entry.amount,
      entry_month: entry.entry_month.slice(0, 10),
      note: entry.note || '',
    });
  }

  async function saveEdit(id) {
    await fetch(`${API_URL}/api/finance/entries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(editDraft),
    });
    setEditingId(null);
    loadAll();
  }

  async function deleteEntry(id) {
    if (!window.confirm('¿Borrar este registro? Esta acción no se puede deshacer.')) return;
    await fetch(`${API_URL}/api/finance/entries/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    loadAll();
  }

  return (
    <div>
      <h1>Finanzas — Administración</h1>

      <div className="card">
        <h2>Registrar un monto</h2>
        <form onSubmit={handleAddEntry} style={{ maxWidth: 480 }}>
          <label>Categoría</label>
          <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
            <option value="">Selecciona una categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <label>Monto (C$)</label>
          <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />

          <label>Mes</label>
          <input type="date" value={form.entry_month} onChange={(e) => setForm((f) => ({ ...f, entry_month: e.target.value }))} />

          <label>Nota (opcional)</label>
          <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />

          {error && <p className="error">{error}</p>}
          {message && <p className="success">{message}</p>}

          <button className="primary" type="submit">Registrar</button>
        </form>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ marginBottom: 0 }}>Categorías</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn-outline" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => shiftMonth(-1)}>‹</button>
            <span style={{ fontSize: 13, color: 'var(--muted)', minWidth: 130, textAlign: 'center' }}>
              {new Date(viewMonth + 'T00:00:00').toLocaleDateString('es-NI', { month: 'long', year: 'numeric' })}
            </span>
            <button
              className="btn-outline"
              style={{ padding: '4px 10px', fontSize: 13 }}
              onClick={() => shiftMonth(1)}
              disabled={viewMonth >= todayMonth()}
            >
              ›
            </button>
          </div>
        </div>
        <ul className="fin-breakdown">
          {breakdown.map((c) => (
            <li key={c.id}>
              <span className="cat"><span className="swatch" style={{ background: c.color }}></span>{c.name}</span>
              <span className="amt">{money(c.total)}</span>
            </li>
          ))}
        </ul>
        <form onSubmit={handleAddCategory} className="new-cat-row">
          <input placeholder="Nueva categoría" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
          <button className="primary" style={{ marginTop: 0, width: 'auto', padding: '0 16px' }} type="submit">Crear</button>
        </form>
      </div>

      <div className="card">
        <h2>Movimientos recientes</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Si algo se registró mal, corrígelo o bórralo aquí.
        </p>
        {entries.length === 0 && <p className="muted">Todavía no hay movimientos registrados.</p>}

        {entries.map((entry) => (
          <div key={entry.id} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
            {editingId === entry.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <select value={editDraft.category_id} onChange={(e) => setEditDraft((d) => ({ ...d, category_id: e.target.value }))}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="number" step="0.01" value={editDraft.amount} onChange={(e) => setEditDraft((d) => ({ ...d, amount: e.target.value }))} />
                <input type="date" value={editDraft.entry_month} onChange={(e) => setEditDraft((d) => ({ ...d, entry_month: e.target.value }))} />
                <input value={editDraft.note} onChange={(e) => setEditDraft((d) => ({ ...d, note: e.target.value }))} placeholder="Nota (opcional)" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" style={{ marginTop: 0, padding: '6px 14px' }} onClick={() => saveEdit(entry.id)}>Guardar</button>
                  <button className="btn-outline" onClick={() => setEditingId(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <strong>{entry.category_name}</strong> — {money(entry.amount)}
                  <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                    {new Date(entry.entry_month).toLocaleDateString('es-NI', { month: 'long', year: 'numeric' })}
                    {entry.note ? ` · ${entry.note}` : ''}
                  </p>
                </div>
                <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => startEdit(entry)}>Editar</button>
                <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => deleteEntry(entry.id)}>Borrar</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}