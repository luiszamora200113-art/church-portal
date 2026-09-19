import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

const FIELD_TYPES = [
  { value: 'texto', label: 'Texto libre' },
  { value: 'fecha', label: 'Fecha' },
  { value: 'miembro', label: 'Elegir un miembro' },
  { value: 'miembros', label: 'Elegir varios miembros' },
];

function emptyField() {
  return { key: '', label: '', type: 'texto' };
}
function defaultFields() {
  return [
    { key: 'fecha', label: 'Fecha', type: 'fecha' },
    { key: 'servicio', label: 'Servicio', type: 'texto' },
    { key: 'miembros', label: 'Sirven', type: 'miembros' },
    { key: 'notas', label: 'Notas', type: 'texto' },
  ];
}

function FieldBuilder({ fields, setFields }) {
  function updateField(i, patch) {
    const copy = [...fields];
    copy[i] = { ...copy[i], ...patch };
    if (patch.label !== undefined) {
      copy[i].key = patch.label.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }
    setFields(copy);
  }
  function removeField(i) {
    setFields(fields.filter((_, idx) => idx !== i));
  }

  return (
    <div style={{ marginTop: 14 }}>
      <label>Columnas de la programación mensual</label>
      <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
        Arma las columnas exactas que ya usan en papel — ej. "Dirige", "Coro", "Cantos", "Batería", "Bajo".
      </p>
      {fields.map((f, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input
            style={{ flex: 2 }}
            placeholder="Nombre de la columna (ej. Dirige)"
            value={f.label}
            onChange={(e) => updateField(i, { label: e.target.value })}
          />
          <select style={{ flex: 1 }} value={f.type} onChange={(e) => updateField(i, { type: e.target.value })}>
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button type="button" className="btn-outline" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => removeField(i)}>✕</button>
        </div>
      ))}
      <button type="button" className="btn-outline" style={{ fontSize: 12 }} onClick={() => setFields([...fields, emptyField()])}>
        + Agregar columna
      </button>
    </div>
  );
}

export default function AdminMinistries() {
  const { token, API_URL } = useAuth();
  const [ministries, setMinistries] = useState([]);
  const [roster, setRoster] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🙏');
  const [rowFields, setRowFields] = useState(defaultFields());
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

  function resetForm() {
    setEditingId(null);
    setName(''); setDescription(''); setIcon('🙏'); setRowFields(defaultFields());
    setError('');
  }

  function startEdit(m) {
    setEditingId(m.id);
    setName(m.name);
    setDescription(m.description || '');
    setIcon(m.icon);
    setRowFields(m.row_fields && m.row_fields.length > 0 ? m.row_fields : defaultFields());
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('El nombre es requerido.');
    const body = { name, description, icon, row_fields: rowFields.filter((f) => f.label.trim()) };

    const res = await fetch(
      editingId ? `${API_URL}/api/ministries/${editingId}` : `${API_URL}/api/ministries`,
      {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    if (!res.ok) return setError(data.error || 'No se pudo guardar.');
    resetForm();
    load();
  }

  async function removeMinistry(id) {
    if (!window.confirm('¿Borrar este ministerio? Sus programaciones ya enviadas se conservan.')) return;
    await fetch(`${API_URL}/api/ministries/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (editingId === id) resetForm();
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
        Cada ministerio puede tener sus propias columnas (igual al formato que ya usan en papel) y uno o más líderes. Un líder solo puede programar el ministerio que le asignes aquí — nadie más.
      </p>

      <form className="card" onSubmit={handleSubmit}>
        <h2>{editingId ? 'Editar ministerio' : 'Nuevo ministerio'}</h2>
        <label>Nombre</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ujieres" />
        <label>Descripción (opcional)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Recepción y orden en el templo" />
        <label>Ícono (un emoji)</label>
        <input value={icon} onChange={(e) => setIcon(e.target.value)} style={{ maxWidth: 80 }} />

        <FieldBuilder fields={rowFields} setFields={setRowFields} />

        {error && <p className="error">{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="primary" type="submit">{editingId ? 'Guardar cambios' : '+ Crear ministerio'}</button>
          {editingId && <button type="button" className="btn-outline" onClick={resetForm}>Cancelar edición</button>}
        </div>
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
                <p className="muted" style={{ fontSize: 11, margin: '2px 0 0' }}>
                  Columnas: {(m.row_fields || []).map((f) => f.label).join(' · ')}
                </p>
              </div>
              <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => startEdit(m)}>Editar</button>
              <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => removeMinistry(m.id)}>Borrar</button>
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
