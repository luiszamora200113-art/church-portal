const express = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parseFilters, fetchMovements } = require('../utils/financeQuery');

const router = express.Router();
const currentMonth = () => new Date().toISOString().slice(0, 7) + '-01';
const money = (n) => `C$ ${Number(n).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');
const MOSS = '#2f4d3a';
const MOSS_DARK = '#1f3627';
const GOLD = '#b98a3a';
const MUTED = '#6b7268';
const LINE = '#dedad0';

// Miembros del reporte de membresía: mismo criterio para la vista previa en pantalla y para el PDF.
// Filtros opcionales: célula (cell_id) y búsqueda por nombre q (sin distinguir mayúsculas ni acentos).
const norm = (col) => `translate(lower(${col}), 'áéíóúüñ', 'aeiouun')`;
async function fetchMembers({ cell_id, q }) {
  const params = [];
  let where = "u.role = 'member'";
  if (cell_id) {
    params.push(cell_id);
    where += ` AND u.cell_id = $${params.length}`;
  }
  const term = String(q || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (term) {
    params.push(`%${term.replace(/[%_\\]/g, (c) => '\\' + c)}%`);
    where += ` AND ${norm('u.full_name')} LIKE $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT u.id, u.full_name, u.cell_id, c.name AS cell_name
     FROM users u LEFT JOIN cells c ON c.id = u.cell_id
     WHERE ${where} ORDER BY u.full_name`,
    params
  );
  return rows;
}

const monthLabel = () =>
  new Date().toLocaleDateString('es-NI', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase());

/**
 * Crea un documento PDF con membrete institucional: logo, nombre de la iglesia,
 * título del reporte, línea divisoria, y pie de página con fecha/numeración en cada hoja.
 */
function createLetterheadPdf(res, filename, title, subtitle) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 50, size: 'letter', bufferPages: true });
  doc.pipe(res);

  function drawHeader() {
    try {
      doc.image(LOGO_PATH, 50, 45, { height: 42 });
    } catch (e) {
      /* si el logo no está disponible, seguimos sin romper el reporte */
    }
    doc.fillColor(MOSS_DARK).font('Helvetica-Bold').fontSize(16).text('Iglesia Hechos 1:8', 50, 95, { align: 'left' });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(MOSS_DARK).text(title, 50, 118);
    if (subtitle) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(subtitle, 50, 136);
    }
    doc.moveTo(50, 158).lineTo(562, 158).strokeColor(GOLD).lineWidth(1.5).stroke();
    doc.y = 172;
  }

  function drawFooter(pageNum, pageCount) {
    const bottom = doc.page.height - 45;
    doc.moveTo(50, bottom - 8).lineTo(562, bottom - 8).strokeColor(LINE).lineWidth(0.75).stroke();

    // Desactivamos temporalmente el margen inferior: escribir tan cerca del borde
    // haría que PDFKit interprete que el texto no cabe y agregue una página en blanco.
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
      `Generado desde el portal el ${new Date().toLocaleDateString('es-NI', { day: '2-digit', month: 'long', year: 'numeric' })}`,
      50, bottom, { lineBreak: false }
    );
    doc.text(`Página ${pageNum} de ${pageCount}`, 400, bottom, { width: 162, align: 'right', lineBreak: false });
    doc.page.margins.bottom = originalBottomMargin;
  }

  drawHeader();
  doc.on('pageAdded', drawHeader);

  return {
    doc,
    finish() {
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        drawFooter(i - range.start + 1, range.count);
      }
      doc.end();
    },
  };
}

/** Dibuja una tabla simple de dos columnas con encabezado de color y filas alternadas. */
function drawTable(doc, columns, rows, { startY } = {}) {
  const left = 50;
  const width = 512;
  const padding = 10;
  let y = startY || doc.y + 10;
  const headerHeight = 24;
  const lineHeight = 13; // alto aproximado de una línea de texto a 10pt
  const minRowHeight = 24;

  // Encabezado
  doc.rect(left, y, width, headerHeight).fill(MOSS);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10);
  let x = left + padding;
  columns.forEach((col) => {
    doc.text(col.label, x, y + 7, { width: col.width - padding, align: col.align || 'left' });
    x += col.width;
  });
  y += headerHeight;

  // Filas — la altura se calcula según la celda con más texto, para que nada se encime.
  doc.font('Helvetica').fontSize(10);
  rows.forEach((row, idx) => {
    const rowHeight = Math.max(
      minRowHeight,
      ...columns.map((col) => doc.heightOfString(String(row[col.key] ?? ''), { width: col.width - padding }) + 14)
    );

    if (y + rowHeight > doc.page.height - 80) {
      doc.addPage();
      y = doc.y; // el membrete de la nueva página ya posicionó doc.y; evita que la tabla se monte sobre él
    }
    if (idx % 2 === 0) {
      doc.rect(left, y, width, rowHeight).fill('#f6f4ee');
    }
    doc.fillColor('#1c2a24').font('Helvetica').fontSize(10);
    x = left + padding;
    columns.forEach((col) => {
      doc.text(String(row[col.key] ?? ''), x, y + 7, { width: col.width - padding, align: col.align || 'left' });
      x += col.width;
    });
    y += rowHeight;
  });

  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(LINE).stroke();
  doc.y = y + 14;
}

// GET /api/reports/finanzas.pdf -> desglose de finanzas del mes en curso (admin/tesorero)
// GET /api/reports/finanzas.pdf?from=2026-08-01&to=2026-09-30 -> reporte flexible (mes, varios meses, o año)
router.get('/finanzas.pdf', requireAuth, requireRole('admin', 'superadmin', 'finance'), async (req, res) => {
  let { from, to } = req.query;
  if (!from || !to) {
    from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    to = from;
  }

  const { rows: totals } = await pool.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE entry_type = 'ingreso'), 0) AS ingresos,
       COALESCE(SUM(amount) FILTER (WHERE entry_type = 'egreso'), 0) AS egresos
     FROM finance_entries WHERE entry_month >= $1 AND entry_month <= $2`,
    [from, to]
  );
  const { rows: byCategory } = await pool.query(
    `SELECT fc.name,
       COALESCE(SUM(fe.amount) FILTER (WHERE fe.entry_type = 'ingreso'), 0) AS ingresos,
       COALESCE(SUM(fe.amount) FILTER (WHERE fe.entry_type = 'egreso'), 0) AS egresos
     FROM finance_categories fc
     LEFT JOIN finance_entries fe ON fe.category_id = fc.id AND fe.entry_month >= $1 AND fe.entry_month <= $2
     GROUP BY fc.name
     HAVING COALESCE(SUM(fe.amount), 0) > 0
     ORDER BY fc.name`,
    [from, to]
  );
  const { rows: byMonth } = await pool.query(
    `SELECT to_char(entry_month, 'TMMonth YYYY') AS month_label, entry_month,
       COALESCE(SUM(amount) FILTER (WHERE entry_type = 'ingreso'), 0) AS ingresos,
       COALESCE(SUM(amount) FILTER (WHERE entry_type = 'egreso'), 0) AS egresos
     FROM finance_entries WHERE entry_month >= $1 AND entry_month <= $2
     GROUP BY entry_month ORDER BY entry_month`,
    [from, to]
  );

  const fromDate = new Date(from);
  const toDate = new Date(to);
  const rangeLabel = fromDate.getTime() === toDate.getTime()
    ? fromDate.toLocaleDateString('es-NI', { month: 'long', year: 'numeric' })
    : `${fromDate.toLocaleDateString('es-NI', { month: 'long', year: 'numeric' })} — ${toDate.toLocaleDateString('es-NI', { month: 'long', year: 'numeric' })}`;

  const { doc, finish } = createLetterheadPdf(res, 'reporte-finanzas.pdf', 'Reporte de Finanzas', rangeLabel);

  const ingresos = Number(totals[0].ingresos);
  const egresos = Number(totals[0].egresos);

  // Si el rango cubre más de un mes, primero un resumen por mes.
  if (byMonth.length > 1) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor(MOSS_DARK).text('Resumen por mes', 50, doc.y);
    doc.moveDown(0.3);
    drawTable(
      doc,
      [
        { key: 'month_label', label: 'Mes', width: 200 },
        { key: 'ingresos', label: 'Ingresos', width: 156, align: 'right' },
        { key: 'egresos', label: 'Egresos', width: 156, align: 'right' },
      ],
      byMonth.map((r) => ({ month_label: r.month_label.trim(), ingresos: money(r.ingresos), egresos: money(r.egresos) }))
    );
    doc.moveDown(0.5);
  }

  doc.font('Helvetica-Bold').fontSize(12).fillColor(MOSS_DARK).text('Desglose por categoría', 50, doc.y);
  doc.moveDown(0.3);
  drawTable(
    doc,
    [
      { key: 'name', label: 'Categoría', width: 200 },
      { key: 'ingresos', label: 'Ingresos', width: 156, align: 'right' },
      { key: 'egresos', label: 'Egresos', width: 156, align: 'right' },
    ],
    byCategory.length > 0
      ? byCategory.map((r) => ({ name: r.name, ingresos: money(r.ingresos), egresos: money(r.egresos) }))
      : [{ name: 'Sin movimientos en este rango', ingresos: money(0), egresos: money(0) }]
  );

  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(MOSS_DARK)
    .text('Total ingresos:', 50, doc.y, { continued: true, width: 330 })
    .fillColor('#2f6b3a').text(money(ingresos), { align: 'right' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(MOSS_DARK)
    .text('Total egresos:', 50, doc.y, { continued: true, width: 330 })
    .fillColor('#b23b3b').text(money(egresos), { align: 'right' });
  doc.font('Helvetica-Bold').fontSize(13).fillColor(MOSS_DARK)
    .text('Balance:', 50, doc.y, { continued: true, width: 330 })
    .text(money(ingresos - egresos), { align: 'right' });

  finish();
});

// GET /api/reports/diezmos.pdf -> estado de confirmación de diezmo por miembro (sin montos)
router.get('/diezmos.pdf', requireAuth, requireRole('admin', 'superadmin', 'finance'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.full_name, (tc.id IS NOT NULL) AS confirmed
     FROM users u
     LEFT JOIN tithe_confirmations tc ON tc.user_id = u.id AND tc.month = $1
     WHERE u.role = 'member'
     ORDER BY u.full_name`,
    [currentMonth()]
  );

  const { doc, finish } = createLetterheadPdf(res, 'reporte-diezmos.pdf', 'Estado de Diezmo', monthLabel());

  drawTable(
    doc,
    [
      { key: 'full_name', label: 'Miembro', width: 340 },
      { key: 'status', label: 'Estado', width: 172, align: 'right' },
    ],
    rows.map((r) => ({ full_name: r.full_name, status: r.confirmed ? 'Confirmado' : 'Pendiente' }))
  );

  const confirmedCount = rows.filter((r) => r.confirmed).length;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(MOSS_DARK)
    .text(`${confirmedCount} de ${rows.length} miembros han confirmado su diezmo este mes.`, 50, doc.y);

  finish();
});

// GET /api/reports/miembros.pdf?cell_id=1 -> listado de miembros, agrupado por célula (o solo una si se filtra)
router.get('/miembros.pdf', requireAuth, requireRole('admin', 'superadmin', 'secretary'), async (req, res) => {
  const { cell_id, q } = req.query;
  const { rows: cellList } = await pool.query(
    cell_id ? 'SELECT id, name FROM cells WHERE id = $1 ORDER BY id' : 'SELECT id, name FROM cells ORDER BY id',
    cell_id ? [cell_id] : []
  );
  const members = await fetchMembers({ cell_id, q });

  const totalCount = members.length;
  const reportTitle = cell_id && cellList[0] ? `Miembros — ${cellList[0].name}` : 'Miembros por Célula';
  const { doc, finish } = createLetterheadPdf(res, 'reporte-miembros.pdf', reportTitle, `${totalCount} miembros registrados${q && String(q).trim() ? ` · búsqueda: "${String(q).trim()}"` : ''}`);

  const groups = [
    ...cellList.map((c) => ({ label: c.name, members: members.filter((m) => m.cell_id === c.id) })),
    ...(cell_id ? [] : [{ label: 'Sin célula asignada', members: members.filter((m) => !m.cell_id) }]),
  ].filter((g) => g.members.length > 0);

  groups.forEach((group, i) => {
    if (doc.y > doc.page.height - 140) doc.addPage();
    if (i > 0) doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(12).fillColor(MOSS_DARK).text(`${group.label}  ·  ${group.members.length}`, 50, doc.y);
    doc.moveTo(50, doc.y + 4).lineTo(300, doc.y + 4).strokeColor(GOLD).lineWidth(1).stroke();
    doc.moveDown(0.6);

    group.members.forEach((m) => {
      if (doc.y > doc.page.height - 90) doc.addPage();
      doc.font('Helvetica').fontSize(10.5).fillColor('#2b2b26').text(`•  ${m.full_name}`, 62, doc.y);
      doc.moveDown(0.25);
    });
  });

  finish();
});

// GET /api/reports/programacion/:id.pdf -> PDF con membrete de cualquier tipo de Programación aprobada
const SCHEDULE_TITLES = {
  evento: 'Programa de Evento Especial',
  culto_mensual: 'Programación de Cultos',
  celula: 'Programación de Célula',
  escuela_dominical: 'Escuela Dominical',
  ministerio: 'Programación de Ministerio',
};
const SCHEDULE_COLUMNS = {
  evento: [
    { key: 'bloque', label: 'Bloque', width: 80 },
    { key: 'hora', label: 'Hora', width: 90 },
    { key: 'actividad', label: 'Actividad', width: 150 },
    { key: 'participante', label: 'Participante', width: 110 },
    { key: 'notas', label: 'Notas', width: 82 },
  ],
  ministerio: [
    { key: 'fecha', label: 'Fecha', width: 80 },
    { key: 'servicio', label: 'Servicio', width: 130 },
    { key: 'miembros', label: 'Sirven', width: 200 },
    { key: 'notas', label: 'Notas', width: 92 },
  ],
  culto_mensual: [
    { key: 'fecha', label: 'Fecha', width: 90 },
    { key: 'lectura', label: 'Lectura', width: 130 },
    { key: 'cita', label: 'Cita', width: 90 },
    { key: 'predica', label: 'Predica', width: 120 },
    { key: 'especial', label: 'Especial', width: 82 },
  ],
  celula: [
    { key: 'fecha', label: 'Fecha', width: 80 },
    { key: 'dirige', label: 'Dirige', width: 110 },
    { key: 'reflexion', label: 'Reflexión', width: 110 },
    { key: 'lectura', label: 'Lectura', width: 110 },
    { key: 'observacion', label: 'Observación', width: 102 },
  ],
  escuela_dominical: [
    { key: 'fecha', label: 'Fecha', width: 90 },
    { key: 'tema', label: 'Tema', width: 180 },
    { key: 'encargado', label: 'Encargado', width: 130 },
    { key: 'cita', label: 'Cita', width: 112 },
  ],
};

router.get('/programacion/:id.pdf', requireAuth, async (req, res) => {
  const { rows: schedRows } = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.id]);
  if (schedRows.length === 0) return res.status(404).json({ error: 'No encontrado.' });
  const schedule = schedRows[0];

  const isPrivileged = ['admin', 'superadmin'].includes(req.user.role);
  if (schedule.status !== 'approved' && !isPrivileged && schedule.created_by !== req.user.id) {
    return res.status(403).json({ error: 'No tienes acceso a esta programación aún.' });
  }

  // Un evento deja de poder imprimirse el día después de su fecha para miembros normales —
  // admin/superadmin conservan acceso siempre, para consulta futura en el Historial.
  if (schedule.type === 'evento' && schedule.reference_date && !isPrivileged) {
    const today = new Date().toISOString().slice(0, 10);
    const eventDate = new Date(schedule.reference_date).toISOString().slice(0, 10);
    if (eventDate < today) {
      return res.status(410).json({ error: 'Este evento ya pasó — el programa ya no está disponible para imprimir.' });
    }
  }

  const { rows: dataRows } = await pool.query(
    'SELECT * FROM schedule_rows WHERE schedule_id = $1 ORDER BY row_order',
    [req.params.id]
  );

  // Si no es uno de los 4 tipos fijos, busca la plantilla personalizada para el nombre y las columnas.
  let customTemplate = null;
  if (!SCHEDULE_TITLES[schedule.type]) {
    const { rows: tRows } = await pool.query('SELECT * FROM custom_templates WHERE type_key = $1', [schedule.type]);
    customTemplate = tRows[0] || null;
  }

  // Para 'ministerio', las columnas las define cada ministerio (row_fields propio), no una lista fija.
  let ministryRowFields = null;
  if (schedule.type === 'ministerio' && schedule.ministry_id) {
    const { rows: minRows } = await pool.query('SELECT row_fields FROM ministries WHERE id = $1', [schedule.ministry_id]);
    ministryRowFields = minRows[0]?.row_fields || null;
  }

  const dateLabel = schedule.reference_date
    ? new Date(schedule.reference_date).toLocaleDateString('es-NI', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';
  const subtitleParts = [dateLabel, schedule.location].filter(Boolean);

  const { doc, finish } = createLetterheadPdf(
    res,
    `${schedule.type}-${schedule.id}.pdf`,
    schedule.title,
    [SCHEDULE_TITLES[schedule.type] || customTemplate?.name || schedule.type, ...subtitleParts].join(' · ')
  );

  const meta = schedule.meta || {};
  const headerFieldDefs = customTemplate?.header_fields || [];
  const metaLabels = Object.fromEntries(headerFieldDefs.map((f) => [f.key, f.label]));
  const metaTypes = Object.fromEntries(headerFieldDefs.map((f) => [f.key, f.type]));
  const metaLines = Object.entries(meta).filter(([k, v]) => v && !k.endsWith('_user_id') && !k.endsWith('_user_ids') && !k.endsWith('_cumplido'));
  if (metaLines.length > 0) {
    doc.font('Helvetica').fontSize(10).fillColor(MUTED);
    metaLines.forEach(([k, v]) => {
      const label = metaLabels[k] || (k.charAt(0).toUpperCase() + k.slice(1));
      const display = metaTypes[k] === 'fecha' ? new Date(v).toLocaleDateString('es-NI', { day: '2-digit', month: 'long', year: 'numeric' }) : String(v);
      doc.font('Helvetica-Bold').fillColor(MOSS_DARK).text(`${label}: `, 50, doc.y, { continued: true });
      doc.font('Helvetica').fillColor(MUTED).text(display);
    });
    doc.moveDown(0.5);
  }

  const columns = ministryRowFields
    ? ministryRowFields.map((f) => ({ key: f.key, label: f.label, width: Math.floor(512 / Math.max(ministryRowFields.length, 1)) }))
    : SCHEDULE_COLUMNS[schedule.type] ||
      (customTemplate?.row_fields || []).map((f) => ({ key: f.key, label: f.label, width: Math.floor(512 / Math.max(customTemplate.row_fields.length, 1)) }));
  if (dataRows.length > 0 && columns.length > 0) {
    drawTable(doc, columns, dataRows.map((r) => r.data));
  }

  finish();
});

// GET /api/reports/miembros?cell_id=1&q=juan -> la misma lista del PDF, en JSON, para la vista previa en pantalla
router.get('/miembros', requireAuth, requireRole('admin', 'superadmin', 'secretary'), async (req, res) => {
  const { cell_id, q } = req.query;
  res.json(await fetchMembers({ cell_id, q }));
});

// GET /api/reports/acuerdos/:id.pdf -> informe oficial de una reunión: encabezado, asistentes, acuerdos y firmas
const AGREEMENT_STATUS = { pendiente: 'Pendiente', en_proceso: 'En proceso', cumplido: 'Cumplido' };
router.get('/acuerdos/:id.pdf', requireAuth, requireRole('admin', 'superadmin', 'secretary'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.id, m.meeting_type, m.attendees, to_char(m.meeting_date, 'YYYY-MM-DD') AS d
     FROM leader_meetings m WHERE m.id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Reunión no encontrada.' });
  const meeting = rows[0];
  const { rows: agreements } = await pool.query(
    `SELECT description, responsible, to_char(due_date, 'DD/MM/YYYY') AS due, status
     FROM meeting_agreements WHERE meeting_id = $1 ORDER BY row_order, id`,
    [meeting.id]
  );

  const dateLabel = new Date(`${meeting.d}T00:00:00`).toLocaleDateString('es-NI', { day: '2-digit', month: 'long', year: 'numeric' });
  const attendees = Array.isArray(meeting.attendees) ? meeting.attendees : [];
  const { doc, finish } = createLetterheadPdf(res, `acuerdos-${meeting.d}.pdf`, 'Acuerdos de Reunión', `${meeting.meeting_type} · ${dateLabel}`);

  const line = (label, value) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(MOSS_DARK).text(`${label}: `, 50, doc.y, { continued: true });
    doc.font('Helvetica').fillColor(MUTED).text(value);
  };
  line('Fecha', dateLabel);
  line('Tipo de reunión', meeting.meeting_type);
  line(`Asistentes (${attendees.length})`, attendees.length ? attendees.join(', ') : 'Sin registrar');
  doc.moveDown(0.6);

  doc.font('Helvetica-Bold').fontSize(12).fillColor(MOSS_DARK).text('Acuerdos', 50, doc.y);
  doc.moveDown(0.3);
  if (agreements.length > 0) {
    drawTable(
      doc,
      [
        { key: 'n', label: '#', width: 30 },
        { key: 'description', label: 'Acuerdo', width: 212 },
        { key: 'responsible', label: 'Responsable', width: 110 },
        { key: 'due', label: 'Fecha límite', width: 80 },
        { key: 'status', label: 'Estado', width: 80 },
      ],
      agreements.map((a, i) => ({
        n: i + 1, description: a.description, responsible: a.responsible || '—', due: a.due || '—', status: AGREEMENT_STATUS[a.status] || a.status,
      }))
    );
  } else {
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('Esta reunión no tiene acuerdos registrados.', 50, doc.y);
  }

  // Firmas
  if (doc.y > doc.page.height - 190) doc.addPage();
  const y = doc.y + 70;
  doc.strokeColor(MOSS_DARK).lineWidth(0.8);
  doc.moveTo(70, y).lineTo(250, y).stroke();
  doc.moveTo(330, y).lineTo(510, y).stroke();
  doc.font('Helvetica').fontSize(9).fillColor(MOSS_DARK);
  doc.text('Secretaría', 70, y + 5, { width: 180, align: 'center', lineBreak: false });
  doc.text('Pastor / Presidencia', 330, y + 5, { width: 180, align: 'center', lineBreak: false });

  finish();
});

// GET /api/reports/movimientos.pdf?from=&to=&type=&category_id=&q= -> informe de los movimientos tal como se ven en pantalla
// (mismos filtros que la consulta de Tesorería: período, tipo, categoría y búsqueda).
router.get('/movimientos.pdf', requireAuth, requireRole('admin', 'superadmin', 'finance'), async (req, res) => {
  const f = parseFilters(req.query);
  const { rows, totals } = await fetchMovements(f);

  const monthName = (d) => {
    const dt = new Date(`${d.slice(0, 7)}-01T00:00:00`);
    return `${dt.toLocaleDateString('es-NI', { month: 'long' })} ${dt.getFullYear()}`;
  };
  const period = f.from === f.to ? monthName(f.from) : `${monthName(f.from)} — ${monthName(f.to)}`;
  const view = f.type === 'ingreso' ? 'Solo ingresos' : f.type === 'egreso' ? 'Solo egresos' : 'Vista combinada';
  let categoryName = null;
  if (f.category_id) {
    const { rows: c } = await pool.query('SELECT name FROM finance_categories WHERE id = $1', [f.category_id]);
    categoryName = c[0]?.name || null;
  }
  const subtitle = [period, view, categoryName && `Categoría: ${categoryName}`, f.q && `Búsqueda: "${f.q}"`].filter(Boolean).join(' · ');
  const { doc, finish } = createLetterheadPdf(res, 'movimientos.pdf', 'Reporte de Movimientos Financieros', subtitle);

  doc.font('Helvetica-Bold').fontSize(12).fillColor(MOSS_DARK).text(`Detalle (${rows.length} movimiento${rows.length === 1 ? '' : 's'})`, 50, doc.y);
  doc.moveDown(0.3);
  const combined = !f.type;
  const columns = combined
    ? [
        { key: 'month', label: 'Mes', width: 100 },
        { key: 'category', label: 'Categoría', width: 115 },
        { key: 'note', label: 'Descripción', width: 135 },
        { key: 'type', label: 'Tipo', width: 62 },
        { key: 'amount', label: 'Monto', width: 100, align: 'right' },
      ]
    : [
        { key: 'month', label: 'Mes', width: 100 },
        { key: 'category', label: 'Categoría', width: 130 },
        { key: 'note', label: 'Descripción', width: 182 },
        { key: 'amount', label: 'Monto', width: 100, align: 'right' },
      ];
  drawTable(
    doc,
    columns,
    rows.length > 0
      ? rows.map((r) => ({
          month: monthName(r.entry_month), category: r.category_name, note: r.note || '—',
          type: r.entry_type === 'egreso' ? 'Egreso' : 'Ingreso', amount: money(r.amount),
        }))
      : [{ month: '', category: 'Sin movimientos con estos filtros', note: '', type: '', amount: money(0) }]
  );

  if (doc.y > doc.page.height - 130) doc.addPage();
  doc.moveDown(0.3);
  const totalLine = (label, value, color, size = 11) =>
    doc.font('Helvetica-Bold').fontSize(size).fillColor(MOSS_DARK)
      .text(label, 50, doc.y, { continued: true, width: 330 })
      .fillColor(color).text(money(value), { align: 'right' });
  if (f.type === 'ingreso') totalLine('Total ingresos:', totals.ingresos, '#2f6b3a');
  else if (f.type === 'egreso') totalLine('Total egresos:', totals.egresos, '#b23b3b');
  else {
    totalLine('Total ingresos:', totals.ingresos, '#2f6b3a');
    totalLine('Total egresos:', totals.egresos, '#b23b3b');
    totalLine('Balance:', totals.balance, MOSS_DARK, 13);
  }

  finish();
});

module.exports = router;