// Crea las tablas base del portal. Correr con: npm run migrate
const pool = require('./db');
const bcrypt = require('bcrypt');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member', -- 'member' | 'admin' | 'superadmin' | 'finance' | 'secretary'
  cell_id INTEGER, -- se referencia a cells(id) más abajo, tras crear esa tabla
  phone VARCHAR(30),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cells (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,        -- ej. "Célula 3" o "Vida Nueva"
  leader_id INTEGER REFERENCES users(id),
  meeting_day VARCHAR(20),           -- ej. "Jueves"
  meeting_time VARCHAR(20),          -- ej. "6:00 PM"
  location VARCHAR(200),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Ahora que existe cells, agregamos la referencia real desde users (solo si no existe ya).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_cell'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT fk_users_cell
      FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS finance_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL, -- ej. "Diezmos", "Ofrendas", "Kermess"
  color VARCHAR(20),                 -- color hex para mostrar en el desglose
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_entries (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES finance_categories(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL,
  entry_month DATE NOT NULL,          -- primer día del mes al que corresponde, ej. 2026-08-01
  note VARCHAR(255),
  registered_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS duties (
  id SERIAL PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_duties (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duty_id INTEGER NOT NULL REFERENCES duties(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'done'
  completed_at TIMESTAMP,
  UNIQUE(user_id, duty_id)
);

-- Motor genérico de "Programaciones": Eventos, Programación del mes, Células, y futuros tipos.
-- Un mismo par de tablas sirve para todos los tipos; cada fila de detalle es flexible (JSONB)
-- según lo que necesite ese tipo (ej. evento: hora/actividad/responsable; culto: fecha/lectura/cita/predicador).
CREATE TABLE IF NOT EXISTS schedules (
  id SERIAL PRIMARY KEY,
  type VARCHAR(30) NOT NULL, -- 'evento' | 'culto_mensual' | 'celula' | futuros tipos
  title VARCHAR(150) NOT NULL,
  reference_date DATE, -- fecha del evento, o primer día del mes que cubre la programación
  location VARCHAR(200),
  visible_to VARCHAR(20) NOT NULL DEFAULT 'all', -- 'all' por defecto; se puede restringir a futuro
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  created_by INTEGER NOT NULL REFERENCES users(id),
  reviewed_by INTEGER REFERENCES users(id),
  review_comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedule_rows (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  row_order INTEGER NOT NULL DEFAULT 0,
  data JSONB NOT NULL -- ej. {"fecha":"2026-08-05","lectura":"Hno. Albin Valverde","cita":"Gn. 47:1-14","predica":"Hno. Adalid Baca","especial":""}
);

-- Campos adicionales según el tipo de plantilla (ej. evento: encargado, recursos, observaciones).
-- JSONB flexible para no tener que agregar columnas nuevas cada vez que surge una plantilla distinta.
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

-- El admin crea la contraseña temporal; el miembro debe cambiarla en su primer ingreso.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true;

-- Ver Finanzas ya no es automático para todo miembro; el admin autoriza persona por persona.
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_finance BOOLEAN NOT NULL DEFAULT false;

-- Para el tipo 'celula': a qué célula pertenece esa programación (para mostrársela solo a ella).
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS cell_id INTEGER REFERENCES cells(id);

-- Registro digital de secretaría: bautizos y presentaciones de niños (respaldo del acta física).
CREATE TABLE IF NOT EXISTS church_records (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL, -- 'bautismo' | 'presentacion'
  full_name VARCHAR(150) NOT NULL,
  record_date DATE,
  officiant VARCHAR(150),
  notes TEXT,
  registered_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Plantillas personalizadas: el superadmin define nuevos tipos de "Programación" sin necesitar código.
-- header_fields: campos únicos arriba (ej. título, encargado). row_fields: columnas de una tabla repetible (opcional).
-- Cada campo es { key, label, type } donde type es 'texto' | 'fecha' | 'miembro' (selector con notificación automática).
CREATE TABLE IF NOT EXISTS custom_templates (
  id SERIAL PRIMARY KEY,
  type_key VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  description VARCHAR(255),
  icon VARCHAR(10) NOT NULL DEFAULT '📄',
  header_fields JSONB NOT NULL DEFAULT '[]',
  row_fields JSONB NOT NULL DEFAULT '[]',
  allowed_roles JSONB, -- null = cualquier miembro puede enviarla
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Información general de la iglesia ("Conócenos"): una sola fila (id=1), editable por el superadmin.
CREATE TABLE IF NOT EXISTS church_info (
  id INTEGER PRIMARY KEY DEFAULT 1,
  vision TEXT,
  mission TEXT,
  address TEXT,
  schedule_info TEXT,
  facebook VARCHAR(255),
  instagram VARCHAR(255),
  whatsapp VARCHAR(50),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(150),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Líderes de la congregación mostrados en "Conócenos". La foto se guarda como imagen embebida (base64),
-- para no depender de almacenamiento de archivos externo (Railway no conserva archivos entre despliegues).
CREATE TABLE IF NOT EXISTS church_leaders (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  role_title VARCHAR(150) NOT NULL,
  photo_data TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Servicios recurrentes que se muestran como recordatorio fijo en "Mis privilegios" (ej. culto dominical, miércoles).
CREATE TABLE IF NOT EXISTS church_services (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  day_of_week INTEGER NOT NULL, -- 0=domingo ... 6=sábado
  time_label VARCHAR(50) NOT NULL,
  location VARCHAR(150),
  icon VARCHAR(10) NOT NULL DEFAULT '⛪',
  active BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Cancelaciones puntuales: "este domingo en particular no hay este servicio", sin desactivarlo para siempre.
CREATE TABLE IF NOT EXISTS service_cancellations (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES church_services(id) ON DELETE CASCADE,
  cancel_date DATE NOT NULL,
  note VARCHAR(255),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(service_id, cancel_date)
);

-- Ministerios (ej. Ujieres, Alabanza, Jóvenes): el admin los crea y les asigna uno o más líderes.
-- Un líder puede liderar varios ministerios a la vez.
CREATE TABLE IF NOT EXISTS ministries (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) UNIQUE NOT NULL,
  description VARCHAR(255),
  icon VARCHAR(10) NOT NULL DEFAULT '🙏',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ministry_leaders (
  id SERIAL PRIMARY KEY,
  ministry_id INTEGER NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(ministry_id, user_id)
);

-- Para el tipo 'ministerio': a qué ministerio pertenece esa programación.
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS ministry_id INTEGER REFERENCES ministries(id);

CREATE TABLE IF NOT EXISTS document_templates (
  id SERIAL PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  category VARCHAR(100),
  file_url VARCHAR(500) NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_submissions (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES document_templates(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_url VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  reviewed_by INTEGER REFERENCES users(id),
  review_comment TEXT,
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

-- Autorreporte simple del miembro: "ya diezmé este mes". Sin monto, un registro por mes.
CREATE TABLE IF NOT EXISTS tithe_confirmations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- primer día del mes, ej. 2026-08-01
  confirmed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, month)
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  message TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMP,
  schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

// Para bases de datos que ya existían antes de agregar estas columnas (Railway en producción, por ejemplo).
const ALTER_STATEMENTS = [
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE;`,
];

async function migrate() {
  try {
    await pool.query(SCHEMA);
    console.log('Tablas creadas correctamente.');

    for (const stmt of ALTER_STATEMENTS) {
      await pool.query(stmt);
    }
    console.log('Columnas nuevas verificadas.');

    // Fila única de información general de la iglesia (queda vacía hasta que el superadmin la llene).
    await pool.query(`INSERT INTO church_info (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

    // Servicios recurrentes por defecto — solo la primera vez (si la tabla está vacía), para no duplicar
    // si el admin ya los editó o borró después.
    const { rows: existingServices } = await pool.query('SELECT COUNT(*) FROM church_services');
    if (Number(existingServices[0].count) === 0) {
      await pool.query(
        `INSERT INTO church_services (name, day_of_week, time_label, order_index) VALUES
         ('Servicio dominical (mañana)', 0, '10:00 AM', 0),
         ('Servicio dominical (tarde)', 0, '5:00 PM', 1),
         ('Servicio de miércoles', 3, '6:00 PM', 2)`
      );
      console.log('Servicios recurrentes por defecto creados.');
    }

    // Categorías de finanzas por defecto (el admin puede agregar más luego desde el portal).
    const defaultCategories = [
      ['Diezmos', '#2f4d3a'],
      ['Ofrendas', '#b98a3a'],
      ['Ofrendas especiales', '#8aa68e'],
      ['Kermess', '#c9b184'],
      ['Ofrenda células', '#7d9b8a'],
    ];
    for (const [name, color] of defaultCategories) {
      await pool.query(
        `INSERT INTO finance_categories (name, color) VALUES ($1, $2)
         ON CONFLICT (name) DO NOTHING`,
        [name, color]
      );
    }
    console.log('Categorías de finanzas por defecto verificadas.');

    // Las 4 células de la iglesia (el admin puede editar sus datos luego: líder, día, hora, lugar).
    for (let i = 1; i <= 4; i++) {
      const name = `Célula ${i}`;
      const { rows: existing } = await pool.query('SELECT id FROM cells WHERE name = $1', [name]);
      if (existing.length === 0) {
        await pool.query('INSERT INTO cells (name) VALUES ($1)', [name]);
      }
    }
    console.log('Las 4 células por defecto fueron verificadas.');

    // Deberes del cristiano por defecto (el admin puede agregar más luego).
    const defaultDuties = [
      ['Llevar un invitado', 'Invita a alguien a un servicio o actividad de la iglesia.'],
      ['Leer la Biblia esta semana', 'Dedica tiempo a la lectura bíblica personal.'],
      ['Orar por un hermano', 'Ora de manera intencional por otro miembro de la iglesia.'],
      ['Asistir a la célula', 'Participa en la reunión semanal de tu célula.'],
      ['Diezmar', 'Cumple con tu diezmo como parte de tu mayordomía.'],
    ];
    for (const [title, description] of defaultDuties) {
      const { rows: existing } = await pool.query('SELECT id FROM duties WHERE title = $1', [title]);
      if (existing.length === 0) {
        await pool.query('INSERT INTO duties (title, description) VALUES ($1, $2)', [title, description]);
      }
    }
    console.log('Deberes por defecto verificados.');

    // Crea un superadmin inicial si no existe ninguno todavía.
    const { rows } = await pool.query("SELECT id FROM users WHERE role = 'superadmin' LIMIT 1");
    if (rows.length === 0) {
      const username = process.env.SEED_ADMIN_USERNAME || 'admin';
      const plainPassword = process.env.SEED_ADMIN_PASSWORD || 'CambiarEsta123!';
      const hash = await bcrypt.hash(plainPassword, 10);
      await pool.query(
        `INSERT INTO users (full_name, username, password_hash, role) VALUES ($1, $2, $3, 'superadmin')`,
        ['Administrador Principal', username, hash]
      );
      console.log(`Superadmin creado -> usuario: ${username} / contraseña: ${plainPassword}`);
      console.log('IMPORTANTE: inicia sesión y cambia esta contraseña de inmediato.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error al migrar:', err);
    process.exit(1);
  }
}

migrate();
