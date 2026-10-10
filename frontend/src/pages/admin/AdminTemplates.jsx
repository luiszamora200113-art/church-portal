import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

const FIELD_TYPES = [
  { value: 'texto', label: 'Texto libre' },
  { value: 'fecha', label: 'Fecha' },
  { value: 'miembro', label: 'Elegir un miembro (notifica automático)' },
  { value: 'miembros', label: 'Elegir varios miembros (convoca a todos)' },
];
const ROLE_OPTIONS = [
  { value: 'member', label: 'Miembro' },
  { value: 'admin', label: 'Admin' },
  { value: 'finance', label: 'Finanzas' },
  { value: 'secretary', label: 'Secretaría' },
  { value: 'education', label: 'Educación Cristiana' },
];

function emptyField() {
  return { key: '', label: '', type: 'texto' };
}

function FieldBuilder({ title, hint, fields, setFields }) {
  function updateField(i, patch) {
    const copy = [...fields];
    copy[i] = { ...copy[i], ...patch };
    if (patch.label !== undefined) {
      copy[i].key = patch.label.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }
    setFields(copy);
  }
  function removeField(i) {
    setFields(fields.filter((_, idx) => idx !== i));
  }

  return (
    <div style={{ marginTop: 14 }}>
      <label>{title}</label>
      <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>{hint}</p>
      {fields.map((f, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input
            style={{ flex: 2 }}
            placeholder="Nombre del campo (ej. Encargado)"
            value={f.label}
            onChange={(e) => updateField(i, { label: e.target.value })}
          />
          <select style={{ flex: 1 }} value={f.type} onChange={(e) => updateField(i, { type: e.target.value })}>
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button type="button" className="btn-outline" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => removeField(i)}>✕</button>
        </div>
      ))}
      <button type="button" className="btn-outline" style={{ fontSize: 12 }} onClick={() => setFields([...fields, emptyField()])}>
        + Agregar campo
      </button>
    </div>
  );
}

export default function AdminTemplates() {
  const { user, token, API_URL } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📄');
  const [headerFields, setHeaderFields] = useState([emptyField()]);
  const [rowFields, setRowFields] = useState([]);
  const [allowedRoles, setAllowedRoles] = useState([]); // vacío = cualquiera
  const [publishTo, setPublishTo] = useState('ninguno');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function loadTemplates() {
    fetch(`${API_URL}/api/custom-templates`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setTemplates)
      .catch(() => {});
  }

  useEffect(() => { loadTemplates(); }, [token]);

  function toggleRole(role) {
    setAllowedRoles((r) => (r.includes(role) ? r.filter((x) => x !== role) : [...r, role]));
  }

  function resetForm() {
    setEditingId(null);
    setName(''); setDescription(''); setIcon('📄');
    setHeaderFields([emptyField()]); setRowFields([]); setAllowedRoles([]); setPublishTo('ninguno');
    setError(''); setMessage('');
  }

  function startEdit(t) {
    setEditingId(t.id);
    setName(t.name);
    setDescription(t.description || '');
    setIcon(t.icon);
    setHeaderFields(t.header_fields.length ? t.header_fields : [emptyField()]);
    setRowFields(t.row_fields);
    setAllowedRoles(t.allowed_roles || []);
    setPublishTo(t.publish_to || 'ninguno');
    setError(''); setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setMessage('');
    if (!name.trim()) return setError('El nombre es requerido.');

    const body = {
      name, description, icon,
      header_fields: headerFields.filter((f) => f.label.trim()),
      row_fields: rowFields.filter((f) => f.label.trim()),
      allowed_roles: allowedRoles,
      publish_to: publishTo,
    };

    const res = await fetch(
      editingId ? `${API_URL}/api/custom-templates/${editingId}` : `${API_URL}/api/custom-templates`,
      {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    if (!res.ok) return setError(data.error || 'No se pudo guardar la plantilla.');

    const successMsg = editingId ? `Plantilla "${data.name}" actualizada.` : `Plantilla "${data.name}" creada. Ya aparece en Documentos para quien pueda usarla.`;
    resetForm();
    setMessage(successMsg);
    loadTemplates();
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Quitar esta plantilla? Ya no aparecerá para llenar (lo ya enviado se conserva).')) return;
    await fetch(`${API_URL}/api/custom-templates/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (editingId === id) resetForm();
    loadTemplates();
  }

  if (!['admin', 'superadmin'].includes(user?.role)) {
    return <p className="muted">Solo admin y superadmin pueden crear plantillas nuevas.</p>;
  }

  return (
    <div>
      <h1>Plantillas</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        Crea un tipo de documento nuevo (ej. "Solicitud de equipo") sin necesitar programación. Define los campos y el sistema arma el formulario solo.
      </p>

      <form className="card" onSubmit={handleSubmit}>
        <h2>{editingId ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
        <label>Nombre</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Solicitud de equipo" required />
        <label>Descripción corta (opcional)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Se muestra debajo del nombre" />
        <label>Ícono (un emoji)</label>
        <input value={icon} onChange={(e) => setIcon(e.target.value)} style={{ maxWidth: 80 }} />

        <FieldBuilder
          title="Campos generales (una sola vez por documento)"
          hint='Ej. "Fecha", "Lugar", "Líderes convocados" — cada uno con su tipo.'
          fields={headerFields}
          setFields={setHeaderFields}
        />
        <FieldBuilder
          title="Columnas de tabla (opcional — filas repetibles)"
          hint='Déjalo vacío si esta plantilla no necesita una tabla. Ej. para una agenda: "Punto a tratar", "Responsable".'
          fields={rowFields}
          setFields={setRowFields}
        />

        <label style={{ marginTop: 14 }}>Destino de publicación (al aprobarse)</label>
        <select value={publishTo} onChange={(e) => setPublishTo(e.target.value)}>
          <option value="ninguno">Solo queda en Documentos / Historial</option>
          <option value="eventos">Publicar en la sección Eventos</option>
          <option value="programacion">Publicar en la sección Programación</option>
        </select>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Eventos: pide una fecha y desaparece al pasar el día. Programación: pide el mes y desaparece al terminar el mes. En ambos casos queda guardado en el Historial.
        </p>

        <label style={{ marginTop: 14 }}>¿Quién puede llenarla?</label>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
          {ROLE_OPTIONS.map((r) => (
            <label key={r.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13 }}>
              <input type="checkbox" style={{ width: 'auto', flexShrink: 0, margin: 0 }} checked={allowedRoles.includes(r.value)} onChange={() => toggleRole(r.value)} />
              {r.label}
            </label>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>Si no marcas ninguno, cualquier miembro podrá enviarla. Admin y Superadmin siempre pueden, sin importar esta selección.</p>

        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="primary" type="submit">{editingId ? 'Guardar cambios' : 'Crear plantilla'}</button>
          {editingId && <button type="button" className="btn-outline" onClick={resetForm}>Cancelar edición</button>}
        </div>
      </form>

      <div className="card">
        <h2>Plantillas existentes</h2>
        {templates.length === 0 && <p className="muted">Aún no has creado ninguna plantilla personalizada.</p>}
        {templates.map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
            <span style={{ fontSize: 18 }}>{t.icon}</span>
            <div style={{ flex: 1 }}>
              <strong>{t.name}</strong>
              {t.description && <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>{t.description}</p>}
              <p className="muted" style={{ fontSize: 11, margin: '2px 0 0' }}>
                Publica en: {t.publish_to === 'eventos' ? 'Eventos' : t.publish_to === 'programacion' ? 'Programación' : 'Solo Documentos'}
              </p>
            </div>
            <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => startEdit(t)}>Editar</button>
            <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => handleDelete(t.id)}>Quitar</button>
          </div>
        ))}
      </div>
    </div>
  );
}
