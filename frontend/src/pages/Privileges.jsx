import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function Privileges() {
  const { token, API_URL } = useAuth();
  const [cell, setCell] = useState(null);
  const [titheConfirmed, setTitheConfirmed] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salary, setSalary] = useState('');

  const todayName = dayNames[new Date().getDay()];

  async function loadAll() {
    const [cellRes, titheRes, assignRes] = await Promise.all([
      fetch(`${API_URL}/api/cells/mine`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/tithe/mine`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/schedules/assignments/mine`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const cellData = await cellRes.json();
    setCell(cellData.cell || null);
    const titheData = await titheRes.json();
    setTitheConfirmed(titheData.confirmed);
    setAssignments(await assignRes.json());
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

      <div className="reminder-card">
        <div className="reminder-icon">⛪</div>
        <div className="reminder-text">
          <strong>Servicio dominical (mañana)</strong>
          <p>Cada domingo, 10:00 AM en el templo principal.</p>
        </div>
        <span className="reminder-when">Domingo</span>
      </div>

      <div className="reminder-card">
        <div className="reminder-icon">⛪</div>
        <div className="reminder-text">
          <strong>Servicio dominical (tarde)</strong>
          <p>Cada domingo, 5:00 PM en el templo principal.</p>
        </div>
        <span className="reminder-when">Domingo</span>
      </div>

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