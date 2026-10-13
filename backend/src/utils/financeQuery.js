const pool = require('../config/db');

// Búsqueda sin distinguir mayúsculas ni acentos (misma lógica en pantalla y en el PDF).
const normCol = (col) => `translate(lower(${col}), 'áéíóúüñ', 'aeiouun')`;

// Cada movimiento se guarda con su mes (entry_month), así que los rangos son por mes.
function monthStart(value, fallback) {
  const m = /^(\d{4})-(\d{2})/.exec(String(value || ''));
  return m ? `${m[1]}-${m[2]}-01` : fallback;
}

// Filtros aceptados: from / to (YYYY-MM), type (ingreso|egreso), category_id, q (texto).
function parseFilters(query = {}) {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  let from = monthStart(query.from, current);
  let to = monthStart(query.to, from);
  if (to < from) [from, to] = [to, from];
  const type = ['ingreso', 'egreso'].includes(query.type) ? query.type : null;
  const cat = Number(query.category_id);
  const category_id = Number.isInteger(cat) && cat > 0 ? cat : null;
  return { from, to, type, category_id, q: String(query.q || '').trim() };
}

// Devuelve los movimientos filtrados y los totales del mismo período/categoría/búsqueda
// (los totales no dependen del tipo, para poder mostrar ingresos, egresos y balance a la vez).
async function fetchMovements(f) {
  const params = [f.from, f.to];
  let where = "fe.entry_month >= $1::date AND fe.entry_month < ($2::date + INTERVAL '1 month')";
  if (f.category_id) {
    params.push(f.category_id);
    where += ` AND fe.category_id = $${params.length}`;
  }
  const term = f.q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (term) {
    params.push(`%${term.replace(/[%_\\]/g, (c) => '\\' + c)}%`);
    where += ` AND (${normCol("COALESCE(fe.note, '')")} LIKE $${params.length} OR ${normCol('fc.name')} LIKE $${params.length})`;
  }
  const base = `FROM finance_entries fe JOIN finance_categories fc ON fc.id = fe.category_id WHERE ${where}`;

  const { rows: t } = await pool.query(
    `SELECT COALESCE(SUM(fe.amount) FILTER (WHERE fe.entry_type = 'ingreso'), 0) AS ingresos,
            COALESCE(SUM(fe.amount) FILTER (WHERE fe.entry_type = 'egreso'), 0) AS egresos ${base}`,
    params
  );

  let rowParams = params;
  let rowWhere = base;
  if (f.type) {
    rowParams = [...params, f.type];
    rowWhere = `${base} AND fe.entry_type = $${rowParams.length}`;
  }
  const { rows } = await pool.query(
    `SELECT fe.id, to_char(fe.entry_month, 'YYYY-MM-DD') AS entry_month, fe.entry_type, fe.amount, fe.note,
            fe.category_id, fc.name AS category_name, fc.color
     ${rowWhere}
     ORDER BY fe.entry_month DESC, fe.created_at DESC, fe.id DESC`,
    rowParams
  );

  const ingresos = Number(t[0].ingresos);
  const egresos = Number(t[0].egresos);
  return {
    rows: rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    totals: { ingresos, egresos, balance: ingresos - egresos },
  };
}

module.exports = { parseFilters, fetchMovements };
