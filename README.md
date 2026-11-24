# Sistema POS + Tienda web (multisede)

Next.js 14 + Supabase. Tienda pÃºblica en `/`, sistema interno en `/admin`.

## InstalaciÃ³n
1. `npm install`
2. Copia `.env.example` a `.env.local` y completa las claves de Supabase.
3. En Supabase > SQL Editor ejecuta **en orden**: `schema.sql`, `schema_v2.sql`, `schema_v3.sql`, `schema_v4.sql` `schema_v5.sql` `schema_v6.sql` y **`schema_v7.sql`** (si ya tenÃ­as los 4 primeros, corre solo v5, v6 y v7; son seguros de repetir).
4. `npm run dev`

## QuÃ© trae la versiÃ³n multisede (schema_v5)
- **Multisede real**: cada sede tiene su stock (tienda + almacÃ©n), cajas, correlativos (NV001-â€¦, B001-â€¦, F001-â€¦, pedidos PW001-â€¦) y pedidos web. Tus datos actuales pasan a la primera sede.
- **Seguridad por sede** (RLS): un trabajador solo ve y opera en las sedes asignadas en *Usuarios*; el administrador ve todo.
- **Ventas y pedidos atÃ³micos en el servidor**: precios recalculados, stock validado y descontado sin condiciones de carrera.
- **Pedidos web**: el cliente elige contra entrega o Yape (QR + foto del pago), recibe el anuncio y su *TICKET DE PEDIDO* en PDF. El stock **no** se mueve hasta que confirmas en *Pedidos web*; ahÃ­ eliges Nota de venta / Boleta / Factura y se descuenta de la sede.
- **Sonido de pedidos**: sube tu `.mp3` en *ConfiguraciÃ³n* (con prueba y volumen). Si no subes nada suena un timbre incluido.
- **Login â†’ elegir sede**, selector de sede en la barra superior, "Todas las sedes" (solo consulta y reportes) y apertura de caja por sede.
- **Tickets** tipo tÃ©rmico (58/80 mm) en ventas del POS, comprobantes y pedidos, con tu logo (*ConfiguraciÃ³n*), direcciÃ³n/telÃ©fono de la sede y PDF.

## Primeros pasos tras migrar
1. *ConfiguraciÃ³n*: sube logo del ticket, QR de Yape, tu `.mp3`, RUC y color de marca.
2. *Sedes*: completa direcciÃ³n, ciudad y telÃ©fono de cada sede (salen en el ticket) y marca cuÃ¡les reciben pedidos web.
3. *Usuarios*: asigna sedes a tus trabajadores.
4. *AlmacÃ©n/Productos*: carga el stock de cada sede nueva.

## Notas
- Los comprobantes son **internos**; no se envÃ­an a SUNAT. Para facturaciÃ³n electrÃ³nica real se integra un OFE/PSE aparte.
- `products.stock` y `products.stock_warehouse` quedan como columnas heredadas sin uso; el stock real estÃ¡ en `branch_stock`.
- Asistente: los atajos funcionan siempre; las preguntas libres requieren `ANTHROPIC_API_KEY` en el servidor.
- Los pedidos web llegan en vivo mientras haya una pestaÃ±a del sistema abierta (el navegador puede pedir un clic para permitir el sonido).

## Notificaciones push a clientes (schema_v6)
1. Genera tus claves una sola vez: `npx web-push generate-vapid-keys`.
2. AgrÃ©galas a `.env.local` y a las variables de tu hosting: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secreta, nunca en el cÃ³digo) y `VAPID_SUBJECT=mailto:tucorreo`. Reinicia/redespliega.
3. En el sistema: **Herramientas â†’ Anuncios** (solo administrador): escribe tÃ­tulo y mensaje, envÃ­a una prueba a tu dispositivo y luego envÃ­a a todos o a los clientes de una sede.
- La tienda pide permiso con un aviso amable a los pocos segundos (el navegador exige un toque del usuario). Si lo rechazan no se vuelve a mostrar por 7 dÃ­as.
- Requiere HTTPS (en `localhost` tambiÃ©n funciona). En **iPhone** solo funciona si el cliente aÃ±ade la web a su pantalla de inicio (iOS 16.4+); la tienda se lo explica.
- Los dispositivos que desinstalan o bloquean los avisos se eliminan solos al siguiente envÃ­o.

## Despliegue y SEO (dominio propio)
1. Sube el proyecto a GitHub y conéctalo a Vercel (Framework Next.js).
2. En Vercel > Settings > Environment Variables agrega:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (solo servidor)
   - `NEXT_PUBLIC_SITE_URL=https://licoreriakova.com` (dominio canónico, sin barra final)
   - `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` (token de Google Search Console)
3. En Vercel > Settings > Domains agrega `licoreriakova.com` y `www.licoreriakova.com`, y define `licoreriakova.com` como dominio principal. Vercel redirigirá `*.vercel.app` y `www` al dominio principal.
4. En Supabase > Authentication > URL Configuration, pon `https://licoreriakova.com` en *Site URL* y agrega redirects necesarios.
5. Redeploy. Verifica: `https://licoreriakova.com/robots.txt` y `https://licoreriakova.com/sitemap.xml`.
6. En Google Search Console: agrega la propiedad, verifica con la meta tag (`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`), envía `https://licoreriakova.com/sitemap.xml` y solicita indexación. El posicionamiento SEO toma tiempo; influyen contenido, reseñas, enlaces y rendimiento.

## Compatibilidad de las notificaciones
| Dispositivo / navegador | Funciona | Qué hace el cliente |
|---|---|---|
| Android: Chrome, Edge, Firefox, Samsung Internet, Opera | SÃ­ | Toca **Activar** en el aviso |
| Windows / Mac / Linux: Chrome, Edge, Firefox, Opera | SÃ­ | Toca **Activar** |
| Mac: Safari 16+ | SÃ­ | Toca **Activar** |
| iPhone / iPad (iOS 16.4+) | SÃ­, con la web instalada | La tienda le muestra la guÃ­a: Compartir â†’ Â«AÃ±adir a pantalla de inicioÂ» â†’ abrir KOVA desde el Ã­cono â†’ **Activar** |
| Brave | SÃ­, tras activar Â«Usar servicios de Google para mensajerÃ­a pushÂ» en `brave://settings/privacy` | El sistema se lo explica si falla |
| Navegador dentro de Instagram/Facebook/TikTok | No | La tienda le pide abrirla en Chrome/Safari (botÃ³n Â«Copiar enlaceÂ») |

- `VAPID_SUBJECT` debe ser un correo **real** (`mailto:tu@correo.com`) o `https://tudominio.com`. Chrome lo tolera mal escrito, pero Apple rechaza los envÃ­os. `/diagnostico` lo valida.
- Si un envÃ­o falla, la pantalla *Anuncios* muestra el motivo devuelto por el servicio de cada plataforma.
- En iPhone no se muestra la imagen grande del anuncio, solo el texto.

## Stock mÃ­nimo y alerta de stock bajo (schema_v7)
- En **Productos â†’ Nuevo/Editar** hay un campo **Stock mÃ­nimo** (por defecto 5; `0` = solo avisa cuando se agota). Es el mismo valor para todas las sedes.
- Un producto estÃ¡ en **stock bajo** cuando tienda + almacÃ©n de una sede es menor o igual a su mÃ­nimo, y **agotado** cuando es 0 (siempre alerta, incluso con mÃ­nimo 0 o si el producto nunca se cargÃ³ en esa sede).
- Al entrar al sistema aparece la ventana **Alerta de inventario**, una vez por sesiÃ³n y por vista: en una sede muestra esa sede; en Â«Todas las sedesÂ» muestra todas las sedes a las que tienes acceso (cada fila indica la sede). Un trabajador solo ve sus sedes.
- Si hay alertas, la barra superior muestra un botÃ³n âš  con el nÃºmero para reabrir la ventana. Â«Ir a inventarioÂ» abre Productos filtrado por bajo/agotado.
- Para cambiar el mÃ­nimo de todos los productos a la vez: `update products set min_stock = 10;`

## Avisos con la web o el navegador cerrados
- Los avisos usan Web Push + service worker (`public/sw.js`): el cliente acepta **una sola vez** y recibe los anuncios aunque la pestaÃ±a o la web estÃ©n cerradas.
- EnvÃ­o con urgencia alta y vigencia de 3 dÃ­as: si el dispositivo estÃ¡ apagado o sin internet, el aviso llega cuando se reconecta.
- Si el navegador renueva la suscripciÃ³n, el service worker se vuelve a suscribir solo (`/api/push/resubscribe`).
- LÃ­mites del navegador: en **Windows/Mac**, Chrome/Edge deben estar en ejecuciÃ³n (basta con que estÃ© en segundo plano: Ajustes â†’ Sistema â†’ Â«Seguir ejecutando aplicaciones en segundo planoÂ»); si el cliente cierra el navegador por completo, el aviso le llega al volver a abrirlo. En **Android** llega siempre. En **iPhone** requiere instalar la web en la pantalla de inicio.

## Ventana de producto en la tienda (schema_v8)
Ejecuta `supabase/schema_v8.sql` (agrega `products.description`). Al hacer clic en la foto o el nombre de un producto se abre una ventana con foto, descripciÃ³n, precio y botÃ³n Â«Agregar al carritoÂ». La descripciÃ³n se escribe en Productos â†’ Nuevo/Editar. La cabecera de la tienda queda fija al hacer scroll.

## Combos y promociones (schema_v9)
Ejecuta `supabase/schema_v9.sql` (despuÃ©s de v8) y vuelve a desplegar. MenÃº **Combos y promos** (solo administrador):
- **Combos**: varios productos por un precio propio, con foto y descripciÃ³n. No tienen stock propio: la disponibilidad es lo que alcance de sus productos en cada sede; al venderlos (POS o web) se descuentan esos productos y al anular la venta se devuelven.
- **Promociones**: descuento en % o precio promocional sobre productos o combos, con fechas de inicio/fin y/o dÃ­as de la semana (hora de Lima). Se pueden pausar. Si hay varias vigentes, gana el precio mÃ¡s bajo.
- El precio final lo calcula siempre la base de datos (POS y pedidos web). En el POS aparecen con etiqueta y filtros Â«CombosÂ» y Â«PromosÂ»; en la tienda, en las secciones Combos / Promociones / Ofertas.
- **Anuncios**: en el historial, Â«â†» ReenviarÂ» vuelve a enviar el anuncio tal cual y Â«EditarÂ» lo carga en el formulario.

## Costo e historial de movimientos (schema_v10)
Ejecuta `supabase/schema_v10.sql` (despuÃ©s de v9). Agrega `products.cost` y guarda en cada movimiento de stock cÃ³mo quedÃ³ tienda/almacÃ©n (antes â†’ despuÃ©s; los movimientos anteriores se muestran sin esa columna).
- **Productos**: campo Â«Costo unitarioÂ», tarjeta Â«Valor del inventario (costo)Â» junto a la de venta, y botÃ³n **Historial de movimientos** (filtros por fechas, producto y tipo; Excel y PDF).
- **AlmacÃ©n**: botÃ³n **Historial de traslados** (AlmacÃ©n â†’ Tienda, Tienda â†’ AlmacÃ©n, Entre sedes; por dÃ­a o rango, bÃºsqueda por nombre; Excel y PDF).
- Los productos existentes quedan con costo 0: edÃ­talos para cargar el costo.

## Egresos con comprobante, compras, cajas y asistente (schema_v11)
Ejecuta `supabase/schema_v11.sql` (despuÃ©s de v10; si te saliÃ³ Â«invalid configuration parameter nameÂ» ejecuta antes `supabase/fix_v10.sql` o vuelve a correr el v10 corregido).
- **Egresos**: formulario con categorÃ­a, comprobante (tipo/serie/nÃºmero/fecha), proveedor, importe, descripciÃ³n, foto y Â«Descontar de mi caja abiertaÂ». PestaÃ±a **Compras de insumos**: registra compras con precios; al recibirlas entra stock al almacÃ©n y se actualiza el costo.
- **Cajas del dÃ­a**: tarjetas con **Ver detalle**, **Ticket** (con logo, 58/80 mm) y **Descargar** (PDF A4 con detalle de ventas).
- **Productos**: columnas Precio de compra / Precio de venta / Ganancia (S/ y margen) y ganancia potencial.
- **Asistente KOVA**: guÃ­a por temas y preguntas con pasos del sistema, buscador de dudas y datos del negocio.

## Lector de cÃ³digo de barras (Ventas)
En Ventas, el lector agrega productos al carrito sin hacer clic en nada: el cÃ³digo del producto es su **SKU/cÃ³digo** (campo Â«CÃ³digoÂ» en Productos). Pitido y aviso verde/rojo; escanear de nuevo suma 1 unidad. No actÃºa mientras hay una ventana abierta o escribes en otro campo.

## Limpiar la base de datos conservando usuarios, productos y sedes
`supabase/limpiar_bd_conservar_usuarios_productos_sedes.sql` (pégalo completo en Supabase › SQL Editor). Borra ventas, pedidos web, cajas, egresos, compras, movimientos y stock, clientes, promociones, anuncios/suscriptores push, auditoría, configuración y correlativos; conserva usuarios, productos (con combos y fotos) y sedes. **Por defecto es MODO PRUEBA**: no borra nada y muestra cuántos registros borraría; para ejecutar de verdad cambia `v_confirmar` a `'BORRAR'`. Opciones para conservar stock, configuración o suscriptores push. Irreversible: descarga antes un respaldo (Admin › Backup). El antiguo `limpiar_bd.sql` borra también productos y sedes.

## Caja obligatoria para pedidos web (schema_v16_caja_pedidos_web)
Ejecuta `supabase/schema_v16_caja_pedidos_web.sql` (seguro repetirlo) y redespliega. Para **aceptar** un pedido web y para **marcarlo como cobrado** hay que tener tu caja abierta en la sede del pedido (igual que el POS); así ningún cobro queda fuera del cuadre. Rechazar, «En camino» y «Entregado» no piden caja. Si no hay caja, el panel avisa y ofrece «Abrir mi caja».

## Estado de pedido en la tienda (schema_v15_estado_pedido)
Ejecuta `supabase/schema_v15_estado_pedido.sql` en el SQL Editor de Supabase (seguro repetirlo) y redespliega. En el navbar de la tienda aparece **ESTADO DE PEDIDO** (y en el menú del celular): el cliente escribe su número (`PW001-123`, sin necesidad de los ceros) y ve: Pedido recibido → Pedido aceptado → En camino → Entregado (o «no pudo ser atendido» con el motivo). Se actualiza solo cada 30 s y recuerda el último pedido del cliente.
En **Pedidos web** hay un botón nuevo **🛵 En camino** (en pedidos confirmados); luego **Entregado**. La consulta pública solo devuelve estado y fechas; nunca nombre, celular, dirección ni productos.

## Notificaciones en Samsung / Android (compatibilidad)
Cambios: icono `badge` monocromo (`public/badge-96.png`), plan B en el service worker si el dispositivo rechaza alguna opciÃ³n, renovaciÃ³n automÃ¡tica de suscripciones hechas con otra clave VAPID, reintento al suscribir y mensaje visible al cliente si no se pudo activar (antes fallaba en silencio). Tras redesplegar, los clientes ya suscritos se actualizan solos al abrir la tienda; a quien no le llegaba debe abrir la tienda y tocar **Activar** si el aviso reaparece.
Si en un Samsung aÃºn no llega: (1) Ajustes â€º Aplicaciones â€º Chrome (o Samsung Internet) â€º Notificaciones: activadas; (2) Ajustes â€º BaterÃ­a â€º LÃ­mites de uso en segundo plano: quitar Chrome/Samsung Internet de Â«Apps en suspensiÃ³nÂ» y Â«Apps en suspensiÃ³n profundaÂ» y poner la baterÃ­a en Â«Sin restriccionesÂ»; (3) ahorro de datos y VPN desactivados; (4) probar con Chrome si usa Samsung Internet. El anuncio muestra cuÃ¡ntos se enviaron y los motivos de fallo (`motivos`).

## CorrecciÃ³n de fotos de Marketing (schema_v14_fix_fotos)
Si Marketing veÃ­a Â«invalid regular expression: invalid repetition count(s)Â» al subir/cambiar una foto, ejecuta `supabase/schema_v14_fix_fotos.sql` en el SQL Editor de Supabase (no requiere redespliegue). PostgreSQL no admite cuantificadores mayores a 255 en un regex.

## Rol Marketing y fotos en el POS (schema_v12)
Ejecuta `supabase/schema_v12.sql` (despuÃ©s de v11) y redespliega. En Usuarios elige el rol **Marketing** (no necesita sedes): al entrar solo ve la pantalla **Fotos** y puede cambiar la foto de productos y combos; no ve ventas, stock, clientes ni configuraciÃ³n. El SQL ademÃ¡s cierra un hueco: antes cualquier sesiÃ³n podÃ­a escribir en `products` desde la API; ahora solo el personal (no marketing).

## Dashboard y Reportes rediseÃ±ados
- GrÃ¡ficos propios en `lib/charts.js` (lÃ­neas suaves, barras, dona), sin librerÃ­as nuevas ni SQL nuevo.
- Dashboard: accesos rÃ¡pidos, 4 KPI con "vs. ayer", ventas de la semana, ventas por categorÃ­a, evoluciÃ³n mensual (6 meses), ventas recientes y alertas de stock.
- Reportes: filtros (tipo, fechas, sede, comprobante, origen, restablecer), 6 KPI, resumen del periodo vs. periodo anterior, utilidad estimada (usa el costo del producto), mÃ©todos de pago, top productos y top categorÃ­as. Imprimir y Exportar CSV (ventas o egresos).



## Pago en línea con Culqi (Tarjeta · Yape · PagoEfectivo)

1. Supabase > SQL Editor: ejecuta `supabase/schema_v18_culqi.sql`.
2. Variables de entorno (Vercel > Settings > Environment Variables y tu `.env.local`): `NEXT_PUBLIC_CULQI_PUBLIC_KEY`, `CULQI_SECRET_KEY`, `CULQI_WEBHOOK_SECRET` (ver `.env.example`). Vuelve a desplegar.
3. CulqiPanel > Eventos > Webhooks: registra `https://TU-DOMINIO/api/culqi/webhook?k=TU_CULQI_WEBHOOK_SECRET` con los eventos de órdenes (`order.status.changed`) y, opcional, de cargos (`charge.creation.succeeded`).
4. Flujo: el cliente elige «Pagar en línea» en el carrito → `/api/culqi/checkout` registra el pedido y crea la orden en Culqi → formulario de Culqi incrustado → `/api/culqi/pay` cobra (tarjeta con 3D Secure / Yape) o guarda el CIP (PagoEfectivo) → el webhook confirma PagoEfectivo.
5. En «Pedidos web» el personal solo puede aceptar un pedido de Culqi cuando el pago está acreditado. Los pendientes de pago están en la pestaña «Esperando pago en línea».
6. Rechazar un pedido ya pagado exige devolver el dinero desde CulqiPanel (Cargos > Devolver).

## Anuncio emergente al entrar a la web + rol Marketing en «Anuncios»

1. Supabase > SQL Editor: ejecuta `supabase/schema_v19_anuncio_popup_marketing.sql`.
2. Admin > Anuncios > «Anuncio al entrar a la web»: sube la imagen, elige la frecuencia, marca «Mostrar» y guarda. Al tocar la imagen, el cliente va a la sección Promociones.
3. El rol Marketing ahora entra a «Fotos» y «Anuncios» (anuncio emergente, franja de texto y notificaciones push). No ve ventas, pedidos, clientes ni caja.
