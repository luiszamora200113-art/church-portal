# Portal de Membresía — Iglesia Hechos 1:8

## Estructura
```
church-portal/
├── backend/     Node.js + Express + PostgreSQL (API)
└── frontend/    React + Vite (interfaz)
```

## Requisitos
- Node.js 18+
- PostgreSQL (local o en tu hosting: Railway, Render, etc.)

## 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edita `.env` con los datos de tu base de datos y una clave `JWT_SECRET` larga y aleatoria.

Crea las tablas y el primer administrador:
```bash
npm run migrate
```
Esto imprime en la consola el correo y la contraseña temporal del primer administrador (super admin). **Cambia esa contraseña al iniciar sesión por primera vez.**

Levanta el servidor:
```bash
npm run dev
```
Por defecto queda escuchando en `http://localhost:4000`.

## 2. Frontend

```bash
cd frontend
npm install
```

Crea un archivo `.env` con la URL de tu backend:
```
VITE_API_URL=http://localhost:4000
```

Levanta la app:
```bash
npm run dev
```
Se abre en `http://localhost:5173`.

## Módulos ya construidos
- **Login** con autenticación JWT
- **Crear miembro** (solo admin/superadmin) — genera credenciales y notifica al miembro dentro del portal
- **Notificaciones** — se muestran en el panel del miembro
- **Mi célula** — el miembro elige/cambia su célula; se ve el líder, horario y compañeros
- **Finanzas** — resumen y desglose por categoría (Diezmos, Ofrendas, Ofrendas especiales, Kermess, Ofrenda células), solo lectura para miembros; los admins pueden agregar categorías nuevas

## Pendiente (próximos pasos)
- Módulo de deberes del cristiano (checklist)
- Sección de documentos con plantillas + subida interactiva + aprobación de admin
- Registro de montos de finanzas desde el frontend (la ruta del backend ya existe: `POST /api/finance/entries`)
- Despliegue en producción (Railway/Render) y dominio propio

## Despliegue (resumen)
1. Crea una base de datos PostgreSQL en Railway o Render.
2. Sube la carpeta `backend/` como servicio Node — configura las variables de entorno del `.env` en el panel del hosting.
3. Corre `npm run migrate` una sola vez (Railway/Render permiten ejecutar comandos one-off).
4. Sube la carpeta `frontend/` como sitio estático (build con `npm run build`, carpeta de salida `dist/`) o como otro servicio Node con `npm run preview`.
5. Configura `VITE_API_URL` en el frontend apuntando a la URL pública de tu backend.
