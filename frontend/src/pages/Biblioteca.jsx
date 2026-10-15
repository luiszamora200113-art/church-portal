import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import VisorRecurso from '../components/VisorRecurso.jsx';
import { makeApi, downloadResource, fmtDate, fmtSize, extOf } from '../bibliotecaApi.js';
import '../biblioteca.css';

// Biblioteca pública: todos los miembros consultan; solo se ven los recursos Aprobados / Publicados.
export default function Biblioteca() {
  const { token, API_URL } = useAuth();
  const [resources, setResources] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [viewing, setViewing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const api = makeApi(token, API_URL);
    Promise.all([api('/resources'), api('/categories')])
      .then(([r, c]) => { setResources(r); setCategories(c); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Búsqueda en tiempo real (en el dispositivo) por título, descripción y categoría.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resources.filter((r) => {
      if (categoryId && String(r.category_id) !== categoryId) return false;
      if (!q) return true;
      return [r.title, r.description, r.category_name].some((t) => (t || '').toLowerCase().includes(q));
    });
  }, [resources, search, categoryId]);

  if (loading) return <p className="muted center">Cargando…</p>;

  return (
    <div className="dash-wrap">
      <div className="dash-header">
        <div>
          <h1>Biblioteca</h1>
          <p className="subtitle">Materiales de Educación Cristiana — léelos aquí o descárgalos</p>
        </div>
      </div>

      <div className="bib-filters">
        <input
          type="search"
          placeholder="Buscar por palabra clave…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {!error && filtered.length === 0 && (
        <div className="card">
          <p className="muted">
            {resources.length === 0
              ? 'Todavía no hay materiales publicados. Cuando el pastor apruebe alguno, aparecerá aquí.'
              : 'No se encontró nada con esa búsqueda o categoría.'}
          </p>
        </div>
      )}

      <div className="bib-grid">
        {filtered.map((r) => (
          <article className="bib-card" key={r.id}>
            <div className="bib-card-top">
              <span className="bib-chip">{r.category_name || 'Sin categoría'}</span>
              <span className="bib-ext">{extOf(r.file_name)}</span>
            </div>
            <h3>{r.title}</h3>
            {r.description && <p className="bib-desc">{r.description}</p>}
            <p className="muted bib-meta">{fmtDate(r.published_at)} · {fmtSize(r.file_size)}</p>
            <div className="bib-card-actions">
              <button className="primary" onClick={() => setViewing(r)}>Visualizar en pantalla</button>
              <button className="btn-outline" onClick={() => downloadResource(r, token, API_URL).catch((e) => alert(e.message))}>
                Descargar archivo
              </button>
            </div>
          </article>
        ))}
      </div>

      {viewing && <VisorRecurso resource={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
