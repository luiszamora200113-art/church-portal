import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const money = (n) =>
  new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n);

export default function Finance() {
  const { token, user, API_URL } = useAuth();
  const [summary, setSummary] = useState({ total: 0, currentMonth: 0 });
  const [breakdown, setBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [error, setError] = useState('');

  const isAdmin = user && ['admin', 'superadmin'].includes(user.role);

  async function loadData() {
    const [summaryRes, breakdownRes] = await Promise.all([
      fetch(`${API_URL}/api/finance/summary`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/finance/breakdown`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    setSummary(await summaryRes.json());
    setBreakdown(await breakdownRes.json());
  }

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [token]);

  async function handleAddCategory(e) {
    e.preventDefault();
    setError('');
    if (!newCatName.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/finance/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la categoría.');
      setNewCatName('');
      setShowNewCat(false);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p className="muted center">Cargando…</p>;

  return (
    <div className="dash-wrap">
      <div className="dash-header">
        <div>
          <h1>Finanzas</h1>
          <p className="subtitle">Resumen del mes en curso · Solo lectura</p>
        </div>
      </div>

      <div className="fin-summary">
        <div className="fin-total">
          <span className="eyebrow">Total disponible</span>
          <div className="amount">{money(summary.total)}</div>
          <p className="sub">Actualizado por administración</p>
        </div>
        <div className="fin-income">
          <span className="eyebrow">Ingresos de este mes</span>
          <div className="amount">{money(summary.currentMonth)}</div>
          <p className="sub">Suma de todas las categorías</p>
        </div>
      </div>

      <div className="card">
        <h2>Desglose por categoría</h2>
        <ul className="fin-breakdown">
          {breakdown.map((cat) => (
            <li key={cat.id}>
              <span className="cat">
                <span className="swatch" style={{ background: cat.color || '#2f4d3a' }}></span>
                {cat.name}
              </span>
              <span className="amt">{money(cat.total)}</span>
            </li>
          ))}
        </ul>

        {isAdmin && (
          <>
            <button className="btn-outline" style={{ marginTop: 14, fontSize: 12 }} onClick={() => setShowNewCat((s) => !s)}>
              + Agregar categoría
            </button>
            {showNewCat && (
              <form className="new-cat-row" onSubmit={handleAddCategory}>
                <input
                  placeholder="Nombre de la nueva categoría"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
                <button className="primary" style={{ marginTop: 0, width: 'auto', padding: '0 16px' }} type="submit">
                  Crear
                </button>
              </form>
            )}
            {error && <p className="error">{error}</p>}
          </>
        )}

        <div className="readonly-note">
          🔒 {isAdmin ? 'Como administrador puedes agregar categorías y registrar montos.' : 'Solo administración puede actualizar estas cifras. Tú puedes consultarlas.'}
        </div>
      </div>
    </div>
  );
}
