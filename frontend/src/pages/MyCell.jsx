import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Construye un link directo a WhatsApp a partir del teléfono del líder.
// Asume números locales de Nicaragua (8 dígitos) si no viene con código de país.
function whatsappLink(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const withCountry = digits.length === 8 ? `505${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

async function downloadSchedulePdf(id, title, token, API_URL) {
  const res = await fetch(`${API_URL}/api/reports/programacion/${id}.pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
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

export default function MyCell() {
  const { user, token, API_URL } = useAuth();
  const [cell, setCell] = useState(null);
  const [members, setMembers] = useState([]);
  const [studyPlan, setStudyPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/cells/mine`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(async (data) => {
        setCell(data.cell || null);
        setMembers(data.members || []);
        if (data.cell) {
          const list = await fetch(`${API_URL}/api/schedules?type=celula&cell_id=${data.cell.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then((r) => r.json());
          if (list.length > 0) {
            const detail = await fetch(`${API_URL}/api/schedules/${list[0].id}`, {
              headers: { Authorization: `Bearer ${token}` },
            }).then((r) => r.json());
            setStudyPlan(detail);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="muted center">Cargando…</p>;

  return (
    <div className="dash-wrap">
      {cell ? (
        <div className="cell-hero">
          <div>
            <span className="eyebrow">Mi célula</span>
            <h2>{cell.name}</h2>
            <p className="meta">
              {cell.leader_name ? `Líder: ${cell.leader_name}` : 'Sin líder asignado'}
              {cell.meeting_day ? ` · ${cell.meeting_day}` : ''}
              {cell.meeting_time ? `, ${cell.meeting_time}` : ''}
              {cell.location ? ` · ${cell.location}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            {whatsappLink(cell.leader_phone) && (
              <a
                href={whatsappLink(cell.leader_phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="cell-select"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                💬 Escribir al líder
              </a>
            )}
            {(cell.leader_id === user.id || ['admin', 'superadmin', 'secretary'].includes(user.role)) && (
              <Link to="/documentos" className="cell-select" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                📅 Programar mi célula
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="cell-hero">
          <div>
            <span className="eyebrow">Mi célula</span>
            <h2>Aún no tienes una célula asignada</h2>
            <p className="meta">Contacta a un administrador para que te asigne una.</p>
          </div>
        </div>
      )}

      {cell && (
        <div className="card">
          <h2>Miembros de esta célula ({members.length})</h2>
          {members.length === 0 && <p className="muted">Todavía no hay miembros registrados aquí.</p>}
          {members.map((m) => (
            <div className="member-row" key={m.id}>
              <div className="avatar">
                {m.full_name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
              </div>
              {m.full_name}
              {['admin', 'superadmin'].includes(m.role) && (
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Admin</span>
              )}
            </div>
          ))}
        </div>
      )}

      {cell && studyPlan && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ marginBottom: 0 }}>Programa de célula del mes</h2>
            <button className="btn-outline" style={{ fontSize: 12 }} onClick={() => downloadSchedulePdf(studyPlan.id, studyPlan.title, token, API_URL)}>
              📄 PDF
            </button>
          </div>
          <table className="sched-table">
            <thead><tr><th>Fecha</th><th>Dirige</th><th>Reflexión</th><th>Lectura</th><th>Observación</th></tr></thead>
            <tbody>
              {studyPlan.rows.map((r) => (
                <tr key={r.id} className={r.data.especial ? 'special' : ''}>
                  <td>{r.data.fecha ? new Date(r.data.fecha).toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit' }) : ''}</td>
                  {r.data.especial ? (
                    <td colSpan="4">{r.data.especial}<span className="tag">Especial</span></td>
                  ) : (
                    <>
                      <td>{r.data.dirige}</td>
                      <td>{r.data.reflexion}</td>
                      <td>{r.data.lectura}</td>
                      <td>{r.data.observacion}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        ¿Necesitas cambiar de célula? Solo un administrador puede autorizarlo.
      </p>
    </div>
  );
}