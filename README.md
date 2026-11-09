# LocalGhost

## Descargas y Obsidian

Desde una reunión guardada puedes descargar el audio WAV, la transcripción `.txt` y la nota `.md`. También puedes exportar la nota al vault configurado y usar **Abrir en Obsidian**.

## Instalador de Windows

El repositorio actual es una beta de código fuente. El instalador de doble clic todavía requiere empaquetar Tauri, Next local, el runtime de Whisper y la descarga guiada de modelos. Ollama se instala por separado porque cada usuario puede elegir modelos distintos.

El instalador final comprobará WebView2, Whisper y Ollama, descargará solo los modelos elegidos, iniciará los servicios en `127.0.0.1` y creará accesos directos. Mientras tanto, `pnpm tauri` inicia Next y levanta Whisper automáticamente si el puerto `8000` está libre.

Herramienta local-first para notas de reuniones. **ZERO FOOTPRINT · ZERO BOTS**.

> **Estado: beta de código fuente para Windows.** Puedes compartir el repositorio para que otras personas lo ejecuten siguiendo estos pasos. Todavía no publiques un instalador como versión de producción: la app de escritorio depende de Next local y requiere Node.js, Python/Whisper y Ollama configurados en el PC. Consulta [Privacidad](PRIVACY.md), [Seguridad](SECURITY.md) y la [licencia MIT](LICENSE).

## Requisitos

- Windows 10/11, Node.js 20 o superior y pnpm.
- Python 3.10 o superior para Whisper CPU.
- Navegador actual con permiso de micrófono.
- Ollama para los resúmenes locales.
- Para la ventana de escritorio de Windows: Rust (MSVC) y Microsoft C++ Build Tools.

## Primera prueba: perfil Ligero (solo CPU)

### 1. Instalar y preparar Ollama

Instala Ollama desde [ollama.com/download](https://ollama.com/download). En PowerShell:

```powershell
ollama pull qwen3:1.7b
ollama run qwen3:1.7b "Resume en una frase: acordamos revisar el diseño el viernes"
```

La interfaz comprobará Ollama en `http://127.0.0.1:11434`.

Las direcciones locales predeterminadas están en [`.env.example`](.env.example). Si creas un `.env` para personalizar tu instalación, no lo compartas: los archivos `.env` están excluidos de Git.

### 2. Iniciar Whisper local en CPU

En otra ventana de PowerShell, desde la carpeta de LocalGhost:

```powershell
python services/whisper_cpu/server.py
```

El servicio queda limitado a `127.0.0.1:8000` y usa faster-whisper en CPU con cuantización INT8. En un PC nuevo, instala primero los paquetes mediante `python -m pip install -r services/whisper_cpu/requirements.txt`; la primera ejecución descarga los pesos del modelo. En este PC ya está instalado faster-whisper y está en caché el modelo small.

### 3. Ejecutar LocalGhost

En otra ventana de PowerShell, desde la carpeta de LocalGhost:

```powershell
pnpm install
pnpm dev
```

Abre `http://localhost:3000`, entra a **Ajustes locales** y confirma el perfil **Ligero · solo CPU**. Crea una sesión, graba unos segundos, detén y pulsa **Guardar y transcribir**. Luego genera el resumen y recarga la página para comprobar la persistencia.

Al crear una sesión puedes escoger **En vivo** o **Al terminar**. En vivo manda ventanas cortas al Whisper de este PC y añade el texto a la transcripción mientras grabas; suele llevar varios segundos de retraso y usa más CPU. Si un fragmento falla, al detenerse LocalGhost vuelve a intentar transcribir la grabación completa. Al terminar conserva el flujo anterior y usa menos recursos durante la reunión.

Para detener Whisper o LocalGhost, usa `Ctrl+C` en la ventana de cada proceso.

En Windows, después de reiniciar el PC, puedes iniciar los tres servicios y abrir la app con un solo comando:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-localghost-lite.ps1
```

### Captura dual en la app de escritorio (Windows)

La app de navegador solo puede grabar el micrófono. La app de escritorio usa WASAPI: canal 1 micrófono y canal 2 salida predeterminada de Windows (Meet, Teams u otro audio que se reproduzca por esa salida). Los dos canales se guardan en un WAV local y se transcriben por separado con Whisper local.

Instala [los requisitos de Tauri para Windows](https://v2.tauri.app/start/prerequisites/) (Rust con host MSVC, Microsoft C++ Build Tools y WebView2), luego ejecuta `pnpm install`. Inicia Ollama y Whisper como arriba y abre la app nativa con:

```powershell
pnpm tauri
```

El comando inicia Next local y la ventana Tauri. La grabación es local; Whisper y Ollama siguen atendiendo solo en `127.0.0.1`. Esto es un modo de desarrollo para probar la captura desde el código fuente. El instalador de producción está pendiente: las rutas API de Next necesitan un servidor Node local empaquetado y gestionado por la app.

En la app de escritorio, cerrar la ventana con **X** la oculta en el área de notificación de Windows y LocalGhost sigue ejecutándose. Haz clic en el icono de LocalGhost para volver a abrirla; con clic derecho puedes elegir **Abrir LocalGhost** o **Salir de LocalGhost**. Para evitar perder una captura, la opción **Salir** queda bloqueada mientras se está grabando. Al salir, detén también el comando `pnpm tauri` con `Ctrl+C` en la terminal para cerrar los servicios de desarrollo.

## Perfiles de rendimiento

- **Ligero:** faster-whisper small + Qwen3 1.7B.
- **Equilibrado:** faster-whisper medium + Qwen3 4B.
- **Alta calidad:** faster-whisper large-v3 + Llama 3.1 8B.

Se pueden cambiar en Ajustes. El equipo local no necesita GPU para el perfil Ligero; en CPU la transcripción puede tardar más que la duración del audio.

## Datos y límites

- Las sesiones, preferencias, transcripciones y audios se guardan en IndexedDB del perfil local de LocalGhost, en el disco de este PC (no solo en memoria RAM). En Ajustes puedes conservarlas hasta borrarlas manualmente o eliminarlas automáticamente después de 1, 7, 30 o 90 días. También puedes borrar una sesión con su audio o todas las sesiones desde Ajustes.
- Ollama y Whisper solo se consultan en `localhost`; el audio y el texto no se envían a servicios de IA en la nube.
- La primera descarga de Ollama y los modelos de IA requiere Internet. La función opcional de Google Calendar contacta a Google para autorización y lectura de eventos; no comparte audio, transcripciones ni resúmenes.
- Los modelos se descargan la primera vez. Tras la descarga, la inferencia es local.
- En navegador se captura solo el micrófono; la app de escritorio Tauri captura el micrófono y el audio reproducido por la salida predeterminada de Windows (Meet, YouTube y otras aplicaciones).
- SQLite no está integrado todavía.
- La exportación a Obsidian escribe en una ruta absoluta cuando LocalGhost se abre desde localhost.

## Recordatorios de Google Calendar (opcional)

La integración solicita permiso OAuth de solo lectura para eventos del calendario principal. No envía grabaciones, transcripciones ni resúmenes. Para habilitarla:

1. En Google Cloud Console, crea un proyecto y habilita **Google Calendar API**.
2. Configura la pantalla de consentimiento OAuth como externa, añade tu correo como usuario de prueba y completa los datos requeridos.
3. Crea un ID de cliente OAuth de tipo **Aplicación de escritorio**.
4. Copia también el `client_secret` del mismo cliente OAuth. Pega ambos valores en **Ajustes locales → Recordatorios de Google Calendar** y conecta. El client secret se cifra con Windows y no se guarda en el código ni en la base de reuniones. LocalGhost abrirá tu navegador predeterminado para pedir permiso.

Los avisos aparecen 10 minutos antes mientras LocalGhost está abierto. Si dejas el consentimiento OAuth de Google en modo **Prueba**, Google invalida estos permisos después de 7 días; al publicar la app, Google puede exigir verificación del permiso de calendario.

La conexión de Google usada en este chat no se puede reutilizar dentro de LocalGhost. Google requiere que cada aplicación tenga su propio cliente OAuth, que debe crearse manualmente en la cuenta del desarrollador. La app Tauri usa el navegador del sistema y una redirección local de un solo uso para completar OAuth con PKCE.
