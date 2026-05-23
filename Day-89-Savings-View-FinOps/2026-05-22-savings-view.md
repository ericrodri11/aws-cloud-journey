# Cambios del 22 de mayo de 2026: Vista de Ahorro

## Objetivo

Separar el seguimiento de ahorro del dashboard principal y darle una vista propia sin aumentar el coste de IA.

## Cambios de frontend

- Se reemplazo el boton de navegacion `Transactions` por `Ahorro`/`Savings`.
- Se creo una vista de ahorro dentro de `components/Dashboard.tsx`.
- Se movieron a la vista de ahorro:
  - `Savings Streak`
  - `Velocity Analysis`
  - `Recommendations`
- Se creo el widget `Savings Analysis`, que aparece primero en la vista de ahorro.
- Se creo la grafica `Daily Savings` con Recharts:
  - Eje X: dias medidos del mes seleccionado.
  - Linea de ahorro diario estimado.
  - Linea del objetivo diario configurado.
  - Puntos verdes o rojos segun si el dia cumple el objetivo.

## Criterio del analisis de ahorro

El nuevo analisis no usa IA. Calcula el resultado con datos que el dashboard ya tiene:

1. Divide el ingreso mensual efectivo entre los dias del mes.
2. Suma los gastos reales por dia, excluyendo ingresos, creditos y transferencias internas.
3. Estima el ahorro del dia como `ingreso diario - gasto diario`.
4. Compara el ahorro estimado con `daily_savings_goal`.
5. Resume dias cumplidos, ahorro medio y diferencia frente al objetivo.

Si no hay suficiente senal de ingresos o gastos, el widget lo indica en vez de inventar un diagnostico.

## Reutilizacion del advice diario

El reporte diario ya pide a Amazon Nova un bloque `Advice` para el correo. Para evitar coste extra:

- La Lambda extrae ese consejo del HTML ya generado para el email.
- Lo guarda en el perfil como `latest_daily_savings_advice`.
- La lectura de preferencias lo expone al frontend.
- El widget de analisis lo usa cuando existe; si no existe, muestra un consejo determinista basado en el faltante o en el ritmo actual.

No se agrego ninguna invocacion nueva a IA para esta vista.

## Archivos tocados

- `components/Dashboard.tsx`
- `components/Charts.tsx`
- `components/Widgets.tsx`
- `i18n.ts`
- `types.ts`
- `backend/lambda_function.py`
- `docs/2026-05-22-savings-view.md`

