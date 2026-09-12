import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Duties() {
  const { token, API_URL } = useAuth();
  const [duties, setDuties] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadDuties() {
    const res = await fetch(`${API_URL}/api/duties/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setDuties(await res.json());
  }

  useEffect(() => {
    loadDuties().finally(() => setLoading(false));
  }, [token]);

  async function toggle(id) {
    // Actualización optimista para que se sienta inmediato al tocar.
    setDuties((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: d.status === 'done' ? 'pending' : 'done' } : d))
    );
    await fetch(`${API_URL}/api/duties/${id}/toggle`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    loadDuties();
  }

  if (loading) return <p className="muted center">Cargando…</p>;

  const done = duties.filter((d) => d.status === 'done').length;

  return (
    <div className="dash-wrap">
      <div className="dash-header">
        <div>
          <h1>Mis deberes como cristiano</h1>
          <p className="subtitle">{done} de {duties.length} completados</p>
        </div>
      </div>

      <div className="card">
        <ul className="duty-list-full">
          {duties.map((d) => (
            <li key={d.id} className={`duty-item ${d.status === 'done' ? 'done' : ''}`} onClick={() => toggle(d.id)}>
              <span className="duty-check">{d.status === 'done' ? '✓' : ''}</span>
              <div>
                <strong>{d.title}</strong>
                {d.description && <p>{d.description}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
