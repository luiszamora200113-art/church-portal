import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const TYPE_SUGGESTIONS = ['Reunión de líderes', 'Junta directiva', 'Reunión de ministerios', 'Reunión pastoral'];
const STATUS = { pendiente: 'Pendiente', en_proceso: 'En proceso', cumplido: 'Cumplido' };

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Las fechas llegan como "YYYY-MM-DD": se leen como fecha local para evitar desfases de zona horaria.
const fmt = (s) =>
  s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('es-NI', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
const fmtShort = (s) =>
  s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const emptyAgreement = () => ({ description: '', responsible: '', due_date: '', status: 'pendiente' });
const emptyForm = () => ({ meeting_date: todayStr(), meeting_type: TYPE_SUGGESTIONS[0], selected: [], other: '', agreements: [emptyAgreement()] });
const isOverdue = (a) => a.due_date && a.status !== 'cumplido' && String(a.due_date).slice(0, 10) < todayStr();
const pendingCount = (m) => m.agreements.filter((a) => a.status !== 'cumplido').length;

// Registro y seguimiento de acuerdos de reuniones (líderes, junta, etc.): crear, editar, eliminar, historial y PDF.
export default function MeetingAgreements() {
  const { token, API_URL } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null = formulario cerrado
  const [editingId, setEditingId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState('todas');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const auth = { Authorization: `Bearer ${token}` };
  const json = { 'Content-Type': 'application/json', ...auth };

  function load() {
    return fetch(`${API_URL}/api/meetings`, { headers: auth })
      .then((r) => r.json())
      .then((d) => setMeetings(Array.isArray(d) ? d : []))
      .catch(() => {});
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    fetch(`${API_URL}/api/cells/roster`, { headers: auth })
      .then((r) => r.json())
      .then((d) => setRoster(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [token]);

  const rosterNames = roster.map((m) => m.full_name);

  function startNew() {
    setEditingId(null);
    setForm(emptyForm());
    setError('');
    setMsg('');
  }

  function startEdit(m) {
    setEditingId(m.id);
    setForm({
      meeting_date: m.meeting_date,
      meeting_type: m.meeting_type,
      selected: m.attendees.filter((n) => rosterNames.includes(n)),
      other: m.attendees.filter((n) => !rosterNames.includes(n)).join(', '),
      agreements: m.agreements.length
        ? m.agreements.map((a) => ({ description: a.description, responsible: a.responsible || '', due_date: a.due_date || '', status: a.status }))
        : [emptyAgreement()],
    });
    setError('');
    setMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeForm() {
    setForm(null);
    setEditingId(null);
    setError('');
  }

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleAttendee = (name) =>
    setForm((f) => ({ ...f, selected: f.selected.includes(name) ? f.selected.filter((n) => n !== name) : [...f.selected, name] }));
  const updateAgreement = (i, k, v) =>
    setForm((f) => ({ ...f, agreements: f.agreements.map((a, idx) => (idx === i ? { ...a, [k]: v } : a)) }));
  const addAgreement = () => setForm((f) => ({ ...f, agreements: [...f.agreements, emptyAgreement()] }));
  const removeAgreement = (i) =>
    setForm((f) => ({ ...f, agreements: f.agreements.length > 1 ? f.agreements.filter((_, idx) => idx !== i) : [emptyAgreement()] }));

  async function save(e) {
    e.preventDefault();
    setError('');
    if (!form.meeting_date) return setError('Indica la fecha de la reunión.');
    if (!form.meeting_type.trim()) return setError('Indica el tipo de reunión.');
    const agreements = form.agreements.filter((a) => a.description.trim());
    if (agreements.length === 0) return setError('Agrega al menos un acuerdo.');
    const extra = form.other.split(',').map((s) => s.trim()).filter(Boolean);
    const body = {
      meeting_date: form.meeting_date,
      meeting_type: form.meeting_type.trim(),
      attendees: [...form.selected, ...extra],
      agreements,
    };
    const res = await fetch(editingId ? `${API_URL}/api/meetings/${editingId}` : `${API_URL}/api/meetings`, {
      method: editingId ? 'PUT' : 'POST',
      headers: json,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || 'No se pudo guardar.');
    closeForm();
    setMsg(editingId ? 'Reunión actualizada.' : 'Reunión registrada.');
    setExpanded(data.id);
    load();
  }

  async function changeStatus(m, a, status) {
    setMeetings((list) =>
      list.map((x) => (x.id === m.id ? { ...x, agreements: x.agreements.map((y) => (y.id === a.id ? { ...y, status } : y)) } : x))
    );
    const res = await fetch(`${API_URL}/api/meetings/${m.id}/agreements/${a.id}`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ status }),
    });
    if (!res.ok) load(); // si falló, vuelve al estado real del servidor
  }

  async function doDelete() {
    const m = confirmDelete;
    setConfirmDelete(null);
    const res = await fetch(`${API_URL}/api/meetings/${m.id}`, { method: 'DELETE', headers: auth });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'No se pudo eliminar.');
      return;
    }
    setMeetings((list) => list.filter((x) => x.id !== m.id));
    setExpanded(null);
    setMsg('Reunión eliminada.');
  }

  async function downloadPdf(m) {
    const res = await fetch(`${API_URL}/api/reports/acuerdos/${m.id}.pdf`, { headers: auth });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'No se pudo generar el PDF.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `acuerdos-${m.meeting_date}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const visible = meetings.filter((m) => {
    if (filter === 'pendientes') return pendingCount(m) > 0;
    if (filter === 'cumplidas') return m.agreements.length > 0 && pendingCount(m) === 0;
    return true;
  });

  return (
    <div>
      <h1>Acuerdos de reuniones</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        Registra los acuerdos de cada reunión, asigna responsables y fechas límite, y da seguimiento hasta que se cumplan.
      </p>

      {msg && <p className="success" style={{ marginBottom: 14 }}>{msg}</p>}
      {!form && error && <p className="error" style={{ marginBottom: 14 }}>{error}</p>}

      {!form && (
        <button className="primary" style={{ width: 'auto', padding: '10px 18px', marginTop: 0, marginBottom: 18 }} onClick={startNew}>
          + Nueva reunión
        </button>
      )}

      {form && (
        <form className="card" onSubmit={save}>
          <h2>{editingId ? 'Editar reunión' : 'Nueva reunión'}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label>Fecha de la reunión</label>
              <input type="date" value={form.meeting_date} onChange={(e) => setField('meeting_date', e.target.value)} required />
            </div>
            <div>
              <label>Tipo de reunión</label>
              <input list="meeting-types" value={form.meeting_type} onChange={(e) => setField('meeting_type', e.target.value)} placeholder="Ej. Reunión de líderes" />
              <datalist id="meeting-types">{TYPE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
          </div>

          <label>Asistentes</label>
          <div className="member-picker">
            <div className="member-picker-bar">
              <span>{form.selected.length} de {roster.length} seleccionado(s)</span>
              <span className="actions">
                <button type="button" className="btn-outline" onClick={() => setField('selected', rosterNames)}>Seleccionar todos</button>
                <button type="button" className="btn-outline" onClick={() => setField('selected', [])}>Limpiar</button>
              </span>
            </div>
            <div className="member-picker-list">
              {roster.length === 0 && <p className="member-picker-empty">No hay miembros para elegir.</p>}
              {roster.map((m) => (
                <label key={m.id} className={`member-option ${form.selected.includes(m.full_name) ? 'checked' : ''}`}>
                  <input type="checkbox" checked={form.selected.includes(m.full_name)} onChange={() => toggleAttendee(m.full_name)} />
                  <span className="who"><strong>{m.full_name}</strong></span>
                </label>
              ))}
            </div>
          </div>
          <label>Otros asistentes (opcional, separados por coma)</label>
          <input value={form.other} onChange={(e) => setField('other', e.target.value)} placeholder="Ej. Hno. Pedro Ruiz, Visitante" />

          <label>Acuerdos</label>
          <div className="table-scroll">
            <table className="sched-table wrap-table">
              <thead><tr><th>Acuerdo</th><th>Responsable</th><th>Fecha límite</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {form.agreements.map((a, i) => (
                  <tr key={i}>
                    <td style={{ minWidth: 220 }}>
                      <textarea className="cell-textarea" rows={2} value={a.description} onChange={(e) => updateAgreement(i, 'description', e.target.value)} placeholder="Descripción del acuerdo" />
                    </td>
                    <td style={{ minWidth: 150 }}>
                      <input list="meeting-people" value={a.responsible} onChange={(e) => updateAgreement(i, 'responsible', e.target.value)} placeholder="Responsable" />
                    </td>
                    <td style={{ minWidth: 140 }}>
                      <input type="date" value={a.due_date} onChange={(e) => updateAgreement(i, 'due_date', e.target.value)} />
                    </td>
                    <td style={{ minWidth: 130 }}>
                      <select value={a.status} onChange={(e) => updateAgreement(i, 'status', e.target.value)}>
                        {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="btn-outline" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => removeAgreement(i)} aria-label="Quitar acuerdo">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <datalist id="meeting-people">{rosterNames.map((n) => <option key={n} value={n} />)}</datalist>
          <button type="button" className="btn-outline" style={{ marginTop: 8, fontSize: 12 }} onClick={addAgreement}>+ Agregar acuerdo</button>

          {error && <p className="error">{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="primary" type="submit" style={{ width: 'auto', padding: '10px 22px', marginTop: 0 }}>{editingId ? 'Guardar cambios' : 'Guardar reunión'}</button>
            <button type="button" className="btn-outline" onClick={closeForm}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Historial ({visible.length})</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 240 }}>
            <option value="todas">Todas las reuniones</option>
            <option value="pendientes">Con acuerdos pendientes</option>
            <option value="cumplidas">Con todo cumplido</option>
          </select>
        </div>

        {loading && <p className="muted">Cargando…</p>}
        {!loading && visible.length === 0 && <p className="muted">No hay reuniones registradas en esta vista.</p>}

        {visible.map((m) => {
          const open = expanded === m.id;
          const pend = pendingCount(m);
          return (
            <div key={m.id} className={`doc-card ${open ? 'open' : ''}`}>
              <div className="doc-card-head" onClick={() => setExpanded(open ? null : m.id)}>
                <div className="doc-icon">📝</div>
                <div>
                  <strong>{m.meeting_type} — {fmt(m.meeting_date)}</strong>
                  <p>{m.agreements.length} acuerdo(s) · {pend === 0 ? 'todo cumplido' : `${pend} pendiente(s)`}</p>
                </div>
                <span className="doc-chevron">▾</span>
              </div>

              {open && (
                <div className="doc-card-body" style={{ display: 'block' }}>
                  <p style={{ fontSize: 13 }}>
                    <strong>Asistentes ({m.attendees.length}):</strong> {m.attendees.length ? m.attendees.join(', ') : 'Sin registrar'}
                  </p>

                  {m.agreements.length > 0 && (
                    <div className="table-scroll">
                      <table className="sched-table wrap-table" style={{ marginTop: 8 }}>
                        <thead><tr><th>#</th><th>Acuerdo</th><th>Responsable</th><th>Fecha límite</th><th>Estado</th></tr></thead>
                        <tbody>
                          {m.agreements.map((a, i) => (
                            <tr key={a.id}>
                              <td>{i + 1}</td>
                              <td>{a.description}</td>
                              <td>{a.responsible || '—'}</td>
                              <td>
                                {fmtShort(a.due_date)}
                                {isOverdue(a) && <span className="badge-status vencido">Vencido</span>}
                              </td>
                              <td style={{ minWidth: 130 }}>
                                <select className={`status-select ${a.status}`} value={a.status} onChange={(e) => changeStatus(m, a, e.target.value)}>
                                  {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <button className="btn-outline" style={{ fontSize: 12 }} onClick={() => downloadPdf(m)}>📄 Descargar PDF</button>
                    <button className="btn-outline" style={{ fontSize: 12 }} onClick={() => startEdit(m)}>✏️ Editar</button>
                    <button className="btn-outline" style={{ fontSize: 12, color: '#b23b3b', borderColor: '#b23b3b' }} onClick={() => setConfirmDelete(m)}>🗑️ Eliminar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-box" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>¿Eliminar esta reunión?</h2>
            <p className="muted" style={{ margin: '10px 0 4px', fontSize: 14 }}>
              <strong>{confirmDelete.meeting_type} — {fmt(confirmDelete.meeting_date)}</strong>
            </p>
            <p className="muted" style={{ fontSize: 13 }}>
              Se borrarán también sus {confirmDelete.agreements.length} acuerdo(s). Esta acción no se puede deshacer.
            </p>
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn-danger" onClick={doDelete}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
