# Seguridad

## Versiones con soporte

Mientras LocalGhost esté en beta, solo la versión más reciente de la rama principal recibe correcciones.

## Reportar una vulnerabilidad

No publiques detalles de una vulnerabilidad sin corregir en un issue público. Envía un reporte privado a los mantenedores del repositorio. Si el repositorio no muestra un contacto de seguridad, abre un issue solicitando un canal privado sin incluir datos de explotación ni información personal.

Incluye la versión afectada, pasos mínimos para reproducir el problema y su impacto. No adjuntes grabaciones, transcripciones, tokens OAuth, secretos ni archivos `.env`.

## Límites de seguridad conocidos

- La app está en beta y aún no tiene instalador de producción firmado.
- La interfaz usa un servidor Next local para sus rutas de Whisper, Ollama, Calendar y exportación; esas rutas aceptan solo solicitudes del mismo origen local.
- Whisper y Ollama son procesos locales separados. Mantén sus puertos en loopback y no los expongas a la red.
- La base de reuniones del navegador no está cifrada por LocalGhost. Protege tu cuenta de Windows y borra los datos desde Ajustes si compartes el equipo.
