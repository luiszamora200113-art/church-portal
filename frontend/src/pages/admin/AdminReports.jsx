import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AdminReports() {
  const { token, API_URL } = useAuth();
  const [titheStatus, setTitheStatus] = useState([]);
  const [cells, setCells] = useState([]);
  const [selectedCell, setSelectedCell] = useState('');
  const [finMonth, setFinMonth] = useState(new Date().toISOString().slice(0, 7));
  const [finRange, setFinRange] = useState('mes');

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
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'No se pudo generar el reporte.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadMembersReport() {
    if (!selectedCell) {
      downloadPdf('/api/reports/miembros.pdf', 'reporte-miembros-todas.pdf');
      return;
    }
    const cell = cells.find((c) => String(c.id) === selectedCell);
    const safeName = cell ? cell.name.replace(/[^a-z0-9]+/gi, '-') : selectedCell;
    downloadPdf(`/api/reports/miembros.pdf?cell_id=${selectedCell}`, `reporte-miembros-${safeName}.pdf`);
  }

  function downloadFinanceReport() {
    const [y, m] = finMonth.split('-').map(Number);
    let from, to, label;
    if (finRange === 'mes') {
      from = `${finMonth}-01`;
      to = from;
      label = finMonth;
    } else if (finRange === '2meses') {
      const prev = new Date(y, m - 2, 1);
      from = prev.toISOString().slice(0, 10);
      to = `${finMonth}-01`;
      label = `${prev.toISOString().slice(0, 7)}_a_${finMonth}`;
    } else {
      from = `${y}-01-01`;
      to = `${y}-12-01`;
      label = `año-${y}`;
    }
    downloadPdf(`/api/reports/finanzas.pdf?from=${from}&to=${to}`, `reporte-finanzas-${label}.pdf`);
  }

  return (
    <div>
      <h1>Reportes</h1>

      <div className="card">
        <h2>Descargar en PDF</h2>

        <label>Reporte de finanzas (historial — puedes elegir cualquier mes pasado)</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="month" value={finMonth} onChange={(e) => setFinMonth(e.target.value)} style={{ maxWidth: 160 }} />
          <select value={finRange} onChange={(e) => setFinRange(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="mes">Solo ese mes</option>
            <option value="2meses">Ese mes + el anterior</option>
            <option value="año">Todo el año</option>
          </select>
          <button className="primary" style={{ marginTop: 0, width: 'auto', padding: '10px 18px' }} onClick={downloadFinanceReport}>
            Descargar PDF
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <button className="btn-outline" onClick={() => downloadPdf('/api/reports/diezmos.pdf', 'reporte-diezmos.pdf')}>
            Estado de diezmo
          </button>
        </div>

        <label style={{ marginTop: 18 }}>Reporte de miembros</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={selectedCell} onChange={(e) => setSelectedCell(e.target.value)} style={{ maxWidth: 260 }}>
            <option value="">Todos los miembros</option>
            {cells.map((c) => (
              <option key={c.id} value={c.id}>Solo {c.name}</option>
            ))}
          </select>
          <button className="primary" style={{ marginTop: 0, width: 'auto', padding: '10px 18px' }} onClick={downloadMembersReport}>
            Descargar PDF
          </button>
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
