import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AdminMinistries() {
  const { token, API_URL } = useAuth();
  const [ministries, setMinistries] = useState([]);
  const [roster, setRoster] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🙏');
  const [error, setError] = useState('');
  const [addingLeaderTo, setAddingLeaderTo] = useState(null);
  const [pickedLeader, setPickedLeader] = useState('');

  function load() {
    fetch(`${API_URL}/api/ministries`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setMinistries)
      .catch(() => {});
    fetch(`${API_URL}/api/cells/roster`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setRoster)
      .catch(() => {});
  }

  useEffect(() => { load(); }, [token]);

  async function createMinistry(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('El nombre es requerido.');
    const res = await fetch(`${API_URL}/api/ministries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, description, icon }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || 'No se pudo crear.');
    setName(''); setDescription(''); setIcon('🙏');
    load();
  }

  async function removeMinistry(id) {
    if (!window.confirm('¿Borrar este ministerio? Sus programaciones ya enviadas se conservan.')) return;
    await fetch(`${API_URL}/api/ministries/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    load();
  }

  async function addLeader(ministryId) {
    if (!pickedLeader) return;
    await fetch(`${API_URL}/api/ministries/${ministryId}/leaders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user_id: pickedLeader }),
    });
    setPickedLeader('');
    setAddingLeaderTo(null);
    load();
  }

  async function removeLeader(ministryId, userId) {
    await fetch(`${API_URL}/api/ministries/${ministryId}/leaders/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  }

  return (
    <div>
      <h1>Ministerios</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        Cada ministerio puede tener uno o más líderes. Un líder solo puede programar el ministerio que le asignes aquí — nadie más.
      </p>

      <form className="card" onSubmit={createMinistry}>
        <h2>Nuevo ministerio</h2>
        <label>Nombre</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ujieres" />
        <label>Descripción (opcional)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Recepción y orden en el templo" />
        <label>Ícono (un emoji)</label>
        <input value={icon} onChange={(e) => setIcon(e.target.value)} style={{ maxWidth: 80 }} />
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">+ Crear ministerio</button>
      </form>

      <div className="card">
        <h2>Ministerios existentes</h2>
        {ministries.length === 0 && <p className="muted">Aún no has creado ningún ministerio.</p>}
        {ministries.map((m) => (
          <div key={m.id} style={{ borderBottom: '1px solid var(--line)', padding: '14px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{m.icon}</span>
              <div style={{ flex: 1 }}>
                <strong>{m.name}</strong>
                {m.description && <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>{m.description}</p>}
              </div>
              <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => removeMinistry(m.id)}>
                Borrar
              </button>
            </div>

            <div style={{ marginTop: 10, paddingLeft: 28 }}>
              <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Líderes:</p>
              {m.leaders.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Sin líder asignado todavía.</p>}
              {m.leaders.map((l) => (
                <span
                  key={l.id}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--paper)', borderRadius: 999, padding: '4px 10px', fontSize: 13, marginRight: 8, marginBottom: 6 }}
                >
                  {l.full_name}
                  <button
                    onClick={() => removeLeader(m.id, l.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, fontSize: 13 }}
                  >
                    ✕
                  </button>
                </span>
              ))}

              {addingLeaderTo === m.id ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <select value={pickedLeader} onChange={(e) => setPickedLeader(e.target.value)} style={{ maxWidth: 220 }}>
                    <option value="">Elegir miembro…</option>
                    {roster.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                  </select>
                  <button className="primary" style={{ marginTop: 0, width: 'auto', padding: '8px 14px', fontSize: 13 }} onClick={() => addLeader(m.id)}>
                    Agregar
                  </button>
                  <button className="btn-outline" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => { setAddingLeaderTo(null); setPickedLeader(''); }}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button className="btn-outline" style={{ fontSize: 12, marginTop: 4 }} onClick={() => setAddingLeaderTo(m.id)}>
                  + Agregar líder
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
