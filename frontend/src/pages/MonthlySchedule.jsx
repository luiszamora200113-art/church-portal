import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

function formatMonth(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-NI', { month: 'long', year: 'numeric' });
}
function formatDay(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function downloadSchedulePdf(id, title, token, API_URL) {
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

export default function MonthlySchedule() {
  const { token, API_URL } = useAuth();
  const [schedule, setSchedule] = useState(null);
  const [sundaySchool, setSundaySchool] = useState(null);
  const [ministrySchedules, setMinistrySchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/schedules?type=culto_mensual`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch(`${API_URL}/api/schedules?type=escuela_dominical`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch(`${API_URL}/api/ministries`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ]).then(async ([cultoList, dominicalList, ministries]) => {
      if (cultoList.length > 0) {
        const res = await fetch(`${API_URL}/api/schedules/${cultoList[0].id}`, { headers: { Authorization: `Bearer ${token}` } });
        setSchedule(await res.json());
      }
      if (dominicalList.length > 0) {
        const res = await fetch(`${API_URL}/api/schedules/${dominicalList[0].id}`, { headers: { Authorization: `Bearer ${token}` } });
        setSundaySchool(await res.json());
      }
      // Para cada ministerio, trae su programación más reciente ya aprobada (si tiene alguna).
      const withSchedules = await Promise.all(
        ministries.map(async (m) => {
          const listRes = await fetch(`${API_URL}/api/schedules?type=ministerio&ministry_id=${m.id}`, { headers: { Authorization: `Bearer ${token}` } });
          const list = await listRes.json();
          if (list.length === 0) return null;
          const detailRes = await fetch(`${API_URL}/api/schedules/${list[0].id}`, { headers: { Authorization: `Bearer ${token}` } });
          const detail = await detailRes.json();
          return { ministry: m, schedule: detail };
        })
      );
      setMinistrySchedules(withSchedules.filter(Boolean));
    }).finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="muted center">Cargando…</p>;

  return (
    <div className="dash-wrap">
      <div className="dash-header">
        <div>
          <h1>Programación de Cultos</h1>
          <p className="subtitle">{schedule ? formatMonth(schedule.reference_date) : 'Aún no hay una programación aprobada'}</p>
        </div>
        {schedule && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn-outline" style={{ fontSize: 12 }} onClick={() => downloadSchedulePdf(schedule.id, schedule.title, token, API_URL)}>
              📄 Descargar / Imprimir PDF
            </button>
            <span className="sched-status">Aprobada</span>
          </div>
        )}
      </div>

      {!schedule && (
        <div className="card"><p className="muted">En cuanto el pastor apruebe la programación del mes, aparecerá aquí.</p></div>
      )}

      {schedule && (
        <div className="card">
          <table className="sched-table">
            <thead>
              <tr><th>Fecha</th><th>Lectura bíblica</th><th>Cita</th><th>Prédica</th><th>Especial</th></tr>
            </thead>
            <tbody>
              {schedule.rows.map((row) => (
                <tr key={row.id} className={row.data.especial ? 'special' : ''}>
                  <td>{formatDay(row.data.fecha)}</td>
                  {row.data.especial ? (
                    <>
                      <td colSpan="3">
                        {row.data.especial}
                        <span className="tag">Especial</span>
                      </td>
                      <td></td>
                    </>
                  ) : (
                    <>
                      <td>{row.data.lectura}</td>
                      <td>{row.data.cita}</td>
                      <td>{row.data.predica}</td>
                      <td></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="sched-section-divider" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', fontWeight: 700 }}>
        Escuela Dominical
      </div>

      {!sundaySchool && (
        <div className="card"><p className="muted">Aún no hay temas de escuela dominical aprobados.</p></div>
      )}

      {sundaySchool && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button className="btn-outline" style={{ fontSize: 12 }} onClick={() => downloadSchedulePdf(sundaySchool.id, sundaySchool.title, token, API_URL)}>
              📄 Descargar / Imprimir PDF
            </button>
          </div>
          <table className="sched-table">
            <thead><tr><th>Fecha</th><th>Tema</th><th>Encargado</th><th>Cita</th></tr></thead>
            <tbody>
              {sundaySchool.rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDay(row.data.fecha)}</td>
                  <td>{row.data.tema}</td>
                  <td>{row.data.encargado}</td>
                  <td>{row.data.cita}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ministrySchedules.map(({ ministry, schedule: ms }) => {
        const fields = ministry.row_fields && ministry.row_fields.length > 0
          ? ministry.row_fields
          : [{ key: 'fecha', label: 'Fecha', type: 'fecha' }, { key: 'servicio', label: 'Servicio', type: 'texto' }, { key: 'miembros', label: 'Sirven', type: 'miembros' }, { key: 'notas', label: 'Notas', type: 'texto' }];
        return (
          <React.Fragment key={ministry.id}>
            <div className="sched-section-divider" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', fontWeight: 700 }}>
              {ministry.icon} {ministry.name}
            </div>
            <div className="card">
              <table className="sched-table">
                <thead><tr>{fields.map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
                <tbody>
                  {ms.rows.map((row) => (
                    <tr key={row.id}>
                      {fields.map((f) => (
                        <td key={f.key}>{f.type === 'fecha' ? formatDay(row.data[f.key]) : row.data[f.key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
