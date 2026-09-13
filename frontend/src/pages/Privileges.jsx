import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function nextOccurrence(dayOfWeek) {
  const today = new Date();
  const diff = (dayOfWeek - today.getDay() + 7) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + diff);
  return next.toISOString().slice(0, 10);
}

export default function Privileges() {
  const { token, API_URL } = useAuth();
  const [cell, setCell] = useState(null);
  const [titheConfirmed, setTitheConfirmed] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [services, setServices] = useState([]);
  const [cancellations, setCancellations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salary, setSalary] = useState('');

  const todayName = dayNames[new Date().getDay()];

  async function loadAll() {
    const [cellRes, titheRes, assignRes, servicesRes] = await Promise.all([
      fetch(`${API_URL}/api/cells/mine`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/tithe/mine`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/schedules/assignments/mine`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/services`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const cellData = await cellRes.json();
    setCell(cellData.cell || null);
    const titheData = await titheRes.json();
    setTitheConfirmed(titheData.confirmed);
    setAssignments(await assignRes.json());
    const servicesData = await servicesRes.json();
    setServices(servicesData.services || []);
    setCancellations(servicesData.cancellations || []);
  }

  useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, [token]);

  async function toggleTithe() {
    setTitheConfirmed((c) => !c); // optimista
    const res = await fetch(`${API_URL}/api/tithe/toggle`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setTitheConfirmed(data.confirmed);
  }

  const tithe = (parseFloat(salary) || 0) * 0.10;

  if (loading) return <p className="muted center">Cargando…</p>;

  const cellIsToday = cell && cell.meeting_day && cell.meeting_day.toLowerCase() === todayName.toLowerCase();

  return (
    <div className="dash-wrap">
      <div className="dash-header">
        <div>
          <h1>Mis privilegios</h1>
          <p className="subtitle">{todayName}</p>
        </div>
      </div>

      {cellIsToday && (
        <div className="reminder-card today">
          <div className="reminder-icon">👥</div>
          <div className="reminder-text">
            <strong>Tu célula es hoy</strong>
            <p>{cell.name} se reúne{cell.meeting_time ? ` a las ${cell.meeting_time}` : ''}{cell.location ? ` en ${cell.location}` : ''}.</p>
          </div>
          <span className="reminder-when">Hoy</span>
        </div>
      )}

      {assignments.map((a, i) => (
        <div className="reminder-card" key={i}>
          <div className="reminder-icon">🎙️</div>
          <div className="reminder-text">
            <strong>Te toca: {a.label}</strong>
            <p>En "{a.schedule_title}"{a.fecha ? ` — ${new Date(a.fecha).toLocaleDateString('es-NI', { day: 'numeric', month: 'long' })}` : ''}</p>
          </div>
          <span className="reminder-when">Próximo</span>
        </div>
      ))}

      <div className={`reminder-card ${titheConfirmed ? '' : ''}`}>
        <div className="reminder-icon">💰</div>
        <div className="reminder-text">
          {titheConfirmed ? (
            <>
              <strong>Diezmo de este mes confirmado</strong>
              <p>Gracias por tu fidelidad. Puedes desmarcarlo si fue un error.</p>
            </>
          ) : (
            <>
              <strong>Aún falta tu diezmo de este mes</strong>
              <p>Marca cuando ya hayas diezmado.</p>
            </>
          )}
          <button className="btn-outline" style={{ marginTop: 10, fontSize: 12 }} onClick={toggleTithe}>
            {titheConfirmed ? 'Deshacer' : 'Ya diezmé este mes'}
          </button>
        </div>
        <span className="reminder-when">Este mes</span>
      </div>

      {services.map((s) => {
        const occurDate = nextOccurrence(s.day_of_week);
        const cancellation = cancellations.find((c) => c.service_id === s.id && c.cancel_date === occurDate);
        return (
          <div className={`reminder-card ${cancellation ? 'cancelled' : ''}`} key={s.id}>
            <div className="reminder-icon">{s.icon}</div>
            <div className="reminder-text">
              <strong>{s.name}</strong>
              {cancellation ? (
                <p><strong style={{ color: '#b23b3b' }}>Cancelado esta semana.</strong> {cancellation.note}</p>
              ) : (
                <p>Cada {dayNames[s.day_of_week].toLowerCase()}, {s.time_label}{s.location ? ` en ${s.location}` : ' en el templo principal'}.</p>
              )}
            </div>
            <span className="reminder-when">{dayNames[s.day_of_week]}</span>
          </div>
        );
      })}

      <div className="card">
        <h2>Calculadora de diezmo</h2>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          Este cálculo se hace solo en tu dispositivo — no se guarda ni se envía a ningún lado.
        </p>
        <label>Tu ingreso mensual (C$)</label>
        <input type="number" placeholder="Ej. 15000" value={salary} onChange={(e) => setSalary(e.target.value)} />
        <div style={{ marginTop: 14, fontFamily: "'Fraunces', serif", fontSize: 24, color: 'var(--moss-dark)' }}>
          {new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(tithe)}
        </div>
      </div>
    </div>
  );
}