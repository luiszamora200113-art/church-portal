const express = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const currentMonth = () => new Date().toISOString().slice(0, 7) + '-01';
const money = (n) => `C$ ${Number(n).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');
const MOSS = '#2f4d3a';
const MOSS_DARK = '#1f3627';
const GOLD = '#b98a3a';
const MUTED = '#6b7268';
const LINE = '#dedad0';

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
      y = 50;
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
router.get('/finanzas.pdf', requireAuth, requireRole('admin', 'superadmin', 'finance'), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT fc.name, COALESCE(SUM(fe.amount), 0) AS total
    FROM finance_categories fc
    LEFT JOIN finance_entries fe
      ON fe.category_id = fc.id
      AND date_trunc('month', fe.entry_month) = date_trunc('month', CURRENT_DATE)
    GROUP BY fc.name
    ORDER BY fc.name
  `);

  const { doc, finish } = createLetterheadPdf(res, 'reporte-finanzas.pdf', 'Reporte de Finanzas', monthLabel());

  const total = rows.reduce((acc, r) => acc + Number(r.total), 0);

  drawTable(
    doc,
    [
      { key: 'name', label: 'Categoría', width: 340 },
      { key: 'total', label: 'Monto', width: 172, align: 'right' },
    ],
    rows.map((r) => ({ name: r.name, total: money(r.total) }))
  );

  doc.font('Helvetica-Bold').fontSize(12).fillColor(MOSS_DARK)
    .text('Total del mes:', 50, doc.y, { continued: true, width: 330 })
    .text(money(total), { align: 'right' });

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
router.get('/miembros.pdf', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { cell_id } = req.query;
  const { rows: cellList } = await pool.query(
    cell_id ? 'SELECT id, name FROM cells WHERE id = $1 ORDER BY id' : 'SELECT id, name FROM cells ORDER BY id',
    cell_id ? [cell_id] : []
  );
  const { rows: members } = await pool.query(`
    SELECT u.full_name, u.cell_id
    FROM users u
    WHERE u.role = 'member' ${cell_id ? 'AND u.cell_id = $1' : ''}
    ORDER BY u.full_name
  `, cell_id ? [cell_id] : []);

  const totalCount = members.length;
  const reportTitle = cell_id && cellList[0] ? `Miembros — ${cellList[0].name}` : 'Miembros por Célula';
  const { doc, finish } = createLetterheadPdf(res, 'reporte-miembros.pdf', reportTitle, `${totalCount} miembros registrados`);

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

module.exports = router;