import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const isHidden = (k) => k.endsWith('_user_id') || k.endsWith('_user_ids') || k.endsWith('_cumplido');

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleDateString('es-NI', { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtMonth(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : d.toLocaleDateString('es-NI', { month: 'long', year: 'numeric' });
}
const show = (f, v) => (f.type === 'fecha' ? fmtDate(v) : v);

async function downloadPdf(id, title, token, API_URL) {
  const res = await fetch(`${API_URL}/api/reports/programacion/${id}.pdf`, { headers: { Authorization: `Bearer ${token}` } });
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

// Muestra lo aprobado desde plantillas personalizadas cuyo destino de publicación es esta sección.
// destination: 'eventos' | 'programacion'. Si no hay nada publicado, no muestra nada.
export default function PublishedSchedules({ destination }) {
  const { user, token, API_URL } = useAuth();
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/schedules/published?destination=${destination}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [token, destination]);

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
    if (!window.confirm('¿Borrar esta publicación? Esta acción no se puede deshacer.')) return;
    await fetch(`${API_URL}/api/schedules/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setItems((list) => list.filter((i) => i.id !== id));
    setExpanded(null);
    setDetail(null);
  }

  if (items.length === 0) return null;

  return (
    <>
      <div className="sched-section-divider">{destination === 'eventos' ? 'Otros eventos publicados' : 'Otras programaciones publicadas'}</div>
      {items.map((it) => {
        const headerFields = it.header_fields || [];
        const rowFields = it.row_fields || [];
        const meta = (detail && detail.id === it.id && detail.meta) || {};
        return (
          <div className={`doc-card ${expanded === it.id ? 'open' : ''}`} key={it.id}>
            <div className="doc-card-head" onClick={() => toggle(it.id)}>
              <div className="doc-icon">{it.template_icon || '📄'}</div>
              <div>
                <strong>{it.title}</strong>
                <p>
                  {it.template_name}
                  {it.reference_date ? ` · ${destination === 'eventos' ? fmtDate(it.reference_date) : fmtMonth(it.reference_date)}` : ''}
                </p>
              </div>
              <span className="doc-chevron">▾</span>
            </div>

            {expanded === it.id && detail && detail.id === it.id && (
              <div className="doc-card-body" style={{ display: 'block' }}>
                {headerFields
                  .filter((f) => !isHidden(f.key) && meta[f.key])
                  .map((f) => (
                    <p key={f.key}><strong>{f.label}:</strong> {show(f, meta[f.key])}</p>
                  ))}

                {detail.rows && detail.rows.length > 0 && rowFields.length > 0 && (
                  <table className="sched-table" style={{ marginTop: 10 }}>
                    <thead><tr>{rowFields.map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
                    <tbody>
                      {detail.rows.map((r) => (
                        <tr key={r.id}>{rowFields.map((f) => <td key={f.key}>{show(f, r.data[f.key])}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn-outline" style={{ fontSize: 12 }} onClick={() => downloadPdf(it.id, it.title, token, API_URL)}>
                    📄 Descargar / Imprimir PDF
                  </button>
                  {['admin', 'superadmin'].includes(user.role) && (
                    <button className="btn-outline" style={{ fontSize: 12, color: '#b23b3b', borderColor: '#b23b3b' }} onClick={() => handleDelete(it.id)}>
                      🗑️ Borrar
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
