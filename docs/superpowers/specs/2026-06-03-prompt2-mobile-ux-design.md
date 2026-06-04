# Prompt 2 — Mobile UX fixes + edición (diseño aprobado)

Fecha: 2026-06-03 · Estado: aprobado por Samuel

## Decisiones de diseño (Fase 0, companion visual)

| Decisión | Elección |
|---|---|
| Patrón de edición (F3/F4) | **Sheet unificado**: tap en fila → bottom sheet de edición para tareas, ideas y proyectos. Extiende `ui/sheet.tsx`. |
| UI de hora (F9) | **`<input type="time">` nativo** detrás de un chip "🕐 Hora". Sin picker custom, sin deps. |
| Feedback al crear (F10) | **Micro-animación de inserción**: slide-in + pulso de fondo mint (~1.2s), CSS puro, respeta `prefers-reduced-motion`. |
| Nav desktop (F2) | **Rail lateral izquierdo en ≥768px**; bottom-nav intacta en mobile. |
| Migración F9 | `time?: string \| null` ("HH:mm" 24h) en `Task` (`lib/types.ts`). **Sin índice → sin version bump de Dexie**; `lib/db/schema.ts` no se toca. |
| Orden del día (F9) | Tareas con hora primero (asc por hora), sin hora después (orden manual). El drag solo reordena las sin hora. |

## Plan por fix

- **F1 Overflow/zoom:** reproducir con Playwright 375×812, diagnosticar `scrollWidth` vs `innerWidth`; corregir inputs <16px (auto-zoom iOS), `overflow-x` del shell, `dvh`, safe-areas. Solo lo que el diagnóstico confirme.
- **F2 Responsive:** contenedor `max-w-md → md:max-w-2xl → xl:max-w-5xl`; grid de proyectos 1→2→3 col; rail lateral ≥768px.
- **F3 Editar proyectos:** lápiz en header de `project-detail` → sheet (nombre, swatches `PROJECT_COLORS`, kind). Query `updateProject`.
- **F4 Editar tareas/ideas:** task sheet gana guardado explícito + hora + selector proyecto; `idea-row` gana sheet equivalente. Query `updateIdeaText`.
- **F5 Sheet vs teclado:** `interactive-widget=resizes-content` en viewport meta + listener `visualViewport` en `ui/sheet.tsx`.
- **F6 Botón atrás:** `history.pushState`/`popstate` para project-detail y sheets abiertos.
- **F7 Scroll contenido:** header fijo + lista `flex-1 overflow-y-auto` dentro de `min-h-dvh`; padding que despeja FAB + nav + safe-area.
- **F8 Reordenar ideas:** extraer hook `useDragReorder` de `task-list.tsx`; query `reorderIdeas`. Cero deps.
- **F9 Hora:** campo `time` (ver migración arriba); chip 🕐 en quick-add y sheet; hora visible en `task-row`; orden timed-first.
- **F10 Feedback:** keyframe slide-in + pulso mint en filas con `createdAt` < 1.5s al montar.

## Validación final

`pnpm build` (webpack, nunca Turbopack) → Playwright a 375×812 / 768×1024 / 1440×900: sin scroll horizontal, sheet visible con teclado, back funcionando, reorder de ideas, hora visible. Screenshots por fix. Review del diff con karpathy-guidelines.

## Restricciones

Solo `app/`, `components/`, `lib/`. No tocar `scripts/`, `public/icons/`, `next.config.ts`, `app/sw.ts`, `vercel.json`. pnpm siempre; sin dependencias nuevas; local-first (IndexedDB).
