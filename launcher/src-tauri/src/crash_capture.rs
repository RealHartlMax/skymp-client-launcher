//! Optional out-of-process Windows exception capture. Never enabled implicitly.
use std::path::Path;

pub fn spawn(pid: u32, directory: &Path, expected_image: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new(
            std::env::current_exe().map_err(|_| "Capture helper unavailable")?,
        )
        .arg("--skymp-crash-watch")
        .arg(pid.to_string())
        .arg(directory)
        .arg(expected_image)
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|_| "Capture helper could not start")?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (pid, directory, expected_image);
        Err("Minidumps require Windows".into())
    }
}

/// Must run before Tauri initialization so the helper has no UI or second launcher session.
pub fn helper_entry() -> bool {
    let args = std::env::args_os().collect::<Vec<_>>();
    if args.get(1).and_then(|v| v.to_str()) != Some("--skymp-crash-watch") {
        return false;
    }
    if args.len() == 5 {
        if let Some(pid) = args[2]
            .to_str()
            .and_then(|v| v.parse::<u32>().ok())
            .filter(|v| *v > 0)
        {
            #[cfg(windows)]
            {
                let directory = std::path::PathBuf::from(&args[3]);
                let result = windows::capture(pid, &directory, &args[4].to_string_lossy());
                let state = serde_json::json!({"completed":true,"error":result.err()});
                let _ = std::fs::write(directory.join("capture-status.json"), state.to_string());
            }
        }
    }
    true
}

#[cfg(windows)]
mod windows {
    use super::*;
    use serde_json::{json, Value};
    use std::fs::{self, File};
    use std::os::windows::io::AsRawHandle;
    use std::time::{Duration, Instant};
    use windows_sys::Win32::{
        Foundation::*,
        System::{
            Diagnostics::{Debug::*, ToolHelp::*},
            Threading::*,
        },
    };
    struct Handle(HANDLE);
    impl Drop for Handle {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    fn wide(value: &[u16]) -> String {
        String::from_utf16_lossy(
            &value[..value.iter().position(|v| *v == 0).unwrap_or(value.len())],
        )
    }
    fn modules(pid: u32, address: usize) -> (Vec<Value>, Option<String>, Option<String>) {
        let mut result = Vec::new();
        let mut fault = None;
        let mut rva = None;
        unsafe {
            let handle = Handle(CreateToolhelp32Snapshot(
                TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32,
                pid,
            ));
            if handle.0 == INVALID_HANDLE_VALUE {
                return (result, fault, rva);
            }
            let mut entry: MODULEENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<MODULEENTRY32W>() as u32;
            let mut ok = Module32FirstW(handle.0, &mut entry);
            while ok != 0 && result.len() < 256 {
                let name = wide(&entry.szModule);
                let base = entry.modBaseAddr as usize;
                if address >= base && address < base.saturating_add(entry.modBaseSize as usize) {
                    fault = Some(name.clone());
                    rva = Some(format!("0x{:X}", address - base));
                }
                // Absolute paths and arbitrary in-memory bytes never go into the basis report.
                let file = std::path::PathBuf::from(wide(&entry.szExePath));
                let owned = name.eq_ignore_ascii_case("SkyrimPlatform.dll")
                    || name.eq_ignore_ascii_case("SkyrimPlatformImpl.dll")
                    || name.eq_ignore_ascii_case("MpClientPlugin.dll")
                    || (address >= base
                        && address < base.saturating_add(entry.modBaseSize as usize));
                let pdb = if owned {
                    super::pdb_identifier(&file)
                } else {
                    None
                };
                let hash = if owned {
                    crate::crash_reports::sha_file(&file, 128 * 1024 * 1024)
                } else {
                    None
                };
                let version = if owned {
                    crate::runtime_version::read(&file)
                        .ok()
                        .map(crate::runtime_version::display)
                } else {
                    None
                };
                result.push(json!({"name":name,"source":"loaded","pdb":pdb,"sha256":hash,"version":version}));
                ok = Module32NextW(handle.0, &mut entry);
            }
        }
        (result, fault, rva)
    }
    pub(super) fn capture(pid: u32, directory: &Path, expected_image: &str) -> Result<(), String> {
        // Only an existing app-owned capture directory and an exact expected image.
        if !directory.is_absolute()
            || !directory.is_dir()
            || directory
                .file_name()
                .and_then(|v| v.to_str())
                .map(|v| v.len() != 32 || !v.bytes().all(|b| b.is_ascii_hexdigit()))
                .unwrap_or(true)
        {
            return Err("Invalid capture directory".into());
        }
        let process = unsafe {
            Handle(OpenProcess(
                PROCESS_QUERY_INFORMATION | PROCESS_VM_READ | 0x00100000,
                0,
                pid,
            ))
        };
        if process.0 == 0 {
            return Err("Cannot open capture target".into());
        }
        let mut image = [0u16; 32768];
        let mut len = image.len() as u32;
        if unsafe { QueryFullProcessImageNameW(process.0, 0, image.as_mut_ptr(), &mut len) } == 0 {
            return Err("Cannot identify capture target".into());
        }
        let image_path = std::path::PathBuf::from(String::from_utf16_lossy(&image[..len as usize]));
        if image_path
            .file_name()
            .and_then(|v| v.to_str())
            .map(|v| !v.eq_ignore_ascii_case(expected_image))
            .unwrap_or(true)
        {
            return Err("Capture target changed".into());
        }
        if unsafe { DebugActiveProcess(pid) } == 0 {
            return Err("Exception capture unavailable (another debugger or permissions)".into());
        }
        // A helper failure must never kill the game.
        if unsafe { DebugSetProcessKillOnExit(0) } == 0 {
            unsafe {
                DebugActiveProcessStop(pid);
            }
            return Err("Cannot safely initialize exception capture".into());
        }
        let mut initial_breakpoint = true;
        let started = Instant::now();
        let outcome = (|| {
            loop {
                let mut event: DEBUG_EVENT = unsafe { std::mem::zeroed() };
                if unsafe { WaitForDebugEvent(&mut event, 1000) } == 0 {
                    if unsafe { WaitForSingleObject(process.0, 0) } == WAIT_OBJECT_0 {
                        break;
                    }
                    if started.elapsed() > Duration::from_secs(24 * 60 * 60) {
                        return Err("Capture session timed out".into());
                    }
                    continue;
                }
                let mut continuation = DBG_CONTINUE;
                if event.dwDebugEventCode == EXCEPTION_DEBUG_EVENT {
                    let info = unsafe { event.u.Exception };
                    let mut record = info.ExceptionRecord;
                    let code = record.ExceptionCode as u32;
                    if code == 0x80000003 && initial_breakpoint {
                        initial_breakpoint = false;
                    } else {
                        continuation = DBG_EXCEPTION_NOT_HANDLED;
                    }
                    if info.dwFirstChance == 0 {
                        let address = record.ExceptionAddress as usize;
                        let (loaded, fault, rva) = modules(pid, address);
                        let access = if code == 0xc0000005 && record.NumberParameters >= 2 {
                            Some(match record.ExceptionInformation[0] {
                                0 => "read",
                                1 => "write",
                                8 => "execute",
                                _ => "unknown",
                            })
                        } else {
                            None
                        };
                        let invalid = if access.is_some() {
                            Some(format!("0x{:X}", record.ExceptionInformation[1]))
                        } else {
                            None
                        };
                        let mut metadata = json!({"capturedAtUnix":crate::crash_reports::now(),"exceptionCode":format!("0x{code:08X}"),"module":fault,"rva":rva,"access":access,"invalidAddress":invalid,"threadId":event.dwThreadId,"loadedModules":loaded,"stackAvailable":false,"dumpCaptured":false,"dumpError":null});
                        let _ = fs::write(directory.join("exception.json"), metadata.to_string());
                        let thread = unsafe {
                            Handle(OpenThread(
                                THREAD_GET_CONTEXT | THREAD_QUERY_INFORMATION,
                                0,
                                event.dwThreadId,
                            ))
                        };
                        #[repr(align(16))]
                        struct AlignedContext(CONTEXT);
                        let mut context = AlignedContext(unsafe { std::mem::zeroed() });
                        context.0.ContextFlags = CONTEXT_ALL_AMD64;
                        if thread.0 != 0
                            && unsafe { GetThreadContext(thread.0, &mut context.0) } != 0
                        {
                            let mut pointers = EXCEPTION_POINTERS {
                                ExceptionRecord: &mut record,
                                ContextRecord: &mut context.0,
                            };
                            let exception = MINIDUMP_EXCEPTION_INFORMATION {
                                ThreadId: event.dwThreadId,
                                ExceptionPointers: &mut pointers,
                                ClientPointers: 0,
                            };
                            // Never overwrite an unrelated file. Keep dump creation separate from upload consent.
                            if let Ok(file) = File::options()
                                .write(true)
                                .create_new(true)
                                .open(directory.join("crash.pending.dmp"))
                            {
                                let ok = unsafe {
                                    MiniDumpWriteDump(
                                        process.0,
                                        pid,
                                        file.as_raw_handle() as isize,
                                        MiniDumpNormal,
                                        &exception,
                                        std::ptr::null(),
                                        std::ptr::null(),
                                    )
                                };
                                let os_error = if ok == 0 {
                                    unsafe { GetLastError() }
                                } else {
                                    0
                                };
                                let oversized = file
                                    .metadata()
                                    .map(|m| m.len() > crate::crash_reports::MAX_DUMP)
                                    .unwrap_or(true);
                                drop(file);
                                if ok != 0 && !oversized {
                                    metadata["dumpCaptured"] = json!(fs::rename(
                                        directory.join("crash.pending.dmp"),
                                        directory.join("crash.dmp")
                                    )
                                    .is_ok());
                                } else {
                                    metadata["dumpError"] = json!(if oversized {
                                        "Local dump limit exceeded".into()
                                    } else {
                                        format!("MiniDumpWriteDump osError={os_error}")
                                    });
                                    let _ = fs::remove_file(directory.join("crash.pending.dmp"));
                                }
                            } else {
                                metadata["dumpError"] = json!("Cannot create local dump file");
                            }
                        } else {
                            metadata["dumpError"] =
                                json!(format!("GetThreadContext osError={}", unsafe {
                                    GetLastError()
                                }));
                        }
                        let _ = fs::write(directory.join("exception.json"), metadata.to_string());
                    }
                }
                unsafe {
                    if event.dwDebugEventCode == LOAD_DLL_DEBUG_EVENT {
                        let h = event.u.LoadDll.hFile;
                        if h != 0 {
                            CloseHandle(h);
                        }
                    }
                    if event.dwDebugEventCode == CREATE_PROCESS_DEBUG_EVENT {
                        let h = event.u.CreateProcessInfo.hFile;
                        if h != 0 {
                            CloseHandle(h);
                        }
                    }
                    ContinueDebugEvent(event.dwProcessId, event.dwThreadId, continuation);
                }
                if event.dwDebugEventCode == EXIT_PROCESS_DEBUG_EVENT {
                    break;
                }
            }
            Ok(())
        })();
        unsafe {
            DebugActiveProcessStop(pid);
        }
        outcome
    }
}

/// Read just the PE CodeView identifier. No loading DLLs, symbols or executable code.
pub fn pdb_identifier(file: &Path) -> Option<serde_json::Value> {
    let metadata = std::fs::metadata(file).ok()?;
    if metadata.len() > 128 * 1024 * 1024 {
        return None;
    }
    let bytes = std::fs::read(file).ok()?;
    let u16_at = |at: usize| {
        bytes
            .get(at..at.checked_add(2)?)
            .map(|v| u16::from_le_bytes(v.try_into().unwrap()))
    };
    let u32_at = |at: usize| {
        bytes
            .get(at..at.checked_add(4)?)
            .map(|v| u32::from_le_bytes(v.try_into().unwrap()))
    };
    if bytes.get(..2)? != b"MZ" {
        return None;
    }
    let pe = u32_at(0x3c)? as usize;
    if bytes.get(pe..pe.checked_add(4)?)? != b"PE\0\0" {
        return None;
    }
    let optional = pe.checked_add(24)?;
    let magic = u16_at(optional)?;
    let directories = optional.checked_add(match magic {
        0x20b => 112,
        0x10b => 96,
        _ => return None,
    })?;
    let debug_rva = u32_at(directories.checked_add(6 * 8)?)?;
    let debug_size = u32_at(directories.checked_add(6 * 8 + 4)?)?;
    let sections = optional.checked_add(u16_at(pe + 20)? as usize)?;
    let map = |rva: u32| -> Option<usize> {
        for index in 0..u16_at(pe + 6)?.min(96) as usize {
            let at = sections.checked_add(index * 40)?;
            let va = u32_at(at + 12)?;
            let size = u32_at(at + 16)?;
            if rva >= va && rva - va < size {
                return (u32_at(at + 20)? as usize).checked_add((rva - va) as usize);
            }
        }
        None
    };
    let debug = map(debug_rva)?;
    for index in 0..(debug_size / 28).min(128) as usize {
        let at = debug.checked_add(index * 28)?;
        if u32_at(at + 12)? != 2 {
            continue;
        }
        let record = u32_at(at + 24)? as usize;
        if bytes.get(record..record.checked_add(4)?)? != b"RSDS" {
            continue;
        }
        let guid = bytes
            .get(record + 4..record.checked_add(20)?)?
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        return Some(serde_json::json!({"guid":guid,"age":u32_at(record+20)?}));
    }
    None
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    #[test]
    #[ignore = "requires the separately built benign crash_capture_fixture, never a game"]
    fn captures_second_chance_exception_from_isolated_fixture() {
        let executable = std::env::var_os("SKYMP_CRASH_FIXTURE")
            .expect("Set SKYMP_CRASH_FIXTURE to the benign example");
        let file = std::path::PathBuf::from(executable);
        assert_eq!(file.file_name().unwrap(), "crash_capture_fixture.exe");
        let temp = tempfile::tempdir().unwrap();
        let directory = temp.path().join("a".repeat(32));
        std::fs::create_dir(&directory).unwrap();
        let mut child = std::process::Command::new(&file).spawn().unwrap();
        super::windows::capture(child.id(), &directory, "crash_capture_fixture.exe").unwrap();
        let status = child.wait().unwrap();
        assert_eq!(status.code().unwrap() as u32, 0xe000ca55);
        let metadata: serde_json::Value =
            serde_json::from_slice(&std::fs::read(directory.join("exception.json")).unwrap())
                .unwrap();
        assert_eq!(metadata["exceptionCode"], "0xE000CA55");
        let dump = std::fs::read(directory.join("crash.dmp"))
            .unwrap_or_else(|error| panic!("{error}; metadata={metadata}"));
        assert_eq!(&dump[..4], b"MDMP");
    }
    #[test]
    fn malformed_pe_cannot_supply_arbitrary_paths_or_panic() {
        let file = tempfile::NamedTempFile::new().unwrap();
        for content in [vec![], vec![0; 96], b"MZ not an image".to_vec()] {
            std::fs::write(file.path(), content).unwrap();
            assert!(super::pdb_identifier(file.path()).is_none());
        }
    }
}
