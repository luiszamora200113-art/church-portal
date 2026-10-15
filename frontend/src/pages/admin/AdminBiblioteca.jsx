import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import VisorRecurso from '../../components/VisorRecurso.jsx';
import { makeApi, fileToBase64, validateFile, fmtDate, fmtSize, STATUS_LABEL, ACCEPT } from '../../bibliotecaApi.js';
import '../../biblioteca.css';

// Panel del Pastor / SuperAdmin / Admin: revisar y aprobar, editar, y administrar categorías.
export default function AdminBiblioteca() {
  const { token, API_URL } = useAuth();
  const api = makeApi(token, API_URL);

  const [tab, setTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [all, setAll] = useState([]);
  const [categories, setCategories] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState('');

  // revisión
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');

  // edición de un recurso
  const [editing, setEditing] = useState(null); // { id, title, description, category_id, file }

  // categorías
  const [newCat, setNewCat] = useState({ name: '', description: '' });
  const [editingCat, setEditingCat] = useState(null); // { id, name, description }

  function loadAll() {
    api('/pending').then(setPending).catch((e) => setError(e.message));
    api('/all').then(setAll).catch(() => {});
    api('/categories?all=1').then(setCategories).catch(() => {});
  }

  useEffect(() => { if (token) loadAll(); }, [token]);

  async function run(fn) {
    setError('');
    try {
      await fn();
      loadAll();
    } catch (e) {
      setError(e.message);
    }
  }

  const approve = (r) => run(() => api(`/resources/${r.id}/review`, { method: 'PATCH', body: JSON.stringify({ approve: true }) }));

  const reject = (r) => run(async () => {
    await api(`/resources/${r.id}/review`, { method: 'PATCH', body: JSON.stringify({ approve: false, comment: rejectNote }) });
    setRejectingId(null);
    setRejectNote('');
  });

  const removeResource = (r) => {
    if (!window.confirm(`¿Eliminar "${r.title}" definitivamente?`)) return;
    run(() => api(`/resources/${r.id}`, { method: 'DELETE' }));
  };

  function startEdit(r) {
    setEditing({ id: r.id, title: r.title, description: r.description || '', category_id: String(r.category_id || ''), file: null });
  }

  const saveEdit = () => run(async () => {
    const body = { title: editing.title, description: editing.description, category_id: editing.category_id };
    if (editing.file) {
      body.file_name = editing.file.name;
      body.file_base64 = await fileToBase64(editing.file);
    }
    await api(`/resources/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
    setEditing(null);
  });

  function pickEditFile(e) {
    const f = e.target.files[0] || null;
    const problem = validateFile(f);
    if (problem) {
      setError(problem);
      e.target.value = '';
      return;
    }
    setError('');
    setEditing((x) => ({ ...x, file: f }));
  }

  const addCategory = (e) => {
    e.preventDefault();
    if (!newCat.name.trim()) return;
    run(async () => {
      await api('/categories', { method: 'POST', body: JSON.stringify(newCat) });
      setNewCat({ name: '', description: '' });
    });
  };

  const saveCategory = () => run(async () => {
    await api(`/categories/${editingCat.id}`, { method: 'PUT', body: JSON.stringify({ name: editingCat.name, description: editingCat.description }) });
    setEditingCat(null);
  });

  const toggleCategory = (c) => run(() => api(`/categories/${c.id}`, {
    method: 'PUT',
    body: JSON.stringify({ name: c.name, description: c.description, active: !c.active }),
  }));

  const removeCategory = (c) => {
    const msg = c.resource_count > 0
      ? `"${c.name}" tiene ${c.resource_count} recurso(s), así que solo se desactivará (los recursos se conservan). ¿Continuar?`
      : `¿Eliminar la categoría "${c.name}"?`;
    if (!window.confirm(msg)) return;
    run(() => api(`/categories/${c.id}`, { method: 'DELETE' }));
  };

  const activeCategories = categories.filter((c) => c.active);

  function EditForm() {
    return (
      <div className="bib-edit">
        <label>Título</label>
        <input value={editing.title} onChange={(e) => setEditing((x) => ({ ...x, title: e.target.value }))} />
        <label>Descripción</label>
        <textarea className="bib-textarea" rows={3} value={editing.description} onChange={(e) => setEditing((x) => ({ ...x, description: e.target.value }))} />
        <label>Categoría</label>
        <select value={editing.category_id} onChange={(e) => setEditing((x) => ({ ...x, category_id: e.target.value }))}>
          <option value="">Selecciona una categoría</option>
          {activeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label>Reemplazar archivo (opcional)</label>
        <input type="file" accept={ACCEPT} onChange={pickEditFile} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="primary" style={{ marginTop: 0, width: 'auto', padding: '8px 16px' }} onClick={saveEdit}>Guardar cambios</button>
          <button className="btn-outline" onClick={() => setEditing(null)}>Cancelar</button>
        </div>
      </div>
    );
  }

  function ResourceInfo({ r }) {
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>{r.title}</strong>
        <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
          {r.category_name || 'Sin categoría'} · {r.file_name} ({fmtSize(r.file_size)}) · enviado por {r.uploaded_by_name || '—'} el {fmtDate(r.created_at)}
        </p>
        {r.description && <p style={{ fontSize: 13, margin: '6px 0 0' }}>{r.description}</p>}
      </div>
    );
  }

  return (
    <div>
      <h1>Biblioteca</h1>
      <p className="subtitle" style={{ marginBottom: 16 }}>
        Aprueba el material de Educación Cristiana y administra las categorías.
      </p>

      <div className="bib-tabs">
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
          Pendientes{pending.length > 0 ? ` (${pending.length})` : ''}
        </button>
        <button className={tab === 'categories' ? 'active' : ''} onClick={() => setTab('categories')}>Categorías</button>
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>Todos los recursos</button>
      </div>

      {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

      {tab === 'pending' && (
        <>
          {pending.length === 0 && <div className="card"><p className="muted">No hay recursos pendientes de aprobar.</p></div>}
          {pending.map((r) => (
            <div className="card" key={r.id}>
              {editing && editing.id === r.id ? (
                EditForm()
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 10 }}><ResourceInfo r={r} /></div>
                  {rejectingId === r.id ? (
                    <div style={{ marginTop: 12 }}>
                      <label>Observaciones del rechazo (obligatorio)</label>
                      <textarea className="bib-textarea" rows={3} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Ej. Falta la cita bíblica en la página 3" />
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button className="primary" style={{ marginTop: 0, width: 'auto', padding: '8px 16px', background: '#b23b3b' }} onClick={() => reject(r)}>Confirmar rechazo</button>
                        <button className="btn-outline" onClick={() => { setRejectingId(null); setRejectNote(''); }}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="bib-row-actions" style={{ marginTop: 12 }}>
                      <button className="btn-outline" onClick={() => setViewing(r)}>Ver</button>
                      <button className="btn-outline" onClick={() => startEdit(r)}>Editar</button>
                      <button className="primary" style={{ marginTop: 0, width: 'auto', padding: '8px 16px' }} onClick={() => approve(r)}>Aprobar y publicar</button>
                      <button className="btn-outline" onClick={() => setRejectingId(r.id)}>Rechazar</button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'categories' && (
        <>
          <form className="card" onSubmit={addCategory}>
            <h2>Nueva categoría</h2>
            <label>Nombre</label>
            <input value={newCat.name} onChange={(e) => setNewCat((c) => ({ ...c, name: e.target.value }))} placeholder="Ej. Matrimonios" />
            <label>Descripción (opcional)</label>
            <input value={newCat.description} onChange={(e) => setNewCat((c) => ({ ...c, description: e.target.value }))} />
            <button className="primary" type="submit">+ Crear categoría</button>
          </form>

          <div className="card">
            <h2>Categorías ({categories.length})</h2>
            <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Los cambios se reflejan al instante en el formulario de carga y en los filtros de la biblioteca. Una categoría con recursos no se borra: se desactiva.
            </p>
            {categories.map((c) => (
              <div key={c.id} className="bib-row" style={{ opacity: c.active ? 1 : 0.55 }}>
                {editingCat && editingCat.id === c.id ? (
                  <div style={{ flex: 1 }}>
                    <input value={editingCat.name} onChange={(e) => setEditingCat((x) => ({ ...x, name: e.target.value }))} />
                    <input style={{ marginTop: 8 }} value={editingCat.description || ''} onChange={(e) => setEditingCat((x) => ({ ...x, description: e.target.value }))} placeholder="Descripción" />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="primary" style={{ marginTop: 0, width: 'auto', padding: '6px 14px' }} onClick={saveCategory}>Guardar</button>
                      <button className="btn-outline" onClick={() => setEditingCat(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{c.name}</strong>{!c.active && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>(Desactivada)</span>}
                      <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                        {c.resource_count} recurso(s){c.description ? ` · ${c.description}` : ''}
                      </p>
                    </div>
                    <div className="bib-row-actions">
                      <button className="btn-outline" onClick={() => setEditingCat({ id: c.id, name: c.name, description: c.description })}>Editar</button>
                      <button className="btn-outline" onClick={() => toggleCategory(c)}>{c.active ? 'Desactivar' : 'Activar'}</button>
                      <button className="btn-outline" onClick={() => removeCategory(c)}>Eliminar</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'all' && (
        <div className="card">
          <h2>Todos los recursos ({all.length})</h2>
          {all.length === 0 && <p className="muted">Todavía no se ha subido ningún recurso.</p>}
          {all.map((r) => (
            <div key={r.id} style={{ borderBottom: '1px solid var(--line)', padding: '12px 0' }}>
              {editing && editing.id === r.id ? (
                EditForm()
              ) : (
                <div className="bib-row" style={{ border: 'none', padding: 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <ResourceInfo r={r} />
                    <span className={`bib-status bib-status-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                    {r.status === 'rejected' && r.review_comment && <p className="bib-observation"><strong>Observación:</strong> {r.review_comment}</p>}
                  </div>
                  <div className="bib-row-actions">
                    <button className="btn-outline" onClick={() => setViewing(r)}>Ver</button>
                    <button className="btn-outline" onClick={() => startEdit(r)}>Editar</button>
                    <button className="btn-outline" onClick={() => removeResource(r)}>Eliminar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {viewing && <VisorRecurso resource={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
