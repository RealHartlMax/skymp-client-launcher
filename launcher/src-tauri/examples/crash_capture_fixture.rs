//! A small, isolated test process. Does not load or start any game or Steam.
fn main() {
    #[cfg(windows)] unsafe {
        use windows_sys::Win32::System::Diagnostics::Debug::{SetErrorMode,RaiseException};
        SetErrorMode(0x0001|0x0002);
        std::thread::sleep(std::time::Duration::from_secs(2));
        RaiseException(0xe000ca55,0,0,std::ptr::null());
    }
}
