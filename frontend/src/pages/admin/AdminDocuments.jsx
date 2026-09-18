import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

const TYPE_LABELS = {
  evento: 'Programa de Evento',
  culto_mensual: 'Programación del mes',
  celula: 'Programación de célula',
  escuela_dominical: 'Escuela Dominical',
  ministerio: 'Programación de Ministerio',
};

// Los campos "<algo>_user_id" y "<algo>_cumplido" son metadatos internos, no se muestran tal cual.
const isDisplayKey = (k) => !k.endsWith('_user_id') && !k.endsWith('_user_ids') && !k.endsWith('_cumplido');

export default function AdminDocuments() {
  const { token, API_URL } = useAuth();
  const [pending, setPending] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [customLabels, setCustomLabels] = useState({});
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/api/custom-templates`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((all) => setCustomLabels(Object.fromEntries(all.map((t) => [t.type_key, t.name]))))
      .catch(() => {});
    loadAssignments();
  }, [token]);

  function loadAssignments() {
    fetch(`${API_URL}/api/schedules/assignments/all`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setAssignments)
      .catch(() => {});
  }

  async function toggleCompleted(a) {
    await fetch(`${API_URL}/api/schedules/${a.schedule_id}/complete`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ field: a.field, row_id: a.row_id, completed: !a.completed }),
    });
    loadAssignments();
  }

  function typeLabel(type) {
    return TYPE_LABELS[type] || customLabels[type] || type;
  }

  function loadPending() {
    fetch(`${API_URL}/api/schedules/pending/list`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setPending)
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadPending(); }, [token]);

  async function openDetail(id) {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(id);
    const res = await fetch(`${API_URL}/api/schedules/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    setDetail(await res.json());
  }

  async function review(id, approve) {
    await fetch(`${API_URL}/api/schedules/${id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ approve, comment }),
    });
    setComment('');
    setExpanded(null);
    setDetail(null);
    loadPending();
  }

  if (loading) return <p className="muted center">Cargando…</p>;

  return (
    <div>
      <h1>Aprobaciones</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        Programas, eventos y programaciones que los miembros enviaron, esperando tu revisión.
      </p>

      {pending.length === 0 && (
        <div className="card"><p className="muted">No hay nada pendiente de aprobar por ahora.</p></div>
      )}

      {pending.map((item) => (
        <div className="doc-card open" key={item.id} style={{ marginBottom: 14 }}>
          <div className="doc-card-head" onClick={() => openDetail(item.id)}>
            <div className="doc-icon">📋</div>
            <div>
              <strong>{item.title}</strong>
              <p>{typeLabel(item.type)} · Enviado por {item.created_by_name}</p>
            </div>
            <span className="doc-chevron">▾</span>
          </div>

          {expanded === item.id && detail && (
            <div className="doc-card-body" style={{ display: 'block' }}>
              {detail.location && <p><strong>Lugar:</strong> {detail.location}</p>}
              {detail.reference_date && <p><strong>Fecha:</strong> {detail.reference_date.slice(0, 10)}</p>}
              {detail.meta && Object.keys(detail.meta).length > 0 && (
                <ul style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0' }}>
                  {Object.entries(detail.meta).filter(([k, v]) => v && isDisplayKey(k)).map(([k, v]) => (
                    <li key={k}><strong style={{ textTransform: 'capitalize' }}>{k}:</strong> {v}</li>
                  ))}
                </ul>
              )}
              {detail.rows && detail.rows.length > 0 && (
                <table className="sched-table" style={{ marginTop: 10 }}>
                  <thead>
                    <tr>{Object.keys(detail.rows[0].data).filter(isDisplayKey).map((k) => <th key={k} style={{ textTransform: 'capitalize' }}>{k}</th>)}</tr>
                  </thead>
                  <tbody>
                    {detail.rows.map((r) => (
                      <tr key={r.id}>{Object.entries(r.data).filter(([k]) => isDisplayKey(k)).map(([k, v]) => <td key={k}>{v}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              )}

              <label style={{ marginTop: 14 }}>Comentario (opcional)</label>
              <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ej. Falta confirmar el lugar" />

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="primary" style={{ marginTop: 0 }} onClick={() => review(item.id, true)}>Aprobar</button>
                <button className="btn-outline" onClick={() => review(item.id, false)}>Rechazar</button>
              </div>
            </div>
          )}
        </div>
      ))}

      <h1 style={{ marginTop: 36 }}>Privilegios asignados</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        Marca si la persona cumplió lo que se le asignó (lectura, dirigir, participación, etc.).
      </p>
      {assignments.length === 0 && (
        <div className="card"><p className="muted">Todavía no hay privilegios asignados en ninguna programación aprobada.</p></div>
      )}
      {assignments.map((a, i) => (
        <div key={i} className="member-row" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 10 }}>
          <div className="avatar">{a.user_name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            <strong>{a.user_name}</strong> — {a.label}
            <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
              "{a.schedule_title}"{a.fecha ? ` · ${new Date(a.fecha).toLocaleDateString('es-NI', { day: 'numeric', month: 'long' })}` : ''}
            </p>
          </div>
          <button
            className={a.completed ? 'primary' : 'btn-outline'}
            style={{ marginTop: 0, fontSize: 12, padding: '6px 12px', width: 'auto' }}
            onClick={() => toggleCompleted(a)}
          >
            {a.completed ? '✓ Cumplió' : 'Marcar cumplido'}
          </button>
        </div>
      ))}
    </div>
  );
}