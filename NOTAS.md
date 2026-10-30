# NOTAS DE DECISIÓN Y SEGUIMIENTO - HOOP OS

## Fase 1: Cimientos, Design System CSS y Dominio de Básquet
- **Decisión de Tokens**: Implementación de tema Arena Dark por defecto con acentos FIBA (`#0B0F17`, `#161F30`, `#FF6B00`, `#10B981`, `#EF4444`, `#F59E0B`). Soporte de tema claro vía `[data-theme='light']`.
- **Reglas FIBA**:
  - PIR calculado según estándar oficial FIBA: `(PTS + REB + AST + STL + BLK) - (Missed FG + Missed FT + TOV + Total Fouls)`.
  - Exclusión a las 5 faltas acumuladas (Art. 40 FIBA).
  - Bonus al alcanzar 4 faltas de equipo en el cuarto (Art. 41 FIBA).
  - Plus/Minus computado analizando quinteto en cancha y cronología de sustituciones.
- **Tests**: 12/12 tests unitarios pasando en `src/core/domain/rules/basketball-rules.test.ts`.
