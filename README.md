# Sistema POS + Tienda web (multisede)

Next.js 14 + Supabase. Tienda pública en `/`, sistema interno en `/admin`.

## Instalación
1. `npm install`
2. Copia `.env.example` a `.env.local` y completa las claves de Supabase.
3. En Supabase > SQL Editor ejecuta **en orden**: `schema.sql`, `schema_v2.sql`, `schema_v3.sql`, `schema_v4.sql` `schema_v5.sql` y **`schema_v6.sql`** (si ya tenías los 4 primeros, corre solo v5 y v6; son seguros de repetir).
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
