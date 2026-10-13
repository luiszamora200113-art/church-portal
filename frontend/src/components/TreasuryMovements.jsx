import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const money = (n) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n);
// Búsqueda sin distinguir mayúsculas ni acentos (igual que en el servidor).
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const presetMonth = (preset) => {
  const now = new Date();
  return ym(preset === 'anterior' ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : now);
};
const monthLabel = (s) => {
  const d = new Date(`${String(s).slice(0, 7)}-01T00:00:00`);
  return `${d.toLocaleDateString('es-NI', { month: 'long' })} ${d.getFullYear()}`;
};
const TYPES = [
  { value: 'todos', label: 'Vista combinada' },
  { value: 'ingreso', label: 'Solo ingresos' },
  { value: 'egreso', label: 'Solo egresos' },
];

// Consulta de movimientos en pantalla: tarjetas de resumen, filtros (tipo, período, categoría, búsqueda),
// tabla interactiva y exportación (PDF / Excel) basada en los filtros que se están viendo.
export default function TreasuryMovements() {
  const { token, API_URL } = useAuth();
  const [type, setType] = useState('todos');
  const [preset, setPreset] = useState('mes'); // 'mes' | 'anterior' | 'personalizado'
  const [customFrom, setCustomFrom] = useState(ym(new Date()));
  const [customTo, setCustomTo] = useState(ym(new Date()));
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const [categories, setCategories] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const auth = { Authorization: `Bearer ${token}` };

  const rawFrom = preset === 'personalizado' ? customFrom : presetMonth(preset);
  const rawTo = preset === 'personalizado' ? customTo : presetMonth(preset);
  const [from, to] = rawFrom && rawTo && rawFrom > rawTo ? [rawTo, rawFrom] : [rawFrom, rawTo];

  useEffect(() => {
    fetch(`${API_URL}/api/finance/categories`, { headers: auth })
      .then((r) => r.json())
      .then((d) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [token]);

  // Período y categoría se piden al servidor; el tipo y la búsqueda filtran al instante en pantalla.
  useEffect(() => {
    if (!from || !to) return undefined;
    let stale = false; // descarta respuestas viejas si el usuario cambia de filtro rápido
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ from, to });
    if (categoryId) params.set('category_id', categoryId);
    fetch(`${API_URL}/api/finance/movements?${params}`, { headers: auth })
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error || 'No se pudo cargar.')))))
      .then((d) => { if (!stale) setRows(d.rows || []); })
      .catch((e) => { if (!stale) { setRows([]); setError(e.message); } })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [token, from, to, categoryId]);

  const term = norm(q.trim());
  const searched = useMemo(
    () => (term ? rows.filter((r) => norm(r.note).includes(term) || norm(r.category_name).includes(term)) : rows),
    [rows, term]
  );
  // Las tarjetas suman ingresos y egresos del período/categoría/búsqueda, sin importar la vista de tipo elegida.
  const totals = useMemo(() => {
    const ingresos = searched.filter((r) => r.entry_type === 'ingreso').reduce((a, r) => a + Number(r.amount), 0);
    const egresos = searched.filter((r) => r.entry_type === 'egreso').reduce((a, r) => a + Number(r.amount), 0);
    return { ingresos, egresos, balance: ingresos - egresos };
  }, [searched]);
  const visible = useMemo(() => (type === 'todos' ? searched : searched.filter((r) => r.entry_type === type)), [searched, type]);

  const periodText = from === to ? monthLabel(from) : `${monthLabel(from)} — ${monthLabel(to)}`;
  const categoryName = (categories.find((c) => String(c.id) === categoryId) || {}).name;
  const fileBase = `movimientos-${type === 'todos' ? 'combinado' : type === 'ingreso' ? 'ingresos' : 'egresos'}-${from}_${to}`;

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPdf() {
    const params = new URLSearchParams({ from, to });
    if (type !== 'todos') params.set('type', type);
    if (categoryId) params.set('category_id', categoryId);
    if (q.trim()) params.set('q', q.trim());
    const res = await fetch(`${API_URL}/api/reports/movimientos.pdf?${params}`, { headers: auth });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'No se pudo generar el reporte.');
      return;
    }
    saveBlob(await res.blob(), `${fileBase}.pdf`);
  }

  // Excel: CSV con UTF-8 (BOM) que Excel abre directamente, con exactamente lo que se ve en la tabla.
  function downloadExcel() {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Mes', 'Categoría', 'Descripción', 'Tipo', 'Monto'].map(cell).join(',')];
    visible.forEach((r) =>
      lines.push([monthLabel(r.entry_month), r.category_name, r.note || '', r.entry_type === 'egreso' ? 'Egreso' : 'Ingreso', Number(r.amount).toFixed(2)].map(cell).join(','))
    );
    lines.push('');
    if (type !== 'egreso') lines.push([cell('Total ingresos'), '', '', '', Number(totals.ingresos).toFixed(2)].join(','));
    if (type !== 'ingreso') lines.push([cell('Total egresos'), '', '', '', Number(totals.egresos).toFixed(2)].join(','));
    if (type === 'todos') lines.push([cell('Balance'), '', '', '', Number(totals.balance).toFixed(2)].join(','));
    saveBlob(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${fileBase}.csv`);
  }

  const viewTotal = type === 'ingreso' ? totals.ingresos : type === 'egreso' ? totals.egresos : totals.balance;
  const viewTotalLabel = type === 'ingreso' ? 'Total ingresos' : type === 'egreso' ? 'Total egresos' : 'Balance';

  return (
    <div>
      <h1>Consulta de movimientos</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        Revisa ingresos, egresos y balance directamente en pantalla. Los reportes se generan con los filtros que tengas aplicados.
      </p>

      <div className="fin-summary">
        <div className="fin-income">
          <span className="eyebrow">Total ingresos</span>
          <div className="amount" style={{ color: '#2f6b3a' }}>{money(totals.ingresos)}</div>
          <p className="sub">{periodText}</p>
        </div>
        <div className="fin-income">
          <span className="eyebrow">Total egresos</span>
          <div className="amount" style={{ color: '#b23b3b' }}>{money(totals.egresos)}</div>
          <p className="sub">{periodText}</p>
        </div>
        <div className="fin-total">
          <span className="eyebrow">Balance / saldo neto</span>
          <div className="amount">{money(totals.balance)}</div>
          <p className="sub">Ingresos menos egresos</p>
        </div>
      </div>

      <div className="card">
        <div className="seg" role="group" aria-label="Tipo de movimiento">
          {TYPES.map((t) => (
            <button key={t.value} type="button" className={type === t.value ? 'active' : ''} onClick={() => setType(t.value)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="filter-grid">
          <div>
            <label style={{ marginTop: 0 }}>Período</label>
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              <option value="mes">Mes actual</option>
              <option value="anterior">Mes anterior</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </div>
          {preset === 'personalizado' && (
            <>
              <div>
                <label style={{ marginTop: 0 }}>Desde (mes)</label>
                <input type="month" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <label style={{ marginTop: 0 }}>Hasta (mes)</label>
                <input type="month" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <label style={{ marginTop: 0 }}>Categoría / concepto</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Todas las categorías</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ marginTop: 0 }}>Buscar en la descripción</label>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej. energía, sillas…" />
          </div>
        </div>

        <div className="export-bar">
          <span className="muted" style={{ fontSize: 13 }}>
            {loading ? 'Cargando…' : `${visible.length} movimiento(s)`}
            {' · '}{periodText}
            {categoryName ? ` · ${categoryName}` : ''}
            {q.trim() ? ` · búsqueda: "${q.trim()}"` : ''}
          </span>
          <span className="actions">
            <button type="button" className="btn-outline" onClick={downloadPdf} disabled={loading || visible.length === 0}>📄 Exportar PDF</button>
            <button type="button" className="btn-outline" onClick={downloadExcel} disabled={loading || visible.length === 0}>📊 Exportar Excel</button>
          </span>
        </div>

        {error && <p className="error">{error}</p>}
        {!loading && !error && visible.length === 0 && <p className="muted">No hay movimientos con los filtros actuales.</p>}

        {visible.length > 0 && (
          <div className="table-scroll">
            <table className="sched-table wrap-table">
              <thead>
                <tr><th>Mes</th><th>Categoría</th><th>Descripción</th><th>Tipo</th><th style={{ textAlign: 'right' }}>Monto</th></tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td>{monthLabel(r.entry_month)}</td>
                    <td><span className="swatch-dot" style={{ background: r.color || '#2f4d3a' }} />{r.category_name}</td>
                    <td>{r.note || <span className="muted">—</span>}</td>
                    <td><span className={`badge-tipo ${r.entry_type}`}>{r.entry_type === 'egreso' ? 'Egreso' : 'Ingreso'}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: r.entry_type === 'egreso' ? '#b23b3b' : '#2f6b3a' }}>
                      {r.entry_type === 'egreso' ? '−' : '+'}{money(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>{viewTotalLabel} de la vista</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(viewTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          Los movimientos se registran por mes, por eso los períodos se eligen por mes. Para registrar o corregir un movimiento, usa la pestaña Registro.
        </p>
      </div>
    </div>
  );
}
