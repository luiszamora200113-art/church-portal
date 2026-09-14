import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AdminReports() {
  const { token, API_URL } = useAuth();
  const [titheStatus, setTitheStatus] = useState([]);
  const [cells, setCells] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/api/tithe/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setTitheStatus)
      .catch(() => {});
    fetch(`${API_URL}/api/cells`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setCells)
      .catch(() => {});
  }, [token]);

  // Los PDFs requieren el token; se descargan como blob y se disparan como archivo.
  async function downloadPdf(path, filename) {
    const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1>Reportes</h1>

      <div className="card">
        <h2>Descargar en PDF</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-outline" onClick={() => downloadPdf('/api/reports/finanzas.pdf', 'reporte-finanzas.pdf')}>
            Finanzas del mes
          </button>
          <button className="btn-outline" onClick={() => downloadPdf('/api/reports/diezmos.pdf', 'reporte-diezmos.pdf')}>
            Estado de diezmo
          </button>
          <button className="btn-outline" onClick={() => downloadPdf('/api/reports/miembros.pdf', 'reporte-miembros-todas.pdf')}>
            Miembros — todas las células
          </button>
          {cells.map((c) => (
            <button
              key={c.id}
              className="btn-outline"
              onClick={() => downloadPdf(`/api/reports/miembros.pdf?cell_id=${c.id}`, `reporte-miembros-${c.name.replace(/[^a-z0-9]+/gi, '-')}.pdf`)}
            >
              Miembros — {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Estado de diezmo — este mes</h2>
        {titheStatus.map((m) => (
          <div className="member-row" key={m.id}>
            <div className="avatar">{m.full_name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</div>
            {m.full_name}
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>
              {m.confirmed ? 'Confirmado' : 'Pendiente'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
