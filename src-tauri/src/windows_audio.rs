use std::{collections::VecDeque, sync::{atomic::{AtomicBool, Ordering}, mpsc, Arc, Mutex}, thread::{self, JoinHandle}, time::Duration};
use wasapi::{initialize_mta, AudioCaptureClient, DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat};

pub struct CaptureSession {
    stop: Arc<AtomicBool>,
    buffers: Arc<Mutex<AudioBuffers>>,
    worker: JoinHandle<Result<(), String>>,
}

#[derive(Default)]
struct AudioBuffers {
    mic: Vec<f32>,
    system: Vec<f32>,
}

impl CaptureSession {
    pub fn finish(self) -> Result<Vec<u8>, String> {
        thread::sleep(Duration::from_millis(120));
        self.stop.store(true, Ordering::Relaxed);
        self.worker.join().map_err(|_| "La captura de audio se interrumpió inesperadamente.".to_string())??;
        let buffers = self.buffers.lock().map_err(|_| "No se pudo cerrar el almacenamiento temporal de audio.".to_string())?;
        if buffers.mic.is_empty() && buffers.system.is_empty() {
            return Err("WASAPI no entregó muestras de audio. Revisa el micrófono y la salida predeterminada de Windows.".to_string());
        }
        Ok(stereo_wav(&buffers.mic, &buffers.system))
    }

    pub fn snapshot(&self, seconds: usize) -> Result<(Vec<u8>, f64, f64), String> {
        let buffers = self.buffers.lock().map_err(|_| "No se pudo leer el audio de la captura.".to_string())?;
        let total_frames = buffers.mic.len().max(buffers.system.len());
        let frames = total_frames.min(seconds.saturating_mul(48_000));
        if frames == 0 {
            return Err("WASAPI todavía no ha recibido muestras de audio.".to_string());
        }
        let mic_start = buffers.mic.len().saturating_sub(frames);
        let system_start = buffers.system.len().saturating_sub(frames);
        let mic = &buffers.mic[mic_start..];
        let system = &buffers.system[system_start..];
        let start_seconds = total_frames.saturating_sub(frames) as f64 / 48_000.0;
        let duration_seconds = frames as f64 / 48_000.0;
        Ok((stereo_wav(mic, system), start_seconds, duration_seconds))
    }
}

pub fn start() -> Result<CaptureSession, String> {
    let stop = Arc::new(AtomicBool::new(false));
    let worker_stop = stop.clone();
    let buffers = Arc::new(Mutex::new(AudioBuffers::default()));
    let worker_buffers = buffers.clone();
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    let worker = thread::Builder::new().name("localghost-wasapi".into()).spawn(move || {
        let initialized = capture(worker_stop, worker_buffers, ready_tx.clone());
        initialized
    }).map_err(|error| format!("No se pudo iniciar WASAPI: {error}"))?;
    match ready_rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(())) => Ok(CaptureSession { stop, buffers, worker }),
        Ok(Err(error)) => { let _ = worker.join(); Err(error) },
        Err(error) => { stop.store(true, Ordering::Relaxed); let _ = worker.join(); Err(format!("WASAPI no respondió al iniciar: {error}")) }
    }
}

fn capture(stop: Arc<AtomicBool>, buffers: Arc<Mutex<AudioBuffers>>, ready: mpsc::SyncSender<Result<(), String>>) -> Result<(), String> {
    initialize_mta().ok().map_err(|error| format!("No se pudo inicializar COM para WASAPI: {error}"))?;
    let result = (|| -> Result<_, String> {
        let devices = DeviceEnumerator::new().map_err(err)?;
        let mic_device = devices.get_default_device(&Direction::Capture).map_err(|e| format!("No se encontró un micrófono predeterminado: {e}"))?;
        let output_device = devices.get_default_device(&Direction::Render).map_err(|e| format!("No se encontró una salida de audio predeterminada: {e}"))?;
        let format = WaveFormat::new(32, 32, &SampleType::Float, 48_000, 1, None);
        let mode = StreamMode::PollingShared { autoconvert: true, buffer_duration_hns: 200_000 };

        let mut mic_client = mic_device.get_iaudioclient().map_err(err)?;
        mic_client.initialize_client(&format, &Direction::Capture, &mode).map_err(|e| format!("No se pudo abrir el micrófono: {e}"))?;
        let mic_capture = mic_client.get_audiocaptureclient().map_err(err)?;
        mic_client.start_stream().map_err(err)?;

        let mut system_client = output_device.get_iaudioclient().map_err(err)?;
        system_client.initialize_client(&format, &Direction::Capture, &mode).map_err(|e| format!("No se pudo activar el loopback del sistema: {e}"))?;
        let system_capture = system_client.get_audiocaptureclient().map_err(err)?;
        system_client.start_stream().map_err(err)?;
        Ok((mic_client, mic_capture, system_client, system_capture))
    })();

    let (mic_client, mic_capture, system_client, system_capture) = match result {
        Ok(clients) => { let _ = ready.send(Ok(())); clients }
        Err(error) => { let _ = ready.send(Err(error.clone())); return Err(error); }
    };

    let mut mic = Vec::new();
    let mut system = Vec::new();
    while !stop.load(Ordering::Relaxed) {
        drain(&mic_capture, &mut mic)?;
        drain(&system_capture, &mut system)?;
        if !mic.is_empty() || !system.is_empty() {
            let mut shared = buffers.lock().map_err(|_| "Se perdió el acceso a la captura de audio.".to_string())?;
            shared.mic.append(&mut mic);
            shared.system.append(&mut system);
        }
        thread::sleep(Duration::from_millis(5));
    }
    let _ = mic_client.stop_stream();
    let _ = system_client.stop_stream();
    Ok(())
}

fn drain(client: &AudioCaptureClient, samples: &mut Vec<f32>) -> Result<(), String> {
    let mut packet = client.get_next_packet_size().map_err(err)?;
    while packet.unwrap_or(0) > 0 {
        let mut bytes = VecDeque::<u8>::new();
        client.read_from_device_to_deque(&mut bytes).map_err(err)?;
        let raw = bytes.make_contiguous();
        for sample in raw.chunks_exact(4) {
            samples.push(f32::from_le_bytes([sample[0], sample[1], sample[2], sample[3]]));
        }
        packet = client.get_next_packet_size().map_err(err)?;
    }
    Ok(())
}

fn stereo_wav(mic: &[f32], system: &[f32]) -> Vec<u8> {
    let frames = mic.len().max(system.len());
    let data_len = (frames as u32).saturating_mul(4);
    let mut wav = Vec::with_capacity(44 + data_len as usize);
    wav.extend_from_slice(b"RIFF"); put_u32(&mut wav, 36 + data_len);
    wav.extend_from_slice(b"WAVEfmt "); put_u32(&mut wav, 16);
    put_u16(&mut wav, 1); put_u16(&mut wav, 2); put_u32(&mut wav, 48_000);
    put_u32(&mut wav, 192_000); put_u16(&mut wav, 4); put_u16(&mut wav, 16);
    wav.extend_from_slice(b"data"); put_u32(&mut wav, data_len);
    for index in 0..frames {
        for track in [&mic, &system] {
            let sample = track.get(index).copied().unwrap_or(0.0).clamp(-1.0, 1.0);
            let pcm = (sample * i16::MAX as f32) as i16;
            wav.extend_from_slice(&pcm.to_le_bytes());
        }
    }
    wav
}

fn put_u16(out: &mut Vec<u8>, value: u16) { out.extend_from_slice(&value.to_le_bytes()); }
fn put_u32(out: &mut Vec<u8>, value: u32) { out.extend_from_slice(&value.to_le_bytes()); }
fn err(error: impl std::fmt::Display) -> String { error.to_string() }
