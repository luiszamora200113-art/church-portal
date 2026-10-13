import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

// Búsqueda sin distinguir mayúsculas ni acentos.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Reporte de membresía con vista previa en pantalla: el filtro de célula carga los datos de inmediato,
// el buscador filtra por nombre, y "Descargar PDF" genera el informe con el filtro y la búsqueda actuales.
export default function MembershipReport() {
  const { token, API_URL } = useAuth();
  const [cells, setCells] = useState([]);
  const [cellId, setCellId] = useState('');
  const [members, setMembers] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const auth = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch(`${API_URL}/api/cells`, { headers: auth })
      .then((r) => r.json())
      .then((d) => setCells(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    // Si el usuario cambia de célula antes de que llegue la respuesta anterior, se descarta la respuesta vieja.
    let stale = false;
    setLoading(true);
    setError('');
    const qs = cellId ? `?cell_id=${cellId}` : '';
    fetch(`${API_URL}/api/reports/miembros${qs}`, { headers: auth })
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error || 'No se pudo cargar.')))))
      .then((d) => { if (!stale) setMembers(Array.isArray(d) ? d : []); })
      .catch((e) => { if (!stale) { setMembers([]); setError(e.message); } })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [token, cellId]);

  const term = norm(q.trim());
  const filtered = useMemo(
    () => (term ? members.filter((m) => norm(m.full_name).includes(term)) : members),
    [members, term]
  );

  const cellName = (cells.find((c) => String(c.id) === cellId) || {}).name;

  async function downloadPdf() {
    const params = new URLSearchParams();
    if (cellId) params.set('cell_id', cellId);
    if (q.trim()) params.set('q', q.trim());
    const qs = params.toString();
    const res = await fetch(`${API_URL}/api/reports/miembros.pdf${qs ? `?${qs}` : ''}`, { headers: auth });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'No se pudo generar el reporte.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-miembros-${cellName ? cellName.replace(/[^a-z0-9]+/gi, '-') : 'todas'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1>Reporte de membresía</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        Elige una célula para ver los miembros al instante. El PDF se genera con la vista que tengas en pantalla.
      </p>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, alignItems: 'end' }}>
          <div>
            <label style={{ marginTop: 0 }}>Célula</label>
            <select value={cellId} onChange={(e) => setCellId(e.target.value)}>
              <option value="">Todos los miembros</option>
              {cells.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ marginTop: 0 }}>Buscar por nombre</label>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe un nombre…" />
          </div>
          <div>
            <button className="primary" style={{ marginTop: 0 }} onClick={downloadPdf} disabled={loading || filtered.length === 0}>
              Descargar PDF
            </button>
          </div>
        </div>

        <p className="muted" style={{ fontSize: 13, margin: '14px 0 8px' }}>
          {loading ? 'Cargando…' : `Mostrando ${filtered.length} de ${members.length} miembro(s)`}
          {cellName ? ` · ${cellName}` : ' · Todas las células'}
          {q.trim() ? ` · búsqueda: "${q.trim()}"` : ''}
        </p>

        {error && <p className="error">{error}</p>}

        {!loading && !error && filtered.length === 0 && <p className="muted">No hay miembros que coincidan con la vista actual.</p>}

        {filtered.length > 0 && (
          <div className="table-scroll">
            <table className="sched-table wrap-table">
              <thead><tr><th style={{ width: 48 }}>#</th><th>Nombre</th><th>Célula</th></tr></thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr key={m.id}>
                    <td>{i + 1}</td>
                    <td><strong>{m.full_name}</strong></td>
                    <td>{m.cell_name || <span className="muted">Sin célula asignada</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
