import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function AdminServices() {
  const { token, API_URL } = useAuth();
  const [services, setServices] = useState([]);
  const [cancellations, setCancellations] = useState([]);
  const [msg, setMsg] = useState('');

  const [newService, setNewService] = useState({ name: '', day_of_week: 0, time_label: '', location: '', icon: '⛪' });
  const [cancelForm, setCancelForm] = useState({ service_id: '', cancel_date: '', note: '' });

  function load() {
    fetch(`${API_URL}/api/services/all`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { setServices(d.services); setCancellations(d.cancellations); })
      .catch(() => {});
  }

  useEffect(() => { load(); }, [token]);

  async function addService(e) {
    e.preventDefault();
    if (!newService.name.trim() || !newService.time_label.trim()) {
      setMsg('Nombre y hora son requeridos.');
      return;
    }
    const res = await fetch(`${API_URL}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(newService),
    });
    if (res.ok) {
      setNewService({ name: '', day_of_week: 0, time_label: '', location: '', icon: '⛪' });
      setMsg('');
      load();
    } else {
      setMsg('No se pudo agregar.');
    }
  }

  async function toggleActive(s) {
    await fetch(`${API_URL}/api/services/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...s, active: !s.active }),
    });
    load();
  }

  async function removeService(id) {
    if (!window.confirm('¿Borrar este servicio por completo? (no solo desactivarlo)')) return;
    await fetch(`${API_URL}/api/services/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    load();
  }

  async function submitCancellation(e) {
    e.preventDefault();
    if (!cancelForm.service_id || !cancelForm.cancel_date) {
      setMsg('Elige un servicio y una fecha.');
      return;
    }
    const res = await fetch(`${API_URL}/api/services/${cancelForm.service_id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cancel_date: cancelForm.cancel_date, note: cancelForm.note }),
    });
    const data = await res.json();
    if (res.ok) {
      setCancelForm({ service_id: '', cancel_date: '', note: '' });
      setMsg('');
      load();
    } else {
      setMsg(data.error || 'No se pudo cancelar.');
    }
  }

  async function undoCancellation(id) {
    await fetch(`${API_URL}/api/services/cancellations/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    load();
  }

  return (
    <div>
      <h1>Servicios</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        Estos son los recordatorios fijos que ve cada miembro en "Mis privilegios". Puedes agregar nuevos, desactivar uno para siempre, o cancelar una fecha puntual (ej. este domingo en particular).
      </p>

      <div className="card">
        <h2>Servicios recurrentes</h2>
        {services.length === 0 && <p className="muted">Aún no has agregado ningún servicio.</p>}
        {services.map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--line)', padding: '10px 0', opacity: s.active ? 1 : 0.5 }}>
            <span style={{ fontSize: 18 }}>{s.icon}</span>
            <div style={{ flex: 1 }}>
              <strong>{s.name}</strong>
              <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                {dayNames[s.day_of_week]}, {s.time_label}{s.location ? ` · ${s.location}` : ''}{!s.active ? ' · Inactivo' : ''}
              </p>
            </div>
            <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => toggleActive(s)}>
              {s.active ? 'Desactivar' : 'Activar'}
            </button>
            <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => removeService(s.id)}>
              Borrar
            </button>
          </div>
        ))}

        <form onSubmit={addService} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <label>Nombre</label>
          <input value={newService.name} onChange={(e) => setNewService((s) => ({ ...s, name: e.target.value }))} placeholder="Ej. Servicio de jóvenes" />
          <div className="doc-row3">
            <div>
              <label>Día</label>
              <select value={newService.day_of_week} onChange={(e) => setNewService((s) => ({ ...s, day_of_week: Number(e.target.value) }))}>
                {dayNames.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div><label>Hora</label><input value={newService.time_label} onChange={(e) => setNewService((s) => ({ ...s, time_label: e.target.value }))} placeholder="6:00 PM" /></div>
            <div><label>Lugar (opcional)</label><input value={newService.location} onChange={(e) => setNewService((s) => ({ ...s, location: e.target.value }))} placeholder="Templo principal" /></div>
          </div>
          <button className="primary" type="submit" style={{ marginTop: 12 }}>+ Agregar servicio</button>
        </form>
      </div>

      <div className="card">
        <h2>Cancelar una fecha puntual</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          Esto no desactiva el servicio — solo avisa a los miembros que esa fecha en particular no habrá.
        </p>
        <form onSubmit={submitCancellation}>
          <label>Servicio</label>
          <select value={cancelForm.service_id} onChange={(e) => setCancelForm((f) => ({ ...f, service_id: e.target.value }))}>
            <option value="">Elegir…</option>
            {services.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label>Fecha</label>
          <input type="date" value={cancelForm.cancel_date} onChange={(e) => setCancelForm((f) => ({ ...f, cancel_date: e.target.value }))} />
          <label>Motivo (opcional, lo ve el miembro)</label>
          <input value={cancelForm.note} onChange={(e) => setCancelForm((f) => ({ ...f, note: e.target.value }))} placeholder="Ej. Por la vigilia de la noche anterior" />
          {msg && <p className="error">{msg}</p>}
          <button className="primary" type="submit" style={{ marginTop: 12 }}>Cancelar esa fecha</button>
        </form>

        {cancellations.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <h2>Próximas cancelaciones</h2>
            {cancellations.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <div style={{ flex: 1 }}>
                  <strong>{c.service_name}</strong>
                  <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                    {new Date(c.cancel_date).toLocaleDateString('es-NI', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {c.note ? ` — ${c.note}` : ''}
                  </p>
                </div>
                <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => undoCancellation(c.id)}>
                  Deshacer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
