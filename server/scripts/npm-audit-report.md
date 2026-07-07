# CIEE — Reporte de auditoría de dependencias (TI-55 / TI-60)

Fecha: 2026-07-07

## Resumen

| Paquete | Severidad | Estado | Solución |
|---|---|---|---|
| vite (frontend) | HIGH | ✅ Resuelto | Actualizado a v8.1.3 |
| nodemailer (server) | HIGH | ✅ Resuelto | Actualizado a v9.0.3 |
| dompurify (frontend) | MODERATE | ✅ Resuelto | npm audit fix |
| xlsx (server) | HIGH | ⚠️ Pendiente migración | Sin fix en versión open-source |
| exceljs (frontend) | MODERATE | ✅ Resuelto | Actualizado a v3.4.0 |

## Vulnerabilidad pendiente: xlsx

**Paquete**: xlsx (SheetJS open source)
**Severidad**: HIGH
**CVE**: Prototype Pollution + ReDoS
**Fix disponible**: No — el mantenedor no publica fix en la versión gratuita

**Mitigación aplicada hasta la migración**:
- Todas las rutas que usan xlsx (`curricular.js`, `empleabilidad.js`, `import.js`) están protegidas con `requireAuth` — ningún usuario anónimo puede enviar archivos
- Los archivos Excel procesados provienen de usuarios autenticados internos del sistema
- Plan de migración: reemplazar `xlsx` por `exceljs` (ya instalado en el frontend) en las 3 rutas mencionadas

## Comando para re-ejecutar la auditoría

```bash
npm audit                          # desde /server
cd .. && npm audit                 # desde raíz (frontend)
```
