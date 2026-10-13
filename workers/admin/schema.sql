-- Fuente única de verdad del portfolio. Los .mdx murieron.
--
-- proyectos.slug es la clave: sale del título, único, inmutable.
-- Listas JSON como TEXT (software, normativa, planos) porque D1 no tiene
-- arrays y el volumen no justifica tablas extra.

CREATE TABLE IF NOT EXISTS proyectos (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  featured INTEGER NOT NULL DEFAULT 0,
  draft INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT 'dibujo-tecnico',
  software TEXT NOT NULL DEFAULT '[]',
  normativa TEXT NOT NULL DEFAULT '[]',
  confidential INTEGER NOT NULL DEFAULT 0,
  cover TEXT,
  model TEXT,
  planos TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Interruptores de sección. Mismos nombres que usaba secciones.json.
CREATE TABLE IF NOT EXISTS secciones (
  name TEXT PRIMARY KEY,
  visible INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO secciones (name, visible) VALUES
  ('proyectos', 1),
  ('soporte-it', 1),
  ('cv', 1);
