# Sistema POS + Tienda web (multisede)

Next.js 14 + Supabase. Tienda pública en `/`, sistema interno en `/admin`.

## Instalación
1. `npm install`
2. Copia `.env.example` a `.env.local` y completa las claves de Supabase.
3. En Supabase > SQL Editor ejecuta **en orden**: `schema.sql`, `schema_v2.sql`, `schema_v3.sql`, `schema_v4.sql` `schema_v5.sql` `schema_v6.sql` y **`schema_v7.sql`** (si ya tenías los 4 primeros, corre solo v5, v6 y v7; son seguros de repetir).
4. `npm run dev`

## Qué trae la versión multisede (schema_v5)
- **Multisede real**: cada sede tiene su stock (tienda + almacén), cajas, correlativos (NV001-…, B001-…, F001-…, pedidos PW001-…) y pedidos web. Tus datos actuales pasan a la primera sede.
- **Seguridad por sede** (RLS): un trabajador solo ve y opera en las sedes asignadas en *Usuarios*; el administrador ve todo.
- **Ventas y pedidos atómicos en el servidor**: precios recalculados, stock validado y descontado sin condiciones de carrera.
- **Pedidos web**: el cliente elige contra entrega o Yape (QR + foto del pago), recibe el anuncio y su *TICKET DE PEDIDO* en PDF. El stock **no** se mueve hasta que confirmas en *Pedidos web*; ahí eliges Nota de venta / Boleta / Factura y se descuenta de la sede.
- **Sonido de pedidos**: sube tu `.mp3` en *Configuración* (con prueba y volumen). Si no subes nada suena un timbre incluido.
- **Login → elegir sede**, selector de sede en la barra superior, "Todas las sedes" (solo consulta y reportes) y apertura de caja por sede.
- **Tickets** tipo térmico (58/80 mm) en ventas del POS, comprobantes y pedidos, con tu logo (*Configuración*), dirección/teléfono de la sede y PDF.

## Primeros pasos tras migrar
1. *Configuración*: sube logo del ticket, QR de Yape, tu `.mp3`, RUC y color de marca.
2. *Sedes*: completa dirección, ciudad y teléfono de cada sede (salen en el ticket) y marca cuáles reciben pedidos web.
3. *Usuarios*: asigna sedes a tus trabajadores.
4. *Almacén/Productos*: carga el stock de cada sede nueva.

## Notas
- Los comprobantes son **internos**; no se envían a SUNAT. Para facturación electrónica real se integra un OFE/PSE aparte.
- `products.stock` y `products.stock_warehouse` quedan como columnas heredadas sin uso; el stock real está en `branch_stock`.
- Asistente: los atajos funcionan siempre; las preguntas libres requieren `ANTHROPIC_API_KEY` en el servidor.
- Los pedidos web llegan en vivo mientras haya una pestaña del sistema abierta (el navegador puede pedir un clic para permitir el sonido).

## Notificaciones push a clientes (schema_v6)
1. Genera tus claves una sola vez: `npx web-push generate-vapid-keys`.
2. Agrégalas a `.env.local` y a las variables de tu hosting: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secreta, nunca en el código) y `VAPID_SUBJECT=mailto:tucorreo`. Reinicia/redespliega.
3. En el sistema: **Herramientas → Anuncios** (solo administrador): escribe título y mensaje, envía una prueba a tu dispositivo y luego envía a todos o a los clientes de una sede.
- La tienda pide permiso con un aviso amable a los pocos segundos (el navegador exige un toque del usuario). Si lo rechazan no se vuelve a mostrar por 7 días.
- Requiere HTTPS (en `localhost` también funciona). En **iPhone** solo funciona si el cliente añade la web a su pantalla de inicio (iOS 16.4+); la tienda se lo explica.
- Los dispositivos que desinstalan o bloquean los avisos se eliminan solos al siguiente envío.

## Despliegue en Vercel
1. Importa el proyecto (Framework: Next.js, sin configuración extra).
2. En **Settings → Environment Variables** agrega, marcando **Production y Preview**:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (y opcional `ANTHROPIC_API_KEY`).
   La URL debe ser `https://xxxx.supabase.co`, sin `/` final, sin comillas ni espacios.
3. **Importante:** las variables `NEXT_PUBLIC_*` se incrustan al compilar. Si las agregas o cambias *después* de desplegar, haz **Deployments → ⋯ → Redeploy** (desmarca «Use existing Build Cache»).
4. Abre `https://TU-DOMINIO/diagnostico`: te dice qué variable falta o si hace falta un Redeploy.
5. En Supabase → Authentication → URL Configuration, pon tu dominio de Vercel en *Site URL*.

## Compatibilidad de las notificaciones
| Dispositivo / navegador | Funciona | Qué hace el cliente |
|---|---|---|
| Android: Chrome, Edge, Firefox, Samsung Internet, Opera | Sí | Toca **Activar** en el aviso |
| Windows / Mac / Linux: Chrome, Edge, Firefox, Opera | Sí | Toca **Activar** |
| Mac: Safari 16+ | Sí | Toca **Activar** |
| iPhone / iPad (iOS 16.4+) | Sí, con la web instalada | La tienda le muestra la guía: Compartir → «Añadir a pantalla de inicio» → abrir KOVA desde el ícono → **Activar** |
| Brave | Sí, tras activar «Usar servicios de Google para mensajería push» en `brave://settings/privacy` | El sistema se lo explica si falla |
| Navegador dentro de Instagram/Facebook/TikTok | No | La tienda le pide abrirla en Chrome/Safari (botón «Copiar enlace») |

- `VAPID_SUBJECT` debe ser un correo **real** (`mailto:tu@correo.com`) o `https://tudominio.com`. Chrome lo tolera mal escrito, pero Apple rechaza los envíos. `/diagnostico` lo valida.
- Si un envío falla, la pantalla *Anuncios* muestra el motivo devuelto por el servicio de cada plataforma.
- En iPhone no se muestra la imagen grande del anuncio, solo el texto.

## Stock mínimo y alerta de stock bajo (schema_v7)
- En **Productos → Nuevo/Editar** hay un campo **Stock mínimo** (por defecto 5; `0` = solo avisa cuando se agota). Es el mismo valor para todas las sedes.
- Un producto está en **stock bajo** cuando tienda + almacén de una sede es menor o igual a su mínimo, y **agotado** cuando es 0 (siempre alerta, incluso con mínimo 0 o si el producto nunca se cargó en esa sede).
- Al entrar al sistema aparece la ventana **Alerta de inventario**, una vez por sesión y por vista: en una sede muestra esa sede; en «Todas las sedes» muestra todas las sedes a las que tienes acceso (cada fila indica la sede). Un trabajador solo ve sus sedes.
- Si hay alertas, la barra superior muestra un botón ⚠ con el número para reabrir la ventana. «Ir a inventario» abre Productos filtrado por bajo/agotado.
- Para cambiar el mínimo de todos los productos a la vez: `update products set min_stock = 10;`

## Avisos con la web o el navegador cerrados
- Los avisos usan Web Push + service worker (`public/sw.js`): el cliente acepta **una sola vez** y recibe los anuncios aunque la pestaña o la web estén cerradas.
- Envío con urgencia alta y vigencia de 3 días: si el dispositivo está apagado o sin internet, el aviso llega cuando se reconecta.
- Si el navegador renueva la suscripción, el service worker se vuelve a suscribir solo (`/api/push/resubscribe`).
- Límites del navegador: en **Windows/Mac**, Chrome/Edge deben estar en ejecución (basta con que esté en segundo plano: Ajustes → Sistema → «Seguir ejecutando aplicaciones en segundo plano»); si el cliente cierra el navegador por completo, el aviso le llega al volver a abrirlo. En **Android** llega siempre. En **iPhone** requiere instalar la web en la pantalla de inicio.

## Ventana de producto en la tienda (schema_v8)
Ejecuta `supabase/schema_v8.sql` (agrega `products.description`). Al hacer clic en la foto o el nombre de un producto se abre una ventana con foto, descripción, precio y botón «Agregar al carrito». La descripción se escribe en Productos → Nuevo/Editar. La cabecera de la tienda queda fija al hacer scroll.

## Combos y promociones (schema_v9)
Ejecuta `supabase/schema_v9.sql` (después de v8) y vuelve a desplegar. Menú **Combos y promos** (solo administrador):
- **Combos**: varios productos por un precio propio, con foto y descripción. No tienen stock propio: la disponibilidad es lo que alcance de sus productos en cada sede; al venderlos (POS o web) se descuentan esos productos y al anular la venta se devuelven.
- **Promociones**: descuento en % o precio promocional sobre productos o combos, con fechas de inicio/fin y/o días de la semana (hora de Lima). Se pueden pausar. Si hay varias vigentes, gana el precio más bajo.
- El precio final lo calcula siempre la base de datos (POS y pedidos web). En el POS aparecen con etiqueta y filtros «Combos» y «Promos»; en la tienda, en las secciones Combos / Promociones / Ofertas.
- **Anuncios**: en el historial, «↻ Reenviar» vuelve a enviar el anuncio tal cual y «Editar» lo carga en el formulario.

## Costo e historial de movimientos (schema_v10)
Ejecuta `supabase/schema_v10.sql` (después de v9). Agrega `products.cost` y guarda en cada movimiento de stock cómo quedó tienda/almacén (antes → después; los movimientos anteriores se muestran sin esa columna).
- **Productos**: campo «Costo unitario», tarjeta «Valor del inventario (costo)» junto a la de venta, y botón **Historial de movimientos** (filtros por fechas, producto y tipo; Excel y PDF).
- **Almacén**: botón **Historial de traslados** (Almacén → Tienda, Tienda → Almacén, Entre sedes; por día o rango, búsqueda por nombre; Excel y PDF).
- Los productos existentes quedan con costo 0: edítalos para cargar el costo.

## Egresos con comprobante, compras, cajas y asistente (schema_v11)
Ejecuta `supabase/schema_v11.sql` (después de v10; si te salió «invalid configuration parameter name» ejecuta antes `supabase/fix_v10.sql` o vuelve a correr el v10 corregido).
- **Egresos**: formulario con categoría, comprobante (tipo/serie/número/fecha), proveedor, importe, descripción, foto y «Descontar de mi caja abierta». Pestaña **Compras de insumos**: registra compras con precios; al recibirlas entra stock al almacén y se actualiza el costo.
- **Cajas del día**: tarjetas con **Ver detalle**, **Ticket** (con logo, 58/80 mm) y **Descargar** (PDF A4 con detalle de ventas).
- **Productos**: columnas Precio de compra / Precio de venta / Ganancia (S/ y margen) y ganancia potencial.
- **Asistente KOVA**: guía por temas y preguntas con pasos del sistema, buscador de dudas y datos del negocio.

## Lector de código de barras (Ventas)
En Ventas, el lector agrega productos al carrito sin hacer clic en nada: el código del producto es su **SKU/código** (campo «Código» en Productos). Pitido y aviso verde/rojo; escanear de nuevo suma 1 unidad. No actúa mientras hay una ventana abierta o escribes en otro campo.

## Corrección de fotos de Marketing (schema_v14_fix_fotos)
Si Marketing veía «invalid regular expression: invalid repetition count(s)» al subir/cambiar una foto, ejecuta `supabase/schema_v14_fix_fotos.sql` en el SQL Editor de Supabase (no requiere redespliegue). PostgreSQL no admite cuantificadores mayores a 255 en un regex.

## Rol Marketing y fotos en el POS (schema_v12)
Ejecuta `supabase/schema_v12.sql` (después de v11) y redespliega. En Usuarios elige el rol **Marketing** (no necesita sedes): al entrar solo ve la pantalla **Fotos** y puede cambiar la foto de productos y combos; no ve ventas, stock, clientes ni configuración. El SQL además cierra un hueco: antes cualquier sesión podía escribir en `products` desde la API; ahora solo el personal (no marketing).

## Dashboard y Reportes rediseñados
- Gráficos propios en `lib/charts.js` (líneas suaves, barras, dona), sin librerías nuevas ni SQL nuevo.
- Dashboard: accesos rápidos, 4 KPI con "vs. ayer", ventas de la semana, ventas por categoría, evolución mensual (6 meses), ventas recientes y alertas de stock.
- Reportes: filtros (tipo, fechas, sede, comprobante, origen, restablecer), 6 KPI, resumen del periodo vs. periodo anterior, utilidad estimada (usa el costo del producto), métodos de pago, top productos y top categorías. Imprimir y Exportar CSV (ventas o egresos).
