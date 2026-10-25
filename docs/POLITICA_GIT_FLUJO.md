# Política Oficial de Flujo Git y Gestión de Repositorio (Backend)

Este documento define la política obligatoria de control de versiones y trabajo en equipo para el repositorio **LadyBarberAppBackend**, siguiendo el modelo híbrido (Scrum + XP) y el flujo normativo del profesor:

$$\text{feature/*} \xrightarrow{\text{PR + CI + Aprobación}} \text{develop} \xrightarrow{\text{creación}} \text{release} \xrightarrow{\text{PR + CI + Aprobación}} \text{main} \xrightarrow{\text{Tag}} \text{vX.Y.Z}$$

---

## 1. Convención Obligatoria de Ramas

1. **`main`**:
   - Es una rama permanente.
   - Contiene únicamente versiones oficiales, estables y desplegables.
   - Pushes directos están **estrictamente prohibidos** para todos los integrantes (incluido el administrador/propietario Ismael).
   - Solo recibe cambios mediante Pull Requests aprobados que provengan de la rama oficial **`release`**.
   - Cada fusión hacia `main` se asocia inmediatamente a un tag anotado SemVer (`vX.Y.Z`).
2. **`develop`**:
   - Es una rama permanente.
   - Rama principal de integración continua.
   - Recibe cambios únicamente a través de Pull Requests desde ramas `feature/*` o PRs de corrección desde `release`.
   - Pushes directos de código de desarrollo están prohibidos.
3. **`feature/*`**:
   - Son ramas temporales y se eliminan cuando su trabajo queda integrado y verificado en una rama permanente.
   - Ramas de funcionalidades asignadas a los integrantes (ej. Ismael, Diana).
   - Nomenclatura: `feature/nombre-funcionalidad`.
   - Cada integrante realiza commits y pushes en su propia rama feature con su identidad Git personal.
4. **`release`**:
   - Es una rama temporal de estabilización; no permanece entre versiones.
   - Creada exclusivamente a partir de `develop` cuando las funcionalidades están listas para estabilización.
   - Es la **única** rama autorizada para abrir Pull Requests hacia `main`.
   - La versión semántica se gestiona en los archivos de configuración (`package.json`) y se formaliza mediante tags (`vX.Y.Z`) en `main`.

---

## 2. Restricciones Técnicas Reales de GitHub y Procedimiento del Equipo

### Restricción Técnica
- El repositorio **LadyBarberAppBackend** es de visibilidad **Privada** bajo el plan gratuito de GitHub (*GitHub Free*).
- Las cuentas personales gratuitas de GitHub no permiten activar técnicamente reglas de protección de ramas (*Branch Protection Rules / Rulesets*) en repositorios privados (requiere plan de pago GitHub Team o Pro).

### Procedimiento Colaborativo y Verificable
Para suplir esta limitación técnica sin cambiar la visibilidad ni contratar planes de pago, el equipo establece un protocolo disciplinado y auditable:

1. **Prohibición de Push Directo**: Ningún miembro del equipo realizará `git push origin develop` ni `git push origin main` de forma directa.
2. **Uso Obligatorio de Pull Requests con Revisión Humana**: Todas las integraciones se gestionan exclusivamente mediante Pull Requests con asignación de revisor:
   - `feature/*` → `develop` (Revisión recíproca obligatoria entre Ismael y Diana).
   - `release` → `main` (Revisión y aprobación obligatoria).
   - `release` → `develop` (para sincronizar correcciones de release).
3. **Comprobación Automática vía GitHub Actions**:
   - El workflow `.github/workflows/ci.yml` se ejecuta automáticamente en cada Pull Request.
   - Solo se autoriza el merge del PR si la ejecución de Actions culmina en **verde (Success)** con todas las pruebas aprobadas.
4. **Registro de Auditoría**: Cada Pull Request, revisión independiente con estado **Approved**, ejecución de Actions y merge queda registrado en GitHub como evidencia verificable del flujo para el profesor.

---

## 3. Pruebas Automatizadas y Calidad en Release

1. **Pruebas de CI (GitHub Actions)**:
   - Se ejecutan en cada PR con `node:test` y `supertest`.
   - Validan endpoints HTTP, seguridad de contraseñas (hashing bcrypt), manejo de errores y middlewares de autenticación/roles.
2. **Pruebas de Integración y Calidad (QA) en Release**:
   - **Nota importante**: Las pruebas automáticas de CI son una comprobación indispensable de no-regresión, pero **no sustituyen las pruebas integrales de sistema, consistencia de base de datos MySQL y validaciones manuales de QA**.
   - Durante la vigencia de la rama `release`, el equipo realiza pruebas de integración completas entre backend y app móvil.
   - Si aparecen errores en release:
     - Se corrigen de manera controlada mediante ramas de corrección integradas a `release` vía PR.
     - Se crea un Pull Request de retorno `release` → `develop` para evitar divergencias en el historial.

---

## 4. Ciclo de Vida de la Rama Temporal `release`

La rama `release` se utiliza únicamente durante la estabilización de una versión y sigue este procedimiento obligatorio:

1. **Creación desde una base estable**:
   - Se completan primero las funcionalidades mediante Pull Requests `feature/*` → `develop`, con CI aprobado y revisión humana independiente.
   - Se actualiza y valida `develop` y, solo cuando está estable, se crea `release` directamente desde su commit definitivo.
   - Para cada versión futura se crea nuevamente `release` desde el `develop` actualizado; no se reutiliza una rama de una versión anterior.
2. **Estabilización, QA y regresión**:
   - En `release` se ejecutan las pruebas unitarias, de integración y de regresión, además de las verificaciones manuales de QA definidas para la versión.
   - No se incorporan funcionalidades nuevas durante esta etapa.
   - Cada defecto se corrige en una rama temporal de corrección creada desde `release` y se integra mediante Pull Request hacia `release`.
   - Todo Pull Request de corrección requiere CI aprobado y revisión humana independiente del autor.
3. **Promoción a producción**:
   - Cuando QA concluye satisfactoriamente, se abre el Pull Request `release` → `main`.
   - El merge solo se autoriza con todos los checks obligatorios aprobados y una aprobación humana independiente vigente.
   - Después del merge se crea un tag **anotado** con formato SemVer (`vX.Y.Z`) sobre el commit definitivo de `main` correspondiente a la versión liberada.
4. **Sincronización con `develop`**:
   - Si `release` recibió correcciones que no estaban en `develop`, estas se sincronizan mediante un Pull Request `release` → `develop`.
   - Dicho Pull Request también requiere CI aprobado y revisión humana independiente antes del merge.
5. **Verificación previa a la eliminación**:
   - Se comprueba que `main` conserva todos los commits relevantes de `release`.
   - Se comprueba que `develop` conserva todas las correcciones realizadas durante la estabilización.
   - Se verifica que el tag anotado `vX.Y.Z` existe, apunta al commit definitivo de `main` y corresponde a la versión liberada.
   - Se confirma que no quedan Pull Requests abiertos ni trabajos dependientes de `release`.
   - Las evidencias de CI, revisiones, QA, merges y tag se conservan antes de eliminar cualquier referencia.
6. **Eliminación segura y autorizada**:
   - La eliminación de la rama `release` remota requiere una autorización explícita y se realiza únicamente después de completar todas las verificaciones anteriores.
   - La eliminación de la rama `release` local constituye una operación separada y requiere su propia autorización explícita.
   - Ninguna de las dos eliminaciones se ejecuta automáticamente ni se deduce de la autorización concedida para la otra.

---

## 5. Guardián Automatizado para `main`

El workflow de GitHub Actions incluye el job **`Validación de Rama de Release hacia Main`**, el cual valida automáticamente que:
- El PR con destino a `main` provenga estrictamente de la rama oficial `release`.
- Proceda del repositorio oficial y no de un fork ajeno.
- Cualquier intento de integrar `develop` o `feature/*` directamente a `main` falle de forma inmediata con mensaje de error explícito.
