import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

const TYPE_LABELS = {
  evento: 'Evento',
  culto_mensual: 'Programación del mes',
  celula: 'Programación de célula',
  escuela_dominical: 'Escuela Dominical',
  ministerio: 'Ministerio',
};

async function downloadHistorialPdf(id, title, token, API_URL) {
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

export default function AdminHistorial() {
  const { token, API_URL } = useAuth();
  const [items, setItems] = useState([]);
  const [customLabels, setCustomLabels] = useState({});
  const [filterType, setFilterType] = useState('');
  const [loading, setLoading] = useState(true);

  function load(type) {
    setLoading(true);
    const q = type ? `?type=${type}` : '';
    fetch(`${API_URL}/api/schedules/historial${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { setItems(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    fetch(`${API_URL}/api/custom-templates`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((all) => setCustomLabels(Object.fromEntries(all.map((t) => [t.type_key, t.name]))))
      .catch(() => {});
    load(filterType);
  }, [token, filterType]);

  function typeLabel(type) {
    return TYPE_LABELS[type] || customLabels[type] || type;
  }

  async function handleDelete(item) {
    if (!window.confirm(`¿Eliminar "${item.title}" por completo? Esta acción no se puede deshacer.`)) return;
    const res = await fetch(`${API_URL}/api/schedules/${item.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'No se pudo eliminar.');
      return;
    }
    setItems((list) => list.filter((i) => i.id !== item.id));
  }

  return (
    <div>
      <h1>Historial</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        Toda la programación aprobada alguna vez, incluyendo la ya vencida — para consultarla cuando la necesites, sin que se pierda.
      </p>

      <div style={{ marginBottom: 16 }}>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">Todos los tipos</option>
          {Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>

      {loading && <p className="muted center">Cargando…</p>}
      {!loading && items.length === 0 && (
        <div className="card"><p className="muted">No hay nada en el historial todavía.</p></div>
      )}
      {items.map((item) => (
        <div key={item.id} className="member-row" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <strong>{item.title}</strong>
            <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
              {typeLabel(item.type)}
              {item.cell_name ? ` · ${item.cell_name}` : ''}
              {item.ministry_name ? ` · ${item.ministry_name}` : ''}
              {item.reference_date ? ` · ${new Date(item.reference_date).toLocaleDateString('es-NI', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
              {' · enviado por '}{item.created_by_name}
            </p>
          </div>
          <button
            className="btn-outline"
            style={{ marginTop: 0, fontSize: 12, padding: '6px 12px', width: 'auto' }}
            onClick={() => downloadHistorialPdf(item.id, item.title, token, API_URL)}
          >
            📄 PDF
          </button>
          <button
            className="btn-outline"
            style={{ marginTop: 0, fontSize: 12, padding: '6px 12px', width: 'auto', color: '#b23b3b', borderColor: '#b23b3b' }}
            onClick={() => handleDelete(item)}
          >
            🗑️ Eliminar
          </button>
        </div>
      ))}
    </div>
  );
}
