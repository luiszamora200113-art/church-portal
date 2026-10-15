import React, { useEffect, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import VisorRecurso from '../components/VisorRecurso.jsx';
import { makeApi, fileToBase64, validateFile, fmtDate, fmtSize, STATUS_LABEL, ACCEPT, MAX_MB } from '../bibliotecaApi.js';
import '../biblioteca.css';

const emptyForm = { title: '', description: '', category_id: '' };

// Panel del gestor (rol Educación Cristiana): sube material, lo envía a revisión y ve su estado.
export default function BibliotecaEducacion() {
  const { user, loading, token, API_URL } = useAuth();
  const api = makeApi(token, API_URL);
  const fileRef = useRef(null);

  const [categories, setCategories] = useState([]);
  const [mine, setMine] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [sending, setSending] = useState(false);
  const [viewing, setViewing] = useState(null);

  function loadAll() {
    api('/categories').then(setCategories).catch(() => {});
    api('/mine').then(setMine).catch(() => {});
  }

  useEffect(() => { if (token) loadAll(); }, [token]);

  function resetForm() {
    setForm(emptyForm);
    setFile(null);
    setEditingId(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function pickFile(e) {
    const f = e.target.files[0] || null;
    const problem = validateFile(f);
    if (problem) {
      setMsg({ type: 'error', text: problem });
      e.target.value = '';
      setFile(null);
      return;
    }
    setMsg({ type: '', text: '' });
    setFile(f);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    if (!form.title.trim() || !form.category_id) {
      return setMsg({ type: 'error', text: 'Título y categoría son requeridos.' });
    }
    if (!editingId && !file) return setMsg({ type: 'error', text: 'Debes adjuntar un archivo.' });

    setSending(true);
    try {
      const body = { ...form };
      if (file) {
        body.file_name = file.name;
        body.file_base64 = await fileToBase64(file);
      }
      await api(editingId ? `/resources/${editingId}` : '/resources', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      setMsg({
        type: 'success',
        text: editingId
          ? 'Corregido y reenviado. Quedó pendiente de aprobación del pastor.'
          : 'Enviado. Quedó pendiente de aprobación del pastor.',
      });
      resetForm();
      loadAll();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSending(false);
    }
  }

  function startEdit(r) {
    setEditingId(r.id);
    setForm({ title: r.title, description: r.description || '', category_id: String(r.category_id || '') });
    setFile(null);
    setMsg({ type: '', text: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(r) {
    if (!window.confirm(`¿Eliminar "${r.title}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api(`/resources/${r.id}`, { method: 'DELETE' });
      if (editingId === r.id) resetForm();
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <p className="muted center">Cargando…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!['education', 'admin', 'superadmin'].includes(user.role)) return <Navigate to="/dashboard" replace />;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <img className="brand-logo" src="/assets/logo-claro.png" alt="Logo" />
          <span>Educación Cristiana</span>
        </div>
        <nav className="admin-nav">
          <Link to="/educacion">Temas</Link>
          <span className="active">Biblioteca</span>
        </nav>
        <Link className="admin-back" to="/dashboard">← Volver al portal</Link>
      </aside>

      <main className="admin-content">
        <h1>Biblioteca digital</h1>
        <p className="subtitle" style={{ marginBottom: 20 }}>
          Sube materiales y complétales su ficha. Nada se publica hasta que el pastor lo apruebe.
        </p>

        <form className="card" onSubmit={handleSubmit}>
          <h2>{editingId ? 'Corregir y reenviar' : 'Subir un recurso'}</h2>

          <label>Título</label>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={200} />

          <label>Descripción breve</label>
          <textarea
            className="bib-textarea"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="¿De qué trata este material y a quién le sirve?"
          />

          <label>Categoría</label>
          <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
            <option value="">Selecciona una categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <label>Archivo {editingId && '(opcional: solo si quieres reemplazarlo)'}</label>
          <input ref={fileRef} type="file" accept={ACCEPT} onChange={pickFile} />
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            PDF, Word, PowerPoint, Excel, TXT, JPG o PNG — máximo {MAX_MB} MB. El PDF es el que mejor se ve dentro del portal.
          </p>

          {msg.text && <p className={msg.type === 'success' ? 'success' : 'error'}>{msg.text}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="primary" type="submit" disabled={sending}>
              {sending ? 'Enviando…' : editingId ? 'Reenviar para aprobación' : 'Enviar para aprobación'}
            </button>
            {editingId && <button type="button" className="btn-outline" style={{ marginTop: 24 }} onClick={resetForm}>Cancelar</button>}
          </div>
        </form>

        <div className="card">
          <h2>Mis recursos ({mine.length})</h2>
          {mine.length === 0 && <p className="muted">Aún no has subido ningún material.</p>}
          {mine.map((r) => (
            <div key={r.id} className="bib-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{r.title}</strong>
                <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                  {r.category_name || 'Sin categoría'} · {fmtDate(r.created_at)} · {fmtSize(r.file_size)}
                </p>
                <span className={`bib-status bib-status-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                {r.status === 'rejected' && r.review_comment && (
                  <p className="bib-observation"><strong>Observación del pastor:</strong> {r.review_comment}</p>
                )}
              </div>
              <div className="bib-row-actions">
                <button className="btn-outline" onClick={() => setViewing(r)}>Ver</button>
                {r.status === 'rejected' && <button className="btn-outline" onClick={() => startEdit(r)}>Corregir</button>}
                {r.status !== 'approved' && <button className="btn-outline" onClick={() => remove(r)}>Eliminar</button>}
              </div>
            </div>
          ))}
        </div>
      </main>

      {viewing && <VisorRecurso resource={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
