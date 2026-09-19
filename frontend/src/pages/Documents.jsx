import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const emptyEventRow = () => ({ bloque: '', hora: '', actividad: '', participante: '', participante_user_id: '', notas: '' });
const emptyCultoRow = () => ({ fecha: '', lectura: '', lectura_user_id: '', cita: '', predica: '', predica_user_id: '', especial: '' });

function Accordion({ title, subtitle, icon, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`doc-card ${open ? 'open' : ''}`}>
      <div className="doc-card-head" onClick={() => setOpen((o) => !o)}>
        <div className="doc-icon">{icon}</div>
        <div>
          <strong>{title}</strong>
          <p>{subtitle}</p>
        </div>
        <span className="doc-chevron">▾</span>
      </div>
      <div className="doc-card-body">{children}</div>
    </div>
  );
}

function CustomTemplateForm({ template, roster, token, API_URL }) {
  const emptyHeader = () => Object.fromEntries(
    template.header_fields.flatMap((f) => {
      if (f.type === 'miembro') return [[f.key, ''], [`${f.key}_user_id`, '']];
      if (f.type === 'miembros') return [[f.key, ''], [`${f.key}_user_ids`, []]];
      return [[f.key, '']];
    })
  );
  const emptyRow = () => Object.fromEntries(
    template.row_fields.flatMap((f) => {
      if (f.type === 'miembro') return [[f.key, ''], [`${f.key}_user_id`, '']];
      if (f.type === 'miembros') return [[f.key, ''], [`${f.key}_user_ids`, []]];
      return [[f.key, '']];
    })
  );

  const [title, setTitle] = useState('');
  const [header, setHeader] = useState(emptyHeader());
  const [rows, setRows] = useState(template.row_fields.length > 0 ? [emptyRow(), emptyRow()] : []);
  const [msg, setMsg] = useState('');

  function updateHeaderField(field, f) {
    if (f.type === 'miembro') {
      const m = roster.find((r) => r.id === Number(field));
      setHeader((h) => ({ ...h, [f.key]: m ? m.full_name : '', [`${f.key}_user_id`]: field }));
    } else {
      setHeader((h) => ({ ...h, [f.key]: field }));
    }
  }

  function toggleHeaderMulti(f, memberId) {
    setHeader((h) => {
      const current = h[`${f.key}_user_ids`] || [];
      const next = current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId];
      const names = roster.filter((m) => next.includes(m.id)).map((m) => m.full_name).join(', ');
      return { ...h, [f.key]: names, [`${f.key}_user_ids`]: next };
    });
  }

  function updateRowField(idx, f, value) {
    const copy = [...rows];
    if (f.type === 'miembro') {
      const m = roster.find((r) => r.id === Number(value));
      copy[idx] = { ...copy[idx], [f.key]: m ? m.full_name : '', [`${f.key}_user_id`]: value };
    } else {
      copy[idx] = { ...copy[idx], [f.key]: value };
    }
    setRows(copy);
  }

  function renderField(f, value, onChange) {
    if (f.type === 'fecha') return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
    if (f.type === 'miembro') {
      return (
        <select value={header[`${f.key}_user_id`] || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Elegir miembro…</option>
          {roster.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
      );
    }
    if (f.type === 'miembros') {
      const selected = header[`${f.key}_user_ids`] || [];
      return (
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', maxHeight: 220, overflowY: 'auto' }}>
          {roster.map((m) => (
            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 14, padding: '4px 0' }}>
              <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggleHeaderMulti(f, m.id)} />
              {m.full_name}
            </label>
          ))}
          {selected.length > 0 && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{selected.length} seleccionado(s): {header[f.key]}</p>
          )}
        </div>
      );
    }
    return <input value={value} onChange={(e) => onChange(e.target.value)} />;
  }

  async function handleSubmit() {
    setMsg('Enviando…');
    try {
      const res = await fetch(`${API_URL}/api/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: template.type_key, title: title || template.name, meta: header, rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar.');
      setMsg('Enviado. Quedó pendiente de aprobación del pastor.');
      setTitle(''); setHeader(emptyHeader()); setRows(template.row_fields.length > 0 ? [emptyRow(), emptyRow()] : []);
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <>
      <label>Título</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={template.name} />

      {template.header_fields.map((f) => (
        <React.Fragment key={f.key}>
          <label>{f.label}</label>
          {renderField(f, header[f.key], (v) => updateHeaderField(v, f))}
        </React.Fragment>
      ))}

      {template.row_fields.length > 0 && (
        <>
          <label style={{ marginTop: 14 }}>Tabla</label>
          <table className="sched-table" style={{ marginTop: 6 }}>
            <thead><tr>{template.row_fields.map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {template.row_fields.map((f) => (
                    <td key={f.key}>
                      {f.type === 'miembro' ? (
                        <select value={row[`${f.key}_user_id`] || ''} onChange={(e) => updateRowField(i, f, e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 13 }}>
                          <option value="">Elegir miembro…</option>
                          {roster.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                        </select>
                      ) : (
                        <input
                          type={f.type === 'fecha' ? 'date' : 'text'}
                          value={row[f.key] || ''}
                          onChange={(e) => updateRowField(i, f, e.target.value)}
                          style={{ border: 'none', background: 'transparent', padding: 0 }}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-outline" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setRows((r) => [...r, emptyRow()])}>
            + Agregar fila
          </button>
        </>
      )}

      {msg && <p className={msg.startsWith('Enviado') ? 'success' : 'error'}>{msg}</p>}
      <button className="primary" style={{ marginTop: 16 }} onClick={handleSubmit}>Enviar para aprobación</button>
    </>
  );
}

function MinistryScheduleForm({ ministry, roster, token, API_URL }) {
  const fields = ministry.row_fields && ministry.row_fields.length > 0
    ? ministry.row_fields
    : [
        { key: 'fecha', label: 'Fecha', type: 'fecha' },
        { key: 'servicio', label: 'Servicio', type: 'texto' },
        { key: 'miembros', label: 'Sirven', type: 'miembros' },
        { key: 'notas', label: 'Notas', type: 'texto' },
      ];

  const emptyRow = () => Object.fromEntries(
    fields.flatMap((f) => {
      if (f.type === 'miembro') return [[f.key, ''], [`${f.key}_user_id`, '']];
      if (f.type === 'miembros') return [[f.key, ''], [`${f.key}_user_ids`, []]];
      return [[f.key, '']];
    })
  );

  const [form, setForm] = useState({ title: '', reference_date: '' });
  const [rows, setRows] = useState([emptyRow(), emptyRow()]);
  const [msg, setMsg] = useState('');

  function updateRow(idx, field, value) {
    const copy = [...rows];
    copy[idx] = { ...copy[idx], [field]: value };
    setRows(copy);
  }

  function updateRowMember(idx, f, memberId) {
    const m = roster.find((r) => r.id === Number(memberId));
    const copy = [...rows];
    copy[idx] = { ...copy[idx], [f.key]: m ? m.full_name : '', [`${f.key}_user_id`]: memberId };
    setRows(copy);
  }

  function toggleRowMembers(idx, f, memberId) {
    setRows((r) => {
      const copy = [...r];
      const current = copy[idx][`${f.key}_user_ids`] || [];
      const next = current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId];
      const names = roster.filter((m) => next.includes(m.id)).map((m) => m.full_name).join(', ');
      copy[idx] = { ...copy[idx], [f.key]: names, [`${f.key}_user_ids`]: next };
      return copy;
    });
  }

  async function handleSubmit() {
    setMsg('Enviando…');
    try {
      const res = await fetch(`${API_URL}/api/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: 'ministerio', ministry_id: ministry.id, title: form.title, reference_date: form.reference_date || null, rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar.');
      setMsg('Enviado. Quedó pendiente de aprobación del pastor.');
      setForm({ title: '', reference_date: '' });
      setRows([emptyRow(), emptyRow()]);
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <>
      <label>Título (ej. Programa {ministry.name} — Octubre 2026)</label>
      <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      <label>Mes que cubre</label>
      <input type="date" value={form.reference_date} onChange={(e) => setForm((f) => ({ ...f, reference_date: e.target.value }))} />

      <label style={{ marginTop: 14 }}>Programación</label>
      <table className="sched-table" style={{ marginTop: 6 }}>
        <thead><tr>{fields.map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {fields.map((f) => (
                <td key={f.key}>
                  {f.type === 'fecha' && (
                    <input type="date" value={row[f.key] || ''} onChange={(e) => updateRow(i, f.key, e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0 }} />
                  )}
                  {f.type === 'texto' && (
                    <input value={row[f.key] || ''} onChange={(e) => updateRow(i, f.key, e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0 }} />
                  )}
                  {f.type === 'miembro' && (
                    <select value={row[`${f.key}_user_id`] || ''} onChange={(e) => updateRowMember(i, f, e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 13 }}>
                      <option value="">Elegir…</option>
                      {roster.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                    </select>
                  )}
                  {f.type === 'miembros' && (
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: 13 }}>{row[f.key] || 'Elegir…'}</summary>
                      <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8, marginTop: 4, background: 'var(--card)' }}>
                        {roster.map((m) => (
                          <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '3px 0' }}>
                            <input type="checkbox" checked={(row[`${f.key}_user_ids`] || []).includes(m.id)} onChange={() => toggleRowMembers(i, f, m.id)} />
                            {m.full_name}
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn-outline" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setRows((r) => [...r, emptyRow()])}>
        + Agregar fila
      </button>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Al aprobarse, cada persona que elijas recibe notificación y le aparece en su "Mis privilegios".
      </p>

      {msg && <p className={msg.startsWith('Enviado') ? 'success' : 'error'}>{msg}</p>}
      <button className="primary" style={{ marginTop: 16 }} onClick={handleSubmit}>Enviar para aprobación</button>
    </>
  );
}

export default function Documents() {
  const { user, token, API_URL } = useAuth();

  // --- Plantillas personalizadas creadas por el superadmin ---
  const [customTemplates, setCustomTemplates] = useState([]);
  const [roster, setRoster] = useState([]);
  const [myMinistries, setMyMinistries] = useState([]);
  useEffect(() => {
    fetch(`${API_URL}/api/custom-templates`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((all) => {
        const isPrivileged = ['admin', 'superadmin'].includes(user?.role);
        setCustomTemplates(all.filter((t) => isPrivileged || !t.allowed_roles || t.allowed_roles.includes(user?.role)));
      })
      .catch(() => {});
    fetch(`${API_URL}/api/cells/roster`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setRoster)
      .catch(() => {});
    fetch(`${API_URL}/api/ministries/mine`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setMyMinistries)
      .catch(() => {});
  }, [token]);

  // --- Programación de la célula ---
  const emptyCellRow = () => ({ fecha: '', dirige: '', dirige_user_id: '', reflexion: '', reflexion_user_id: '', lectura: '', lectura_user_id: '', observacion: '', especial: '' });
  const [cellForm, setCellForm] = useState({ title: '', reference_date: '' });
  const [cellRows, setCellRows] = useState([emptyCellRow(), emptyCellRow()]);
  const [cellMsg, setCellMsg] = useState('');

  function updateCellAssignee(idx, field, memberId) {
    const member = roster.find((m) => m.id === Number(memberId));
    const copy = [...cellRows];
    copy[idx] = { ...copy[idx], [`${field}_user_id`]: memberId, [field]: member ? member.full_name : '' };
    setCellRows(copy);
  }

  // --- Programa de Evento Especial ---
  const [eventForm, setEventForm] = useState({ title: '', reference_date: '', location: '' });
  const [eventMeta, setEventMeta] = useState({ maestro_ceremonia: '', maestro_ceremonia_user_id: '', hora_inicio: '', hora_fin: '', celula: '', recursos: '', observaciones: '' });
  const [eventRows, setEventRows] = useState([emptyEventRow(), emptyEventRow()]);
  const [eventMsg, setEventMsg] = useState('');

  function updateEventAssignee(memberId) {
    const member = roster.find((m) => m.id === Number(memberId));
    setEventMeta((m) => ({ ...m, maestro_ceremonia_user_id: memberId, maestro_ceremonia: member ? member.full_name : '' }));
  }

  function updateEventRowAssignee(idx, memberId) {
    const member = roster.find((m) => m.id === Number(memberId));
    const copy = [...eventRows];
    copy[idx] = { ...copy[idx], participante_user_id: memberId, participante: member ? member.full_name : '' };
    setEventRows(copy);
  }

  // --- Programación del mes ---
  const canFillCulto = ['admin', 'superadmin', 'secretary'].includes(user?.role);
  const [members, setMembers] = useState([]);
  const [cultoForm, setCultoForm] = useState({ title: '', reference_date: '' });
  const [cultoRows, setCultoRows] = useState([emptyCultoRow(), emptyCultoRow()]);
  const [cultoMsg, setCultoMsg] = useState('');

  useEffect(() => {
    if (!canFillCulto) return;
    fetch(`${API_URL}/api/cells/members-overview`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setMembers)
      .catch(() => {});
  }, [canFillCulto, token]);

  function updateCultoAssignee(idx, field, memberId) {
    const member = members.find((m) => m.id === Number(memberId));
    const copy = [...cultoRows];
    copy[idx] = { ...copy[idx], [`${field}_user_id`]: memberId, [field]: member ? member.full_name : '' };
    setCultoRows(copy);
  }

  function updateRow(rows, setRows, idx, field, value) {
    const copy = [...rows];
    copy[idx] = { ...copy[idx], [field]: value };
    setRows(copy);
  }

  async function submitSchedule(type, body, setMsg, resetForm) {
    setMsg('Enviando…');
    try {
      const res = await fetch(`${API_URL}/api/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar.');
      setMsg('Enviado. Quedó pendiente de aprobación del pastor.');
      resetForm();
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div className="dash-wrap">
      <div className="dash-header">
        <div>
          <h1>Documentos</h1>
          <p className="subtitle">Toca una plantilla para llenarla directo aquí</p>
        </div>
      </div>

      <Accordion title="Programa de Evento Especial" subtitle="Llénalo y envíalo para aprobación del pastor" icon="📋">
        <label>Nombre del evento</label>
        <input value={eventForm.title} onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ej. Media Vigilia" />
        <div className="doc-row3">
          <div><label>Fecha</label><input type="date" value={eventForm.reference_date} onChange={(e) => setEventForm((f) => ({ ...f, reference_date: e.target.value }))} /></div>
          <div><label>Inicia</label><input value={eventMeta.hora_inicio} onChange={(e) => setEventMeta((m) => ({ ...m, hora_inicio: e.target.value }))} placeholder="7:00 pm" /></div>
          <div><label>Finaliza</label><input value={eventMeta.hora_fin} onChange={(e) => setEventMeta((m) => ({ ...m, hora_fin: e.target.value }))} placeholder="11:00 pm" /></div>
        </div>
        <label>Lugar</label>
        <input value={eventForm.location} onChange={(e) => setEventForm((f) => ({ ...f, location: e.target.value }))} placeholder="Templo principal" />
        <label>Maestro de Ceremonia</label>
        <select value={eventMeta.maestro_ceremonia_user_id} onChange={(e) => updateEventAssignee(e.target.value)}>
          <option value="">Elegir miembro…</option>
          {roster.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
        <label>Célula / ministerio responsable</label>
        <input value={eventMeta.celula} onChange={(e) => setEventMeta((m) => ({ ...m, celula: e.target.value }))} />

        <label style={{ marginTop: 14 }}>Orden del programa</label>
        <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
          Para dividir el programa en bloques, escribe el nombre del bloque (ej. "BLOQUE 1") y deja el resto de esa fila vacío.
        </p>
        <table className="sched-table" style={{ marginTop: 6 }}>
          <thead><tr><th>Bloque</th><th>Hora</th><th>Actividad</th><th>Participante</th><th>Cantos / Notas</th></tr></thead>
          <tbody>
            {eventRows.map((row, i) => (
              <tr key={i}>
                <td><input value={row.bloque} onChange={(e) => updateRow(eventRows, setEventRows, i, 'bloque', e.target.value)} placeholder="BLOQUE 1" style={{ border: 'none', background: 'transparent', padding: 0 }} /></td>
                <td><input value={row.hora} onChange={(e) => updateRow(eventRows, setEventRows, i, 'hora', e.target.value)} placeholder="7:00 a 7:10" style={{ border: 'none', background: 'transparent', padding: 0 }} /></td>
                <td><input value={row.actividad} onChange={(e) => updateRow(eventRows, setEventRows, i, 'actividad', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0 }} /></td>
                <td>
                  <select value={row.participante_user_id} onChange={(e) => updateEventRowAssignee(i, e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 13 }}>
                    <option value="">Elegir…</option>
                    {roster.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </td>
                <td><input value={row.notas} onChange={(e) => updateRow(eventRows, setEventRows, i, 'notas', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0 }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn-outline" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setEventRows((r) => [...r, emptyEventRow()])}>
          + Agregar fila
        </button>

        <label style={{ marginTop: 14 }}>Recursos necesarios</label>
        <input value={eventMeta.recursos} onChange={(e) => setEventMeta((m) => ({ ...m, recursos: e.target.value }))} placeholder="Sonido, sillas, decoración..." />
        <label>Observaciones</label>
        <input value={eventMeta.observaciones} onChange={(e) => setEventMeta((m) => ({ ...m, observaciones: e.target.value }))} placeholder="Opcional" />

        {eventMsg && <p className={eventMsg.startsWith('Enviado') ? 'success' : 'error'}>{eventMsg}</p>}
        <button
          className="primary"
          style={{ marginTop: 16 }}
          onClick={() =>
            submitSchedule(
              'evento',
              { title: eventForm.title, reference_date: eventForm.reference_date || null, location: eventForm.location, meta: eventMeta, rows: eventRows },
              setEventMsg,
              () => {
                setEventForm({ title: '', reference_date: '', location: '' });
                setEventMeta({ maestro_ceremonia: '', maestro_ceremonia_user_id: '', hora_inicio: '', hora_fin: '', celula: '', recursos: '', observaciones: '' });
                setEventRows([emptyEventRow(), emptyEventRow()]);
              }
            )
          }
        >
          Enviar para aprobación
        </button>
      </Accordion>

      {canFillCulto && (
        <Accordion title="Programación del mes" subtitle="Horario de cultos: fecha, lectura, cita y predicador" icon="📖">
          <label>Título (ej. Programación de Cultos — Septiembre 2026)</label>
          <input value={cultoForm.title} onChange={(e) => setCultoForm((f) => ({ ...f, title: e.target.value }))} />
          <label>Mes que cubre</label>
          <input type="date" value={cultoForm.reference_date} onChange={(e) => setCultoForm((f) => ({ ...f, reference_date: e.target.value }))} />

          <label style={{ marginTop: 14 }}>Fechas del mes</label>
          <table className="sched-table" style={{ marginTop: 6 }}>
            <thead><tr><th>Fecha</th><th>Lectura</th><th>Cita</th><th>Predica</th><th>Especial</th></tr></thead>
            <tbody>
              {cultoRows.map((row, i) => (
                <tr key={i}>
                  <td><input type="date" value={row.fecha} onChange={(e) => updateRow(cultoRows, setCultoRows, i, 'fecha', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0 }} /></td>
                  <td>
                    <select value={row.lectura_user_id} onChange={(e) => updateCultoAssignee(i, 'lectura', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 13 }}>
                      <option value="">Elegir miembro…</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                    </select>
                  </td>
                  <td><input value={row.cita} onChange={(e) => updateRow(cultoRows, setCultoRows, i, 'cita', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0 }} /></td>
                  <td>
                    <select value={row.predica_user_id} onChange={(e) => updateCultoAssignee(i, 'predica', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 13 }}>
                      <option value="">Elegir miembro…</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                    </select>
                  </td>
                  <td><input value={row.especial} onChange={(e) => updateRow(cultoRows, setCultoRows, i, 'especial', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0 }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-outline" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setCultoRows((r) => [...r, emptyCultoRow()])}>
            + Agregar fecha
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Al elegir un miembro, le llegará una notificación y aparecerá en su "Mis privilegios" cuando se apruebe.
          </p>

          {cultoMsg && <p className={cultoMsg.startsWith('Enviado') ? 'success' : 'error'}>{cultoMsg}</p>}
          <button
            className="primary"
            style={{ marginTop: 16 }}
            onClick={() =>
              submitSchedule(
                'culto_mensual',
                { title: cultoForm.title, reference_date: cultoForm.reference_date || null, rows: cultoRows },
                setCultoMsg,
                () => {
                  setCultoForm({ title: '', reference_date: '' });
                  setCultoRows([emptyCultoRow(), emptyCultoRow()]);
                }
              )
            }
          >
            Enviar para aprobación
          </button>
        </Accordion>
      )}

      <Accordion title="Programación de la célula" subtitle="Solo el líder de la célula puede enviarla" icon="👥">
        {!user?.cell_id ? (
          <p className="muted">Aún no tienes una célula asignada — contacta a un administrador antes de enviar esto.</p>
        ) : (
          <>
            <label>Título (ej. Programa Célula 3 — Septiembre 2026)</label>
            <input value={cellForm.title} onChange={(e) => setCellForm((f) => ({ ...f, title: e.target.value }))} />
            <label>Mes que cubre</label>
            <input type="date" value={cellForm.reference_date} onChange={(e) => setCellForm((f) => ({ ...f, reference_date: e.target.value }))} />

            <label style={{ marginTop: 14 }}>Reuniones del mes</label>
            <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
              La última semana suele ser "Célula Unida" — márcala en la columna Especial y deja lo demás vacío.
            </p>
            <table className="sched-table" style={{ marginTop: 6 }}>
              <thead><tr><th>Fecha</th><th>Dirige</th><th>Reflexión</th><th>Lectura</th><th>Observación</th><th>Especial</th></tr></thead>
              <tbody>
                {cellRows.map((row, i) => (
                  <tr key={i}>
                    <td><input type="date" value={row.fecha} onChange={(e) => updateRow(cellRows, setCellRows, i, 'fecha', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0 }} /></td>
                    <td>
                      <select value={row.dirige_user_id} onChange={(e) => updateCellAssignee(i, 'dirige', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 13 }}>
                        <option value="">Elegir…</option>
                        {roster.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={row.reflexion_user_id} onChange={(e) => updateCellAssignee(i, 'reflexion', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 13 }}>
                        <option value="">Elegir…</option>
                        {roster.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={row.lectura_user_id} onChange={(e) => updateCellAssignee(i, 'lectura', e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 13 }}>
                        <option value="">Elegir…</option>
                        {roster.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                      </select>
                    </td>
                    <td><input value={row.observacion} onChange={(e) => updateRow(cellRows, setCellRows, i, 'observacion', e.target.value)} placeholder="Estudio Génesis cap. 11" style={{ border: 'none', background: 'transparent', padding: 0 }} /></td>
                    <td><input value={row.especial} onChange={(e) => updateRow(cellRows, setCellRows, i, 'especial', e.target.value)} placeholder="Célula Unida" style={{ border: 'none', background: 'transparent', padding: 0 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn-outline" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setCellRows((r) => [...r, emptyCellRow()])}>
              + Agregar fecha
            </button>

            {cellMsg && <p className={cellMsg.startsWith('Enviado') ? 'success' : 'error'}>{cellMsg}</p>}
            <button
              className="primary"
              style={{ marginTop: 16 }}
              onClick={() =>
                submitSchedule(
                  'celula',
                  { title: cellForm.title, reference_date: cellForm.reference_date || null, rows: cellRows, cell_id: user.cell_id },
                  setCellMsg,
                  () => {
                    setCellForm({ title: '', reference_date: '' });
                    setCellRows([emptyCellRow(), emptyCellRow()]);
                  }
                )
              }
            >
              Enviar para aprobación
            </button>
          </>
        )}
      </Accordion>

      {myMinistries.map((m) => (
        <Accordion key={m.id} title={`Programación de ${m.name}`} subtitle="Envíalo y pasa para aprobación del pastor" icon={m.icon}>
          <MinistryScheduleForm ministry={m} roster={roster} token={token} API_URL={API_URL} />
        </Accordion>
      ))}

      {customTemplates.map((t) => (
        <Accordion key={t.id} title={t.name} subtitle={t.description || 'Plantilla personalizada'} icon={t.icon}>
          <CustomTemplateForm template={t} roster={roster} token={token} API_URL={API_URL} />
        </Accordion>
      ))}
    </div>
  );
}
