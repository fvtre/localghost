# Privacidad de LocalGhost

LocalGhost procesa audio y notas en el equipo. No incluye inicio de sesión de LocalGhost, sincronización propia ni telemetría de uso.

## Datos locales

- Reuniones, audio, transcripciones, resúmenes, etiquetas y preferencias se guardan en IndexedDB del perfil local del navegador o WebView.
- Los archivos de audio temporales de Whisper se eliminan al terminar la transcripción.
- La retención configurable borra reuniones guardadas al iniciar la app y durante su uso. También puedes borrar una reunión o todas desde Ajustes.
- La ruta de exportación escribe el Markdown en la ubicación que el usuario configuró.
- El token de actualización y el secreto OAuth de Google se guardan cifrados con DPAPI de Windows en el perfil del usuario.

## Conexiones de red

- Whisper y Ollama se consultan en `127.0.0.1`; el audio y las transcripciones no se envían a servicios de IA en la nube.
- La descarga inicial de Ollama y de los modelos de Whisper requiere conexión a sus proveedores. Después, la inferencia ocurre localmente.
- Si el usuario conecta Google Calendar, LocalGhost solicita permiso de solo lectura para eventos y consulta la API de Google para mostrar reuniones próximas y avisos. Google recibe las solicitudes OAuth y de calendario necesarias para esa función. La app no envía a Google grabaciones, transcripciones ni resúmenes.
- No hay servicio de nube de LocalGhost ni envío automático de datos a sus mantenedores.

## Grabación

La persona que inicia una captura es responsable de informar a los participantes y cumplir las reglas y leyes aplicables. LocalGhost muestra el estado de grabación en la interfaz.

## Estado y contacto

Este documento describe el comportamiento de la beta actual, no constituye asesoría legal ni una garantía de seguridad. Para reportar problemas, consulta [SECURITY.md](SECURITY.md).
