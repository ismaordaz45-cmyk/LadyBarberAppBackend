# Política Oficial de Flujo Git y Gestión de Repositorio (Backend)

Este documento define la política obligatoria de control de versiones y trabajo en equipo para el repositorio **LadyBarberAppBackend**, siguiendo el modelo híbrido (Scrum + XP) y el flujo exigido por el profesor:

$$\text{feature/*} \xrightarrow{\text{Pull Request}} \text{develop} \xrightarrow{\text{creación}} \text{release/vX.Y.Z} \xrightarrow{\text{Pull Request}} \text{main} \xrightarrow{\text{Tag}} \text{vX.Y.Z}$$

---

## 1. Convención Obligatoria de Ramas

1. **`main`**:
   - Contiene únicamente versiones oficiales, estables y desplegables.
   - Pushes directos están **estrictamente prohibidos** para todos los integrantes (incluido el administrador/propietario Ismael).
   - Solo recibe cambios mediante Pull Requests aprobados que provengan de ramas `release/vX.Y.Z`.
2. **`develop`**:
   - Rama principal de integración continua.
   - Recibe cambios únicamente a través de Pull Requests desde ramas `feature/*` o PRs de corrección desde `release/*`.
   - Pushes directos de código de desarrollo están prohibidos.
3. **`feature/*`**:
   - Ramas de funcionalidades asignadas a los integrantes (ej. Ismael, Diana).
   - Nomenclatura: `feature/nombre-funcionalidad`.
   - Cada integrante realiza commits y pushes en su propia rama feature con su identidad Git personal.
4. **`release/vX.Y.Z`**:
   - Creada exclusivamente a partir de `develop` cuando las funcionalidades están listas para estabilización.
   - Nomenclatura SemVer estricta: `release/v0.1.0`, `release/v1.0.0`, etc.
   - Es la **única** rama autorizada para abrir Pull Requests hacia `main`.

---

## 2. Restricciones Técnicas Reales de GitHub y Procedimiento del Equipo

### Restricción Técnica
- El repositorio **LadyBarberAppBackend** es de visibilidad **Privada** bajo el plan gratuito de GitHub (*GitHub Free*).
- Las cuentas personales gratuitas de GitHub no permiten activar técnicamente reglas de protección de ramas (*Branch Protection Rules / Rulesets*) en repositorios privados (requiere plan de pago GitHub Team o Pro).

### Procedimiento Colaborativo y Verificable
Para suplir esta limitación técnica sin cambiar la visibilidad ni contratar planes de pago, el equipo establece un protocolo disciplinado y auditable:

1. **Prohibición de Push Directo**: Ningún miembro del equipo realizará `git push origin develop` ni `git push origin main` de forma directa.
2. **Uso Obligatorio de Pull Requests**: Todas las integraciones se gestionan exclusivamente mediante Pull Requests:
   - `feature/*` → `develop`
   - `release/vX.Y.Z` → `main`
   - `release/vX.Y.Z` → `develop` (para sincronizar correcciones de release)
3. **Comprobación Automática vía GitHub Actions**:
   - El workflow `.github/workflows/ci.yml` se ejecuta automáticamente en cada Pull Request.
   - Solo se autoriza el merge del PR si la ejecución de Actions culmina en **verde (Success)** con todas las pruebas aprobadas.
4. **Registro de Auditoría**: Cada Pull Request, ejecución de Actions y merge queda registrado en GitHub como evidencia verificable del flujo para el profesor.

---

## 3. Pruebas Automatizadas y Calidad en Release

1. **Pruebas de CI (GitHub Actions)**:
   - Se ejecutan en cada PR con `node:test` y `supertest`.
   - Validan endpoints HTTP, seguridad de contraseñas (hashing bcrypt), manejo de errores y middlewares de autenticación/roles.
2. **Pruebas de Integración y Calidad (QA) en Release**:
   - **Nota importante**: Las pruebas automáticas de CI son una comprobación indispensable de no-regresión, pero **no sustituyen las pruebas integrales de sistema, consistencia de base de datos MySQL y validaciones manuales de QA**.
   - Durante la vigencia de la rama `release/vX.Y.Z`, el equipo realiza pruebas de integración completas entre backend y app móvil.
   - Si aparecen errores en release:
     - Se corrigen de manera controlada en la misma rama `release/vX.Y.Z`.
     - Se crea un Pull Request de retorno `release/vX.Y.Z` → `develop` para evitar divergencias en el historial.

---

## 4. Guardián Automatizado para `main`

El workflow de GitHub Actions incluye el job **`Validación de Rama de Release hacia Main`**, el cual valida automáticamente que:
- El PR con destino a `main` provenga estrictamente de una rama con patrón `release/vX.Y.Z`.
- Proceda del repositorio oficial y no de un fork ajeno.
- Cualquier intento de integrar `develop` o `feature/*` directamente a `main` falle de forma inmediata con mensaje de error explícito.
