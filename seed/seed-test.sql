-- Proyectos de PRUEBA. Datos de ejemplo generados, no trabajo real.
-- Se borran desde el panel cuando terminen las pruebas.
INSERT INTO proyectos (slug, title, summary, date, featured, draft, category, software, normativa, confidential, cover, model, planos, body) VALUES
('prueba-planimetria',
 '[PRUEBA] Planimetría de una placa base',
 'Ejercicio de vistas, cortes y acotado sobre una placa con taladro. Material de prueba.',
 '2026-10-01', 0, 0, 'dibujo-tecnico',
 '["AutoCAD"]', '["ISO 128"]', 0,
 '/media/portadas/test-portada-planimetria.webp',
 NULL,
 '[{"title": "Lámina 01 — Placa de prueba", "url": "/media/planos/test-plano-lamina-01.pdf"}]',
'## Contexto y problema

Ejercicio de prueba: documentar una placa base ficticia con vistas, un corte y acotado completo.

## Proceso

Modelo simple, extracción de vistas, corte longitudinal, acotado y validación de escala.

## Normativa aplicada

ISO 128 para representación y simbología básica.

## Software y herramientas

AutoCAD para la planimetría.

## Entregable

Lámina 01 en PDF más portada de prueba.

## Resultado

Ejercicio completado como prueba del flujo de publicación.'
),
('prueba-cnc',
 '[PRUEBA] Mueble RTA para corte CNC',
 'Ejercicio de despiece y archivos de corte para un mueble de prueba.',
 '2026-10-05', 1, 0, 'cad-cam',
 '["Fusion 360"]', '[]', 0,
 '/media/portadas/test-portada-cnc.webp',
 '/media/modelos/test-modelo-caja.glb',
 '[{"title": "Despiece de prueba", "url": "/media/planos/test-plano-mueble-rta.pdf"}]',
'## Contexto y problema

Ejercicio de prueba: despiece de un mueble RTA ficticio para corte CNC.

## Proceso

Modelado de volumen de prueba, extracción de piezas planas y planimetría.

## Normativa aplicada

Ninguna en particular: es un ejercicio.

## Software y herramientas

Fusion 360 para modelado y planimetría.

## Entregable

Modelo 3D de prueba, lámina de despiece y portada.

## Resultado

Ejercicio completado como prueba del flujo de publicación.'
),
('prueba-soporte',
 '[PRUEBA] Inventario de equipos de oficina',
 'Ejercicio de relevamiento e inventario de 10 equipos ficticios.',
 '2026-10-08', 0, 0, 'soporte-it',
 '[]', '[]', 0,
 '/media/portadas/test-portada-soporte.webp',
 NULL,
 '[]',
'## Contexto y problema

Ejercicio de prueba: relevar equipos de una oficina ficticia.

## Proceso

Planilla de inventario, revisión física y orden de datos.

## Normativa aplicada

Ninguna en particular: es un ejercicio.

## Software y herramientas

Planilla de cálculo.

## Entregable

Portada de prueba y este caso.

## Resultado

Ejercicio completado como prueba del flujo de publicación.'
);
