# Sistema de Gestión Comercial

Sistema web full-stack para administración de ventas, compras, inventario, garantías/postventa y finanzas de un comercio de dispositivos electrónicos.

## Stack Tecnológico

### Frontend

| Tecnología | Propósito |
|---|---|
| **React 19** | Framework de UI |
| **Vite 7** | Bundler y dev server |
| **Tailwind CSS 4 + shadcn/ui** | Sistema de diseño basado en componentes atómicos (Radix primitives), modo oscuro |
| **react-router-dom** | Ruteo SPA |
| **Zustand** | Estado global liviano |
| **react-hook-form + zod** | Formularios con validación declarativa |
| **@tanstack/react-table** | Tablas dinámicas con ordenamiento, filtrado y paginación |
| **Recharts** | Gráficos interactivos (dashboard, ventas por canal, top productos) |
| **dnd-kit** | Drag & drop |
| **jsPDF + jspdf-autotable** | Generación de PDF (facturas, reportes) |
| **date-fns** | Manipulación de fechas |
| **sonner / sweetalert2** | Notificaciones y diálogos |

### Backend (BaaS)

| Tecnología | Propósito |
|---|---|
| **Supabase** | Backend-as-a-Service: autenticación, base de datos PostgreSQL, storage |
| **Supabase Auth** | Login con email/contraseña y Google OAuth; sesiones persistentes con auto-refresh |
| **Supabase Storage** | Almacenamiento de imágenes de productos (bucket `products`) |
| **PostgreSQL + PL/pgSQL** | Funciones, triggers y vistas para lógica de negocio en base de datos |

## Arquitectura

```
┌─────────────────────────────────────────────────┐
│              React SPA (Vite)                    │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────┐  │
│  │ Zustand  │ │ react-   │ │ shadcn/ui (Radix)│  │
│  │ (stores) │ │ hook-form│ │ + Tailwind      │  │
│  └──────────┘ └──────────┘ └─────────────────┘  │
│         │            │                │          │
│         └────────────┴────────────────┘          │
│                      │                           │
│           @supabase/supabase-js                   │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│               Supabase (BaaS)                    │
│  ┌──────────┐ ┌────────────┐ ┌───────────────┐  │
│  │  Auth    │ │ PostgreSQL │ │   Storage     │  │
│  │(email +  │ │ Functions  │ │(product       │  │
│  │ Google)  │ │ Triggers   │ │  images)      │  │
│  │          │ │ Views      │ │               │  │
│  └──────────┘ └────────────┘ └───────────────┘  │
└──────────────────────────────────────────────────┘
```

El frontend consume Supabase directamente sin backend intermedio. La lógica de negocio crítica (ventas, compras, garantías, movimientos contables) se ejecuta como funciones PL/pgSQL con `SECURITY DEFINER` para control de acceso.

## Base de Datos

### Tablas principales

- `users` — Usuarios del sistema con roles (`superadmin`, `owner`, `seller`) y estado activo/inactivo
- `customers` — Clientes
- `providers` — Proveedores
- `products` / `product_variants` — Catálogo con variantes (color, almacenamiento, RAM) y seguimiento de inventario por cantidad o serial
- `sales` / `sale_items` / `sale_item_imeis` — Ventas, ítems e IMEIs serializados
- `purchases` / `purchase_items` — Compras a proveedores
- `inventory_units` — Unidades de inventario con trazabilidad por serial
- `payment_methods` / `sale_payments` / `purchase_payments` — Medios de pago y pagos
- `accounts` / `account_movements` — Cuentas contables y movimientos
- `warranty_exchanges` — Cambios por garantía
- `aftersales_devices` — Dispositivos en postventa (reparación, reemplazo)
- `expenses` — Gastos
- `fx_rates` — Cotizaciones de moneda
- `sales_channels` — Canales de venta

### Automatización en BD

- **Triggers** que sincronizan movimientos contables automáticamente al crear/actualizar/eliminar pagos de ventas, gastos y pagos a proveedores
- **Funciones** PL/pgSQL para operaciones complejas: crear ventas con IMEIs, procesar cambios por garantía, registrar dispositivos postventa, anular compras, actualizar costos, etc.
- **Vista** `admin_sales_view` que agrega datos de ventas con información de cliente, vendedor, items y pagos

## Autenticación y Permisos

- Login mediante email/contraseña o Google OAuth
- Roles: `superadmin`, `owner`, `seller`
- Control de activación de cuentas por administrador (flag `is_active` en `users`)
- Redirección según rol (`/dashboard` para superadmin/owner, `/seller/products` para vendedores)
- Autorización en BD mediante función `is_owner_or_superadmin()` que consulta `auth.uid()` contra la tabla `users`

## Funcionalidades

- **Dashboard** con métricas de ventas, gráficos por canal y top vendedores
- **Catálogo** de productos con variantes, imágenes y gestión de stock
- **Ventas** con selección de productos, cálculo de totales, pagos múltiples y emisión de factura PDF
- **Compras** a proveedores con control de inventario
- **Clientes y proveedores** con historial
- **Garantías y postventa** con trazabilidad de dispositivos
- **Finanzas** con cuentas, movimientos y cotizaciones
- **Configuración** de métodos de pago, canales de venta, usuarios y parámetros del sistema

## Scripts disponibles

```bash
npm run dev      # Iniciar servidor de desarrollo
npm run build    # Compilar para producción
npm run preview  # Previsualizar build de producción
npm run lint     # Ejecutar ESLint
```
