import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('es-NI', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function downloadSchedulePdf(id, title, token, API_URL) {
  const res = await fetch(`${API_URL}/api/reports/programacion/${id}.pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'No se pudo descargar el PDF.');
    return;
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]+/gi, '-')}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default function Events() {
  const { user, token, API_URL } = useAuth();
  const [events, setEvents] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/schedules?type=evento`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setEvents)
      .finally(() => setLoading(false));
  }, [token]);

  async function toggle(id) {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(id);
    const res = await fetch(`${API_URL}/api/schedules/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    setDetail(await res.json());
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Borrar este evento? Esta acción no se puede deshacer.')) return;
    await fetch(`${API_URL}/api/schedules/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setEvents((evs) => evs.filter((e) => e.id !== id));
    setExpanded(null);
    setDetail(null);
  }

  if (loading) return <p className="muted center">Cargando…</p>;

  return (
    <div className="dash-wrap">
      <div className="dash-header">
        <div>
          <h1>Eventos</h1>
          <p className="subtitle">Próximas actividades ya aprobadas por el pastor</p>
        </div>
        <Link className="btn-outline" to="/documentos" style={{ textDecoration: 'none' }}>+ Proponer evento</Link>
      </div>

      {events.length === 0 && (
        <div className="card"><p className="muted">Todavía no hay eventos aprobados. En cuanto el pastor apruebe uno, aparecerá aquí.</p></div>
      )}

      {events.map((ev) => (
        <div className={`doc-card ${expanded === ev.id ? 'open' : ''}`} key={ev.id}>
          <div className="doc-card-head" onClick={() => toggle(ev.id)}>
            <div className="doc-icon">📅</div>
            <div>
              <strong>{ev.title}</strong>
              <p>{formatDate(ev.reference_date)}{ev.location ? ` · ${ev.location}` : ''}</p>
            </div>
            <span className="doc-chevron">▾</span>
          </div>

          {expanded === ev.id && detail && (
            <div className="doc-card-body" style={{ display: 'block' }}>
              {detail.meta && detail.meta.maestro_ceremonia && <p><strong>Maestro de Ceremonia:</strong> {detail.meta.maestro_ceremonia}</p>}
              {detail.meta && (detail.meta.hora_inicio || detail.meta.hora_fin) && (
                <p><strong>Horario:</strong> {detail.meta.hora_inicio}{detail.meta.hora_fin ? ` a ${detail.meta.hora_fin}` : ''}</p>
              )}
              {detail.meta && detail.meta.celula && <p><strong>Célula / ministerio:</strong> {detail.meta.celula}</p>}

              {detail.rows && detail.rows.length > 0 && (
                <table className="sched-table" style={{ marginTop: 10 }}>
                  <thead><tr><th>Hora</th><th>Actividad</th><th>Participante</th><th>Notas</th></tr></thead>
                  <tbody>
                    {detail.rows.map((r) =>
                      r.data.bloque ? (
                        <tr key={r.id} className="special">
                          <td colSpan="4" style={{ fontWeight: 700 }}>{r.data.bloque}</td>
                        </tr>
                      ) : (
                        <tr key={r.id}>
                          <td>{r.data.hora}</td><td>{r.data.actividad}</td><td>{r.data.participante}</td><td>{r.data.notas}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              )}

              {detail.meta && detail.meta.recursos && <p style={{ marginTop: 10 }}><strong>Recursos:</strong> {detail.meta.recursos}</p>}
              {detail.meta && detail.meta.observaciones && <p><strong>Observaciones:</strong> {detail.meta.observaciones}</p>}

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  className="btn-outline"
                  style={{ fontSize: 12 }}
                  onClick={() => downloadSchedulePdf(ev.id, ev.title, token, API_URL)}
                >
                  📄 Descargar / Imprimir PDF
                </button>
                {['admin', 'superadmin'].includes(user.role) && (
                  <button
                    className="btn-outline"
                    style={{ fontSize: 12, color: '#b23b3b', borderColor: '#b23b3b' }}
                    onClick={() => handleDelete(ev.id)}
                  >
                    🗑️ Borrar evento
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
