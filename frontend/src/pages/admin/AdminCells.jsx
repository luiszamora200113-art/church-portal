import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AdminCells() {
  const { token, API_URL } = useAuth();
  const [cells, setCells] = useState([]);
  const [members, setMembers] = useState([]);
  const [drafts, setDrafts] = useState({}); // { [cellId]: { leader_id, meeting_day, meeting_time, location } }
  const [savedId, setSavedId] = useState(null);

  function load() {
    Promise.all([
      fetch(`${API_URL}/api/cells`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch(`${API_URL}/api/cells/members-overview`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ]).then(([cellsData, membersData]) => {
      setCells(cellsData);
      setMembers(membersData);
      const initial = {};
      cellsData.forEach((c) => {
        const leaderMember = membersData.find((m) => m.id === c.leader_id);
        initial[c.id] = {
          leader_id: c.leader_id || '',
          leader_phone: leaderMember?.phone || '',
          meeting_day: c.meeting_day || '',
          meeting_time: c.meeting_time || '',
          location: c.location || '',
        };
      });
      setDrafts(initial);
    });
  }

  useEffect(() => { load(); }, [token]);

  function updateDraft(cellId, field, value) {
    setDrafts((d) => {
      const next = { ...d, [cellId]: { ...d[cellId], [field]: value } };
      if (field === 'leader_id') {
        const m = members.find((mm) => mm.id === Number(value));
        next[cellId].leader_phone = m?.phone || '';
      }
      return next;
    });
  }

  async function save(cellId) {
    const draft = drafts[cellId];
    await fetch(`${API_URL}/api/cells/${cellId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        leader_id: draft.leader_id,
        meeting_day: draft.meeting_day,
        meeting_time: draft.meeting_time,
        location: draft.location,
      }),
    });

    // Si hay líder seleccionado, también guarda/actualiza su teléfono en su propia cuenta.
    if (draft.leader_id) {
      const leaderMember = members.find((m) => m.id === Number(draft.leader_id));
      await fetch(`${API_URL}/api/auth/members/${draft.leader_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ full_name: leaderMember.full_name, phone: draft.leader_phone }),
      });
    }

    setSavedId(cellId);
    setTimeout(() => setSavedId(null), 2000);
    load();
  }

  return (
    <div>
      <h1>Células</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        Asigna el líder, día, hora y lugar de cada célula. El teléfono del líder es el que se usa para el botón de WhatsApp — edítalo desde "Miembros" si hace falta.
      </p>

      {cells.map((cell) => {
        const draft = drafts[cell.id] || {};
        return (
          <div className="card" key={cell.id}>
            <h2>{cell.name}</h2>

            <label>Líder</label>
            <select value={draft.leader_id} onChange={(e) => updateDraft(cell.id, 'leader_id', e.target.value)}>
              <option value="">Sin líder asignado</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
            {draft.leader_id && (
              <>
                <label style={{ marginTop: 10 }}>Teléfono del líder (WhatsApp)</label>
                <input
                  value={draft.leader_phone}
                  onChange={(e) => updateDraft(cell.id, 'leader_phone', e.target.value)}
                  placeholder="Ej. 88991122"
                />
                {!draft.leader_phone && (
                  <p className="muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 10 }}>
                    Sin teléfono, el botón de WhatsApp no aparecerá para los miembros de esta célula.
                  </p>
                )}
              </>
            )}

            <div className="doc-row3" style={{ marginTop: 10 }}>
              <div>
                <label>Día de reunión</label>
                <input value={draft.meeting_day} onChange={(e) => updateDraft(cell.id, 'meeting_day', e.target.value)} placeholder="Jueves" />
              </div>
              <div>
                <label>Hora</label>
                <input value={draft.meeting_time} onChange={(e) => updateDraft(cell.id, 'meeting_time', e.target.value)} placeholder="6:00 PM" />
              </div>
              <div>
                <label>Lugar</label>
                <input value={draft.location} onChange={(e) => updateDraft(cell.id, 'location', e.target.value)} placeholder="Casa de la familia Ruiz" />
              </div>
            </div>

            <button className="primary" style={{ marginTop: 14 }} onClick={() => save(cell.id)}>Guardar</button>
            {savedId === cell.id && <span className="success" style={{ marginLeft: 12, fontSize: 13 }}>Guardado ✓</span>}
          </div>
        );
      })}
    </div>
  );
}
