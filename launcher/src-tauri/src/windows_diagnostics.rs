//! Read only the crash report's allowlisted fields, without launching a shell or WMI.
use serde_json::{json, Value};
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::path::PathBuf;
use windows_sys::Win32::{
    Graphics::Gdi::{EnumDisplayDevicesW, DISPLAY_DEVICEW, DISPLAY_DEVICE_MIRRORING_DRIVER},
    System::{
        Com::{CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_APARTMENTTHREADED},
        Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ},
        SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX, OSVERSIONINFOW},
    },
    UI::Shell::{FOLDERID_Documents, SHGetKnownFolderPath, KF_FLAG_DONT_VERIFY},
};

#[link(name = "ntdll")]
extern "system" {
    fn RtlGetVersion(version: *mut OSVERSIONINFOW) -> i32;
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

fn text(value: &[u16]) -> String {
    String::from_utf16_lossy(&value[..value.iter().position(|v| *v == 0).unwrap_or(value.len())])
}

struct Apartment(bool);
impl Drop for Apartment {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

pub(crate) fn documents() -> Option<PathBuf> {
    unsafe {
        // Background report threads need COM; an already initialized STA/MTA is also usable.
        let initialized = CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
        const RPC_E_CHANGED_MODE: i32 = 0x80010106_u32 as i32;
        if initialized < 0 && initialized != RPC_E_CHANGED_MODE {
            return None;
        }
        let _apartment = Apartment(initialized >= 0);
        let mut pointer = std::ptr::null_mut();
        let result = SHGetKnownFolderPath(
            &FOLDERID_Documents,
            KF_FLAG_DONT_VERIFY as u32,
            0,
            &mut pointer,
        );
        let path = if result >= 0 && !pointer.is_null() {
            let mut length = 0;
            while *pointer.add(length) != 0 {
                length += 1;
            }
            Some(PathBuf::from(OsString::from_wide(
                std::slice::from_raw_parts(pointer, length),
            )))
        } else {
            None
        };
        // The API owns this allocation even on failure. Preserve redirected/OneDrive paths.
        CoTaskMemFree(pointer.cast());
        path.filter(|p| p.is_absolute())
    }
}

fn registry_string(key: &str, name: &str) -> Option<String> {
    let (key, name) = (wide(key), wide(name));
    unsafe {
        let mut bytes = 0;
        if RegGetValueW(
            HKEY_LOCAL_MACHINE,
            key.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut bytes,
        ) != 0
            || !(2..=4096).contains(&bytes)
            || bytes % 2 != 0
        {
            return None;
        }
        let mut buffer = vec![0u16; bytes as usize / 2];
        if RegGetValueW(
            HKEY_LOCAL_MACHINE,
            key.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            buffer.as_mut_ptr().cast(),
            &mut bytes,
        ) != 0
        {
            return None;
        }
        let value = text(&buffer).trim().to_owned();
        (!value.is_empty()).then_some(value)
    }
}

pub(crate) fn environment() -> Value {
    unsafe {
        let mut version: OSVERSIONINFOW = std::mem::zeroed();
        version.dwOSVersionInfoSize = std::mem::size_of::<OSVERSIONINFOW>() as u32;
        let os = if RtlGetVersion(&mut version) >= 0 {
            format!(
                "{}.{}.{}",
                version.dwMajorVersion, version.dwMinorVersion, version.dwBuildNumber
            )
        } else {
            "windows".into()
        };
        let mut memory: MEMORYSTATUSEX = std::mem::zeroed();
        memory.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        let memory_available = GlobalMemoryStatusEx(&mut memory) != 0;
        let cpu = registry_string(
            r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
            "ProcessorNameString",
        );
        let mut gpu = Vec::new();
        for index in 0..32 {
            let mut device: DISPLAY_DEVICEW = std::mem::zeroed();
            device.cb = std::mem::size_of::<DISPLAY_DEVICEW>() as u32;
            if EnumDisplayDevicesW(std::ptr::null(), index, &mut device, 0) == 0 {
                break;
            }
            if device.StateFlags & DISPLAY_DEVICE_MIRRORING_DRIVER != 0 {
                continue;
            }
            let name = text(&device.DeviceString);
            if name.is_empty() {
                continue;
            }
            let key = text(&device.DeviceKey);
            let driver = key
                .strip_prefix(r"\Registry\Machine\")
                .and_then(|key| registry_string(key, "DriverVersion"));
            gpu.push(json!({"Name":name,"DriverVersion":driver}));
            if gpu.len() == 4 {
                break;
            }
        }
        // Never serialize registry keys, device IDs, serials, host/user names or network data.
        json!({
            "os":os, "architecture":std::env::consts::ARCH, "cpu":cpu,
            "ramTotalKiB":memory_available.then_some(memory.ullTotalPhys / 1024),
            "ramFreeKiB":memory_available.then_some(memory.ullAvailPhys / 1024),
            "hardwareAvailable":memory_available || cpu.is_some() || !gpu.is_empty(),
            "gpu":gpu,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn documents_resolves_the_current_users_known_folder_without_a_child_process() {
        let path = documents().expect("Windows Documents known folder");
        assert!(path.is_absolute());
        assert!(!path.as_os_str().is_empty());
    }

    #[test]
    fn native_environment_keeps_the_report_allowlist_and_bounded_gpu_list() {
        let value = environment();
        let mut fields = value
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>();
        fields.sort_unstable();
        assert_eq!(
            fields,
            [
                "architecture",
                "cpu",
                "gpu",
                "hardwareAvailable",
                "os",
                "ramFreeKiB",
                "ramTotalKiB"
            ]
        );
        assert!(!value["os"].as_str().unwrap().is_empty());
        assert_eq!(value["architecture"], std::env::consts::ARCH);
        if let (Some(total), Some(free)) =
            (value["ramTotalKiB"].as_u64(), value["ramFreeKiB"].as_u64())
        {
            assert!(total > 0 && free <= total);
        }
        let adapters = value["gpu"].as_array().unwrap();
        assert!(adapters.len() <= 4);
        for adapter in adapters {
            assert_eq!(adapter.as_object().unwrap().len(), 2);
            assert!(adapter["Name"].is_string());
            assert!(adapter["DriverVersion"].is_null() || adapter["DriverVersion"].is_string());
        }
        assert!(registry_string(r"SOFTWARE\SkyMP-Does-Not-Exist", "missing").is_none());
    }
}
