//! Inspect executable version resources without loading or executing a binary.
use std::path::Path;

pub fn parse(value: &str) -> Result<[u16; 4], String> {
    let parts = value.split('.').collect::<Vec<_>>();
    if parts.len() != 4 {
        return Err(format!(
            "Use a complete game version, for example 1.7.104.0: {value}"
        ));
    }
    let mut version = [0; 4];
    for (index, part) in parts.iter().enumerate() {
        if part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit()) {
            return Err(format!("Invalid game version: {value}"));
        }
        version[index] = part
            .parse()
            .map_err(|_| format!("Invalid game version: {value}"))?;
    }
    Ok(version)
}

pub fn display(version: [u16; 4]) -> String {
    format!(
        "{}.{}.{}.{}",
        version[0], version[1], version[2], version[3]
    )
}

pub fn read(path: &Path) -> Result<[u16; 4], String> {
    let bytes = std::fs::metadata(path)
        .map_err(|e| format!("Read {}: {e}", path.display()))?
        .len();
    if bytes > 512 * 1024 * 1024 {
        return Err("Executable exceeds version-inspection limit".into());
    }
    let data = std::fs::read(path).map_err(|e| format!("Read {}: {e}", path.display()))?;
    pe_version(&data).map_err(|e| {
        format!(
            "Cannot read executable version from {}: {e}",
            path.display()
        )
    })
}

fn slice(data: &[u8], offset: usize, length: usize) -> Result<&[u8], String> {
    let end = offset.checked_add(length).ok_or("Invalid PE offset")?;
    data.get(offset..end)
        .ok_or_else(|| "Truncated PE version resource".into())
}

fn word(data: &[u8], offset: usize) -> Result<u16, String> {
    Ok(u16::from_le_bytes(
        slice(data, offset, 2)?.try_into().unwrap(),
    ))
}

fn dword(data: &[u8], offset: usize) -> Result<u32, String> {
    Ok(u32::from_le_bytes(
        slice(data, offset, 4)?.try_into().unwrap(),
    ))
}

fn resource_child(resource: &[u8], directory: usize, id: Option<u32>) -> Result<u32, String> {
    let count = word(resource, directory + 12)? as usize + word(resource, directory + 14)? as usize;
    let entries = slice(resource, directory + 16, count * 8)?;
    for entry in entries.chunks_exact(8) {
        if id
            .map(|id| dword(entry, 0).ok() == Some(id))
            .unwrap_or(true)
        {
            return dword(entry, 4);
        }
    }
    Err("Executable has no version resource".into())
}

fn pe_version(data: &[u8]) -> Result<[u16; 4], String> {
    // Read RT_VERSION directly. Windows compatibility shims can report a different
    // version for the same file depending on its name/location; raw resources do not.
    if slice(data, 0, 2)? != b"MZ" {
        return Err("Not a Windows executable".into());
    }
    let pe = dword(data, 0x3c)? as usize;
    if slice(data, pe, 4)? != b"PE\0\0" {
        return Err("Invalid PE signature".into());
    }
    let sections = word(data, pe + 6)? as usize;
    if sections == 0 || sections > 96 {
        return Err("Invalid PE section count".into());
    }
    let optional_size = word(data, pe + 20)? as usize;
    let optional = slice(data, pe + 24, optional_size)?;
    let directories = match word(optional, 0)? {
        0x10b => 96,
        0x20b => 112,
        _ => return Err("Unsupported PE type".into()),
    };
    let resource_rva = dword(optional, directories + 16)?;
    let resource_size = dword(optional, directories + 20)? as usize;
    let table = slice(data, pe + 24 + optional_size, sections * 40)?;
    let map = |rva: u32, length: usize| -> Result<usize, String> {
        for section in table.chunks_exact(40) {
            let start = dword(section, 12)? as u64;
            let size = dword(section, 16)? as u64;
            if rva as u64 >= start && (rva as u64 - start) + length as u64 <= size {
                let offset = dword(section, 20)? as u64 + rva as u64 - start;
                let offset = usize::try_from(offset).map_err(|_| "Invalid PE section offset")?;
                slice(data, offset, length)?;
                return Ok(offset);
            }
        }
        Err("PE resource lies outside its file section".into())
    };
    let resource = slice(data, map(resource_rva, resource_size)?, resource_size)?;
    let name = resource_child(resource, 0, Some(16))?;
    if name & 0x80000000 == 0 {
        return Err("Invalid version resource directory".into());
    }
    let language = resource_child(resource, (name & 0x7fffffff) as usize, None)?;
    if language & 0x80000000 == 0 {
        return Err("Invalid version language directory".into());
    }
    let entry = resource_child(resource, (language & 0x7fffffff) as usize, None)?;
    if entry & 0x80000000 != 0 {
        return Err("Invalid version data entry".into());
    }
    let rva = dword(resource, entry as usize)?;
    let size = dword(resource, entry as usize + 4)? as usize;
    let value = slice(data, map(rva, size)?, size)?;
    let value = slice(value, 0, word(value, 0)? as usize)?;
    if word(value, 2)? < 52 || word(value, 4)? != 0 {
        return Err("Invalid fixed file info".into());
    }
    let key = "VS_VERSION_INFO"
        .encode_utf16()
        .chain(Some(0))
        .collect::<Vec<_>>();
    for (index, expected) in key.iter().enumerate() {
        if word(value, 6 + index * 2)? != *expected {
            return Err("Invalid version resource key".into());
        }
    }
    let fixed = (6 + key.len() * 2 + 3) & !3;
    if dword(value, fixed)? != 0xfeef04bd {
        return Err("Invalid fixed file info signature".into());
    }
    slice(value, fixed, 52)?;
    let ms = dword(value, fixed + 8)?;
    let ls = dword(value, fixed + 12)?;
    Ok([(ms >> 16) as u16, ms as u16, (ls >> 16) as u16, ls as u16])
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    #[test]
    fn exact_versions_do_not_confuse_skyrim_and_skse_versions() {
        assert_eq!(parse("1.7.104.0").unwrap(), [1, 7, 104, 0]);
        assert!(parse("2.3.1").is_err());
        assert!(parse("1.7.104.-1").is_err());
        assert!(parse("1.7.65536.0").is_err());
    }

    pub(crate) fn executable(version: [u16; 4], wide: bool) -> Vec<u8> {
        fn put16(data: &mut [u8], offset: usize, value: u16) {
            data[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
        }
        fn put32(data: &mut [u8], offset: usize, value: u32) {
            data[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        }
        let (magic, optional_size, directory) = if wide {
            (0x20b, 240, 112)
        } else {
            (0x10b, 224, 96)
        };
        let mut data = vec![0u8; 1024];
        data[..2].copy_from_slice(b"MZ");
        put32(&mut data, 0x3c, 0x80);
        data[0x80..0x84].copy_from_slice(b"PE\0\0");
        put16(&mut data, 0x86, 1);
        put16(&mut data, 0x94, optional_size);
        put16(&mut data, 0x98, magic);
        put32(&mut data, 0x98 + directory + 16, 0x1000);
        put32(&mut data, 0x98 + directory + 20, 256);
        let section = 0x98 + optional_size as usize;
        put32(&mut data, section + 12, 0x1000);
        put32(&mut data, section + 16, 512);
        put32(&mut data, section + 20, 512);
        put16(&mut data, 0x20e, 1);
        put32(&mut data, 0x210, 16);
        put32(&mut data, 0x214, 0x80000018);
        put16(&mut data, 0x226, 1);
        put32(&mut data, 0x228, 1);
        put32(&mut data, 0x22c, 0x80000030);
        put16(&mut data, 0x23e, 1);
        put32(&mut data, 0x240, 0x409);
        put32(&mut data, 0x244, 0x48);
        put32(&mut data, 0x248, 0x1060);
        put32(&mut data, 0x24c, 92);
        put16(&mut data, 0x260, 92);
        put16(&mut data, 0x262, 52);
        for (index, character) in "VS_VERSION_INFO".encode_utf16().chain(Some(0)).enumerate() {
            put16(&mut data, 0x266 + index * 2, character);
        }
        put32(&mut data, 0x288, 0xfeef04bd);
        put32(
            &mut data,
            0x290,
            (version[0] as u32) << 16 | version[1] as u32,
        );
        put32(
            &mut data,
            0x294,
            (version[2] as u32) << 16 | version[3] as u32,
        );
        data
    }

    #[test]
    fn version_resources_are_bounded_and_support_both_pe_types() {
        for wide in [true, false] {
            let mut data = executable([1, 7, 104, 0], wide);
            assert_eq!(pe_version(&data).unwrap(), [1, 7, 104, 0]);
            assert!(pe_version(&data[..700]).is_err());
            data[0x244..0x248].copy_from_slice(&0x7fffffffu32.to_le_bytes());
            assert!(pe_version(&data).is_err());
        }
    }

    #[cfg(windows)]
    #[test]
    fn reads_real_pe_versions_even_from_extensionless_cache_files() {
        let root = std::env::var_os("SystemRoot").unwrap();
        let source = Path::new(&root).join("System32/cmd.exe");
        let version = read(&source).unwrap();
        assert!(version[0] >= 6);
        let temp = tempfile::tempdir().unwrap();
        let cached = temp.path().join("cached-binary");
        std::fs::copy(source, &cached).unwrap();
        assert_eq!(read(&cached).unwrap(), version);
        std::fs::write(&cached, b"not an executable").unwrap();
        assert!(read(&cached).is_err());
    }
}
