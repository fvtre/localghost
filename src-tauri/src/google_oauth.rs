use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use std::{ffi::{c_void, OsStr}, fs, io::{BufRead, BufReader, Write}, net::{TcpListener, TcpStream}, os::windows::ffi::OsStrExt, path::PathBuf, time::{Duration, Instant}};

#[derive(serde::Serialize)]
pub struct OAuthCallback {
    pub code: String,
    pub code_verifier: String,
    pub redirect_uri: String,
}

#[repr(C)]
struct DataBlob { size: u32, data: *mut u8 }

fn refresh_token_path() -> Result<PathBuf, String> {
    let root = std::env::var_os("LOCALAPPDATA").ok_or("Windows no informó la carpeta local de datos del usuario.")?;
    Ok(PathBuf::from(root).join("LocalGhost").join("calendar-refresh.bin"))
}

fn client_secret_path() -> Result<PathBuf, String> {
    let root = std::env::var_os("LOCALAPPDATA").ok_or("Windows no informó la carpeta local de datos del usuario.")?;
    Ok(PathBuf::from(root).join("LocalGhost").join("calendar-client-secret.bin"))
}

pub fn store_client_secret(secret: &str) -> Result<(), String> {
    if secret.is_empty() || secret.len() > 16_384 { return Err("El secreto OAuth no es válido.".into()); }
    let mut input = DataBlob { size: secret.len() as u32, data: secret.as_ptr() as *mut u8 };
    let mut output = DataBlob { size: 0, data: std::ptr::null_mut() };
    #[link(name = "crypt32")]
    unsafe extern "system" { fn CryptProtectData(input: *mut DataBlob, description: *const u16, entropy: *mut DataBlob, reserved: *mut c_void, prompt: *mut c_void, flags: u32, output: *mut DataBlob) -> i32; }
    #[link(name = "kernel32")]
    unsafe extern "system" { fn LocalFree(memory: *mut c_void) -> *mut c_void; }
    let ok = unsafe { CryptProtectData(&mut input, std::ptr::null(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), 0x1, &mut output) };
    if ok == 0 { return Err("Windows no pudo proteger el secreto OAuth para este usuario.".into()); }
    let bytes = unsafe { std::slice::from_raw_parts(output.data, output.size as usize) };
    let result = (|| {
        let path = client_secret_path()?;
        let parent = path.parent().ok_or("No se encontró la carpeta local de LocalGhost.")?;
        fs::create_dir_all(parent).map_err(|e| format!("No se pudo crear el almacén privado local: {e}"))?;
        fs::write(path, bytes).map_err(|e| format!("No se pudo guardar el secreto OAuth protegido: {e}"))
    })();
    unsafe { LocalFree(output.data as *mut c_void); }
    result
}

pub fn load_client_secret() -> Result<Option<String>, String> {
    let path = client_secret_path()?;
    let encrypted = match fs::read(path) { Ok(value) => value, Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None), Err(error) => return Err(format!("No se pudo leer el secreto local: {error}")) };
    let mut input = DataBlob { size: encrypted.len() as u32, data: encrypted.as_ptr() as *mut u8 };
    let mut output = DataBlob { size: 0, data: std::ptr::null_mut() };
    #[link(name = "crypt32")]
    unsafe extern "system" { fn CryptUnprotectData(input: *mut DataBlob, description: *mut *mut u16, entropy: *mut DataBlob, reserved: *mut c_void, prompt: *mut c_void, flags: u32, output: *mut DataBlob) -> i32; }
    #[link(name = "kernel32")]
    unsafe extern "system" { fn LocalFree(memory: *mut c_void) -> *mut c_void; }
    let ok = unsafe { CryptUnprotectData(&mut input, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), 0x1, &mut output) };
    if ok == 0 { return Err("Windows no pudo descifrar el secreto OAuth local.".into()); }
    let bytes = unsafe { std::slice::from_raw_parts(output.data, output.size as usize) };
    let secret = String::from_utf8(bytes.to_vec()).map_err(|_| "El secreto OAuth local está dañado.".to_string());
    unsafe { LocalFree(output.data as *mut c_void); }
    secret.map(Some)
}

pub fn clear_client_secret() -> Result<(), String> {
    let path = client_secret_path()?;
    match fs::remove_file(path) { Ok(()) => Ok(()), Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()), Err(error) => Err(format!("No se pudo borrar el secreto OAuth local: {error}")) }
}

pub fn store_refresh_token(token: &str) -> Result<(), String> {
    if token.is_empty() || token.len() > 16_384 { return Err("El token de Google no es válido.".into()); }
    let mut input = DataBlob { size: token.len() as u32, data: token.as_ptr() as *mut u8 };
    let mut output = DataBlob { size: 0, data: std::ptr::null_mut() };
    #[link(name = "crypt32")]
    unsafe extern "system" { fn CryptProtectData(input: *mut DataBlob, description: *const u16, entropy: *mut DataBlob, reserved: *mut c_void, prompt: *mut c_void, flags: u32, output: *mut DataBlob) -> i32; }
    #[link(name = "kernel32")]
    unsafe extern "system" { fn LocalFree(memory: *mut c_void) -> *mut c_void; }
    let ok = unsafe { CryptProtectData(&mut input, std::ptr::null(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), 0x1, &mut output) };
    if ok == 0 { return Err("Windows no pudo proteger el permiso de Google para este usuario.".into()); }
    let bytes = unsafe { std::slice::from_raw_parts(output.data, output.size as usize) };
    let result = (|| {
        let path = refresh_token_path()?;
        let parent = path.parent().ok_or("No se encontró la carpeta local de LocalGhost.")?;
        fs::create_dir_all(parent).map_err(|e| format!("No se pudo crear el almacén privado local: {e}"))?;
        fs::write(path, bytes).map_err(|e| format!("No se pudo guardar el permiso protegido de Google: {e}"))
    })();
    unsafe { LocalFree(output.data as *mut c_void); }
    result
}

pub fn load_refresh_token() -> Result<Option<String>, String> {
    let path = refresh_token_path()?;
    let encrypted = match fs::read(path) { Ok(value) => value, Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None), Err(error) => return Err(format!("No se pudo leer el permiso guardado: {error}")) };
    let mut input = DataBlob { size: encrypted.len() as u32, data: encrypted.as_ptr() as *mut u8 };
    let mut output = DataBlob { size: 0, data: std::ptr::null_mut() };
    #[link(name = "crypt32")]
    unsafe extern "system" { fn CryptUnprotectData(input: *mut DataBlob, description: *mut *mut u16, entropy: *mut DataBlob, reserved: *mut c_void, prompt: *mut c_void, flags: u32, output: *mut DataBlob) -> i32; }
    #[link(name = "kernel32")]
    unsafe extern "system" { fn LocalFree(memory: *mut c_void) -> *mut c_void; }
    let ok = unsafe { CryptUnprotectData(&mut input, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), 0x1, &mut output) };
    if ok == 0 { return Err("Windows no pudo descifrar el permiso local de Google.".into()); }
    let bytes = unsafe { std::slice::from_raw_parts(output.data, output.size as usize) };
    let token = String::from_utf8(bytes.to_vec()).map_err(|_| "El permiso local de Google está dañado.".to_string());
    unsafe { LocalFree(output.data as *mut c_void); }
    token.map(Some)
}

pub fn clear_refresh_token() -> Result<(), String> {
    let path = refresh_token_path()?;
    match fs::remove_file(path) { Ok(()) => Ok(()), Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()), Err(error) => Err(format!("No se pudo borrar el permiso local de Google: {error}")) }
}

pub fn authorize(client_id: String) -> Result<OAuthCallback, String> {
    let client_id = client_id.trim().to_owned();
    if !client_id.ends_with(".apps.googleusercontent.com") {
        return Err("Usa un ID OAuth de Google Cloud para aplicación de escritorio.".into());
    }

    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("No se pudo abrir el retorno OAuth local: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}");
    let state = random_url_token(32)?;
    let code_verifier = random_url_token(48)?;
    let code_challenge = URL_SAFE_NO_PAD.encode(sha256(code_verifier.as_bytes())?);
    let authorization_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
        url_encode(&client_id), url_encode(&redirect_uri),
        url_encode("https://www.googleapis.com/auth/calendar.events.readonly"),
        url_encode(&state), url_encode(&code_challenge),
    );
    open_system_browser(&authorization_url)?;

    let deadline = Instant::now() + Duration::from_secs(180);
    loop {
        match listener.accept() {
            Ok((stream, _)) => {
                if let Some(result) = handle_callback(stream, &state) {
                    return result.map(|code| OAuthCallback { code, code_verifier, redirect_uri });
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline { return Err("Se agotó el tiempo para autorizar Google Calendar.".into()); }
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(error) => return Err(format!("Falló el retorno OAuth: {error}")),
        }
    }
}

fn handle_callback(mut stream: TcpStream, expected_state: &str) -> Option<Result<String, String>> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let mut request = String::new();
    let mut reader = BufReader::new(&mut stream);
    if reader.read_line(&mut request).is_err() { return None; }
    let mut parts = request.split_whitespace();
    if parts.next() != Some("GET") { return None; }
    let path = parts.next()?;
    let (_, query) = path.split_once('?')?;
    let params = query.split('&').filter_map(|part| {
        let (key, value) = part.split_once('=')?;
        Some((url_decode(key)?, url_decode(value)?))
    }).collect::<std::collections::HashMap<_, _>>();
    if let Some(error) = params.get("error") {
        respond(&mut stream, "Google no autorizó el acceso. Puedes cerrar esta pestaña.");
        let detail = params.get("error_description").map(|description| format!(" ({description})")).unwrap_or_default();
        return Some(Err(format!("Google rechazó la autorización: {error}{detail}")));
    }
    if params.get("state").map(String::as_str) != Some(expected_state) {
        respond(&mut stream, "No se pudo validar esta autorización. Vuelve a LocalGhost.");
        return Some(Err("La respuesta OAuth no pasó la validación de seguridad.".into()));
    }
    let Some(code) = params.get("code").cloned() else {
        respond(&mut stream, "Falta el código de autorización. Vuelve a LocalGhost.");
        return Some(Err("Google no devolvió un código de autorización.".into()));
    };
    respond(&mut stream, "Google Calendar quedó autorizado. Puedes cerrar esta pestaña y volver a LocalGhost.");
    Some(Ok(code))
}

fn respond(stream: &mut TcpStream, message: &str) {
    let body = format!("<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><title>LocalGhost</title><body style=\"font:16px system-ui;background:#09090b;color:#eee;padding:3rem\"><h2>{message}</h2></body></html>");
    let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
    let _ = stream.write_all(response.as_bytes());
}

fn open_system_browser(url: &str) -> Result<(), String> {
    let wide: Vec<u16> = OsStr::new(url).encode_wide().chain(Some(0)).collect();
    let operation: Vec<u16> = OsStr::new("open").encode_wide().chain(Some(0)).collect();
    #[link(name = "shell32")]
    unsafe extern "system" { fn ShellExecuteW(hwnd: *mut c_void, operation: *const u16, file: *const u16, parameters: *const u16, directory: *const u16, show: i32) -> isize; }
    let result = unsafe { ShellExecuteW(std::ptr::null_mut(), operation.as_ptr(), wide.as_ptr(), std::ptr::null(), std::ptr::null(), 1) };
    if result <= 32 { Err("Windows no pudo abrir el navegador para autorizar Google.".into()) } else { Ok(()) }
}

fn random_url_token(size: usize) -> Result<String, String> {
    let mut bytes = vec![0_u8; size];
    #[link(name = "bcrypt")]
    unsafe extern "system" { fn BCryptGenRandom(algorithm: *mut c_void, buffer: *mut u8, length: u32, flags: u32) -> i32; }
    let status = unsafe { BCryptGenRandom(std::ptr::null_mut(), bytes.as_mut_ptr(), size as u32, 0x00000002) };
    if status < 0 { return Err("Windows no pudo generar un valor seguro para OAuth.".into()); }
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn sha256(input: &[u8]) -> Result<[u8; 32], String> {
    #[link(name = "bcrypt")]
    unsafe extern "system" {
        fn BCryptOpenAlgorithmProvider(algorithm: *mut *mut c_void, name: *const u16, implementation: *const u16, flags: u32) -> i32;
        fn BCryptGetProperty(object: *mut c_void, property: *const u16, output: *mut u8, output_size: u32, result_size: *mut u32, flags: u32) -> i32;
        fn BCryptCreateHash(algorithm: *mut c_void, hash: *mut *mut c_void, object: *mut u8, object_size: u32, secret: *mut u8, secret_size: u32, flags: u32) -> i32;
        fn BCryptHashData(hash: *mut c_void, input: *mut u8, input_size: u32, flags: u32) -> i32;
        fn BCryptFinishHash(hash: *mut c_void, output: *mut u8, output_size: u32, flags: u32) -> i32;
        fn BCryptDestroyHash(hash: *mut c_void) -> i32;
        fn BCryptCloseAlgorithmProvider(algorithm: *mut c_void, flags: u32) -> i32;
    }
    fn checked(status: i32) -> Result<(), String> { if status < 0 { Err(format!("Windows no pudo preparar PKCE (0x{:08x}).", status as u32)) } else { Ok(()) } }
    let name: Vec<u16> = OsStr::new("SHA256").encode_wide().chain(Some(0)).collect();
    let property: Vec<u16> = OsStr::new("ObjectLength").encode_wide().chain(Some(0)).collect();
    let mut algorithm = std::ptr::null_mut();
    checked(unsafe { BCryptOpenAlgorithmProvider(&mut algorithm, name.as_ptr(), std::ptr::null(), 0) })?;
    let mut object_size = 0_u32;
    let mut result_size = 0_u32;
    let property_result = unsafe { BCryptGetProperty(algorithm, property.as_ptr(), &mut object_size as *mut u32 as *mut u8, 4, &mut result_size, 0) };
    if let Err(error) = checked(property_result) { unsafe { BCryptCloseAlgorithmProvider(algorithm, 0); } return Err(error); }
    let mut object = vec![0_u8; object_size as usize];
    let mut hash = std::ptr::null_mut();
    let created = unsafe { BCryptCreateHash(algorithm, &mut hash, object.as_mut_ptr(), object_size, std::ptr::null_mut(), 0, 0) };
    if let Err(error) = checked(created) { unsafe { BCryptCloseAlgorithmProvider(algorithm, 0); } return Err(error); }
    let hashed = unsafe { BCryptHashData(hash, input.as_ptr() as *mut u8, input.len() as u32, 0) };
    let mut output = [0_u8; 32];
    let finished = if hashed < 0 { hashed } else { unsafe { BCryptFinishHash(hash, output.as_mut_ptr(), output.len() as u32, 0) } };
    unsafe { BCryptDestroyHash(hash); BCryptCloseAlgorithmProvider(algorithm, 0); }
    checked(finished)?;
    Ok(output)
}

fn url_encode(value: &str) -> String {
    value.bytes().map(|byte| if byte.is_ascii_alphanumeric() || b"-._~".contains(&byte) { (byte as char).to_string() } else { format!("%{byte:02X}") }).collect()
}

fn url_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() { return None; }
            decoded.push(u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?, 16).ok()?);
            i += 3;
        } else {
            decoded.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
            i += 1;
        }
    }
    String::from_utf8(decoded).ok()
}
