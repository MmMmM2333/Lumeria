#[cfg(target_os = "windows")]
use png::{BitDepth, ColorType, Encoder};
use std::{
    collections::HashSet,
    env, fs,
    fs::File,
    io::BufWriter,
    path::{Path, PathBuf},
    slice,
};

use crate::path_utils::extension;

#[cfg(target_os = "windows")]
use windows::{
    core::{Interface, BOOL, HSTRING, PCWSTR},
    Win32::{
        Foundation::{FreeLibrary, HMODULE, SIZE},
        Graphics::Gdi::{
            CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
            BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        },
        System::{
            Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, IBindCtx, IPersistFile,
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ,
            },
            LibraryLoader::{
                EnumResourceNamesW, FindResourceW, LoadLibraryExW, LoadResource, LockResource,
                SizeofResource, LOAD_LIBRARY_AS_DATAFILE, LOAD_LIBRARY_AS_IMAGE_RESOURCE,
            },
        },
        UI::Shell::{
            IShellItemImageFactory, IShellLinkW, SHCreateItemFromParsingName, ShellLink,
            SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY, SIIGBF_SCALEUP, SLGP_UNCPRIORITY,
        },
        UI::WindowsAndMessaging::{RT_GROUP_ICON, RT_ICON},
    },
};
#[cfg(target_os = "windows")]
pub(crate) fn cache_app_icon(path: &Path, icon_dir: &Path, app_id: &str) -> Option<String> {
    let icon_path = icon_dir.join(format!("{app_id}-v4.png"));
    if icon_path.exists() {
        return Some(icon_path.to_string_lossy().to_string());
    }

    extract_icon_png(path, &icon_path)
        .ok()
        .map(|_| icon_path.to_string_lossy().to_string())
}

#[cfg(target_os = "windows")]
pub(crate) fn cache_app_icon_choices(path: &Path, icon_dir: &Path, app_id: &str) -> Vec<PathBuf> {
    let mut output_paths = Vec::new();
    let mut seen = HashSet::new();

    for (source_index, source) in icon_choice_sources(path).into_iter().enumerate() {
        for icon_index in icon_choice_indexes(&source.path, source.icon_index) {
            let output_path = icon_dir.join(format!(
                "{app_id}-choice-v1-{source_index}-{}.png",
                icon_index_key(icon_index)
            ));
            if !output_path.exists()
                && extract_resource_icon_png(&source.path, &output_path, icon_index).is_err()
            {
                continue;
            }
            if let Ok(bytes) = fs::read(&output_path) {
                if seen.insert(bytes) {
                    output_paths.push(output_path);
                }
            }
        }
    }

    output_paths
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn cache_app_icon_choices(
    _path: &Path,
    _icon_dir: &Path,
    _app_id: &str,
) -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn cache_app_icon(_path: &Path, _icon_dir: &Path, _app_id: &str) -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
fn extract_icon_png(source_path: &Path, output_path: &Path) -> Result<(), String> {
    if let Ok(()) = extract_resource_icon_png(source_path, output_path, None) {
        return Ok(());
    }

    if extension(source_path).as_deref() == Some("lnk") {
        for source in resolve_shortcut_icon_sources(source_path) {
            if extract_resource_icon_png(&source.path, output_path, source.icon_index).is_ok() {
                return Ok(());
            }
        }
    }

    extract_shell_icon_png(source_path, output_path)
}

#[cfg(all(target_os = "windows", debug_assertions))]
pub fn debug_extract_icon_png(source_path: &Path, output_path: &Path) -> Result<(), String> {
    extract_icon_png(source_path, output_path)
}

#[cfg(target_os = "windows")]
fn extract_shell_icon_png(source_path: &Path, output_path: &Path) -> Result<(), String> {
    let _com_guard = ComGuard::new();
    let source = HSTRING::from(source_path.to_string_lossy().as_ref());
    let factory: IShellItemImageFactory = unsafe {
        SHCreateItemFromParsingName(&source, None::<&IBindCtx>)
            .map_err(|error| format!("Failed to create shell item image factory: {error}"))?
    };
    let primary = read_shell_icon_bitmap(&factory, 256)?;
    let primary_has_halo = has_suspicious_edge_halo(&primary);
    let selected = if primary_has_halo {
        match read_shell_icon_bitmap(&factory, 48) {
            Ok(fallback) if !has_suspicious_edge_halo(&fallback) => fallback,
            _ => primary,
        }
    } else {
        primary
    };

    write_rgba_png(
        output_path,
        selected.width,
        selected.height,
        &selected.pixels,
    )
}

#[cfg(target_os = "windows")]
struct ShellIconBitmap {
    width: u32,
    height: u32,
    pixels: Vec<u8>,
}

#[cfg(target_os = "windows")]
fn read_shell_icon_bitmap(
    factory: &IShellItemImageFactory,
    size: i32,
) -> Result<ShellIconBitmap, String> {
    let bitmap = unsafe {
        factory
            .GetImage(
                SIZE { cx: size, cy: size },
                SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK | SIIGBF_SCALEUP,
            )
            .map_err(|error| format!("Failed to get shell item icon: {error}"))?
    };
    let result = read_hbitmap_rgba(bitmap);
    unsafe {
        let _ = DeleteObject(bitmap.into());
    }
    result
}

#[cfg(target_os = "windows")]
fn has_suspicious_edge_halo(image: &ShellIconBitmap) -> bool {
    let width = image.width as usize;
    let height = image.height as usize;
    if width < 8 || height < 8 {
        return false;
    }

    let ring = width.min(height).min(4);
    let mut edge_pixels = 0usize;
    let mut edge_nonzero = 0usize;
    let mut edge_alpha_sum = 0usize;

    for y in 0..height {
        for x in 0..width {
            if x >= ring && y >= ring && x < width - ring && y < height - ring {
                continue;
            }
            edge_pixels += 1;
            let alpha = image.pixels[(y * width + x) * 4 + 3] as usize;
            if alpha > 0 {
                edge_nonzero += 1;
                edge_alpha_sum += alpha;
            }
        }
    }

    if edge_nonzero == 0 || edge_pixels == 0 {
        return false;
    }
    let edge_nonzero_ratio = edge_nonzero as f64 / edge_pixels as f64;
    let average_alpha = edge_alpha_sum as f64 / edge_nonzero as f64;
    edge_nonzero_ratio > 0.35 && average_alpha < 96.0
}

#[cfg(target_os = "windows")]
struct IconSource {
    path: PathBuf,
    icon_index: Option<i32>,
}

#[cfg(target_os = "windows")]
#[derive(Clone)]
enum ResourceName {
    Id(u16),
    Name(Vec<u16>),
}

#[cfg(target_os = "windows")]
impl ResourceName {
    fn pcwstr(&self) -> PCWSTR {
        match self {
            ResourceName::Id(id) => make_int_resource(*id),
            ResourceName::Name(name) => PCWSTR(name.as_ptr()),
        }
    }
}

#[cfg(target_os = "windows")]
struct IconCandidate {
    width: u32,
    height: u32,
    bit_count: u16,
    data: Vec<u8>,
    is_png: bool,
}

#[cfg(target_os = "windows")]
struct LibraryGuard(HMODULE);

#[cfg(target_os = "windows")]
impl Drop for LibraryGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = FreeLibrary(self.0);
        }
    }
}

#[cfg(target_os = "windows")]
fn extract_resource_icon_png(
    source_path: &Path,
    output_path: &Path,
    icon_index: Option<i32>,
) -> Result<(), String> {
    match extension(source_path).as_deref() {
        Some("exe") | Some("dll") => {
            extract_pe_resource_icon_png(source_path, output_path, icon_index)
        }
        Some("ico") => extract_ico_png(source_path, output_path),
        _ => Err("Path is not a supported icon resource file".to_string()),
    }
}

#[cfg(target_os = "windows")]
fn icon_choice_sources(path: &Path) -> Vec<IconSource> {
    if extension(path).as_deref() == Some("lnk") {
        let mut sources = resolve_shortcut_icon_sources(path);
        if sources.is_empty() {
            sources.push(IconSource {
                path: path.to_path_buf(),
                icon_index: None,
            });
        }
        return sources;
    }

    vec![IconSource {
        path: path.to_path_buf(),
        icon_index: None,
    }]
}

#[cfg(target_os = "windows")]
fn icon_choice_indexes(source_path: &Path, preferred_index: Option<i32>) -> Vec<Option<i32>> {
    match extension(source_path).as_deref() {
        Some("exe") | Some("dll") => enum_pe_icon_indexes(source_path, preferred_index),
        Some("ico") => vec![None],
        _ => Vec::new(),
    }
}

#[cfg(target_os = "windows")]
fn enum_pe_icon_indexes(source_path: &Path, preferred_index: Option<i32>) -> Vec<Option<i32>> {
    let source = HSTRING::from(source_path.to_string_lossy().as_ref());
    let module = unsafe {
        LoadLibraryExW(
            &source,
            None,
            LOAD_LIBRARY_AS_DATAFILE | LOAD_LIBRARY_AS_IMAGE_RESOURCE,
        )
    };
    let Ok(module) = module else {
        return preferred_index.into_iter().map(Some).collect();
    };
    let _guard = LibraryGuard(module);
    let names = match enum_group_icon_names(module) {
        Ok(names) => names,
        Err(_) => return preferred_index.into_iter().map(Some).collect(),
    };
    if names.is_empty() {
        return preferred_index.into_iter().map(Some).collect();
    }

    let mut indexes = Vec::new();
    if let Some(preferred_index) = preferred_index {
        indexes.push(Some(preferred_index));
    }
    indexes.extend((0..names.len()).map(|index| Some(index as i32)));
    indexes.dedup();
    indexes
}

#[cfg(target_os = "windows")]
fn icon_index_key(icon_index: Option<i32>) -> String {
    match icon_index {
        Some(index) if index < 0 => format!("id{}", index.unsigned_abs()),
        Some(index) => index.to_string(),
        None => "default".to_string(),
    }
}

#[cfg(target_os = "windows")]
fn resolve_shortcut_icon_sources(path: &Path) -> Vec<IconSource> {
    let _com_guard = ComGuard::new();
    let mut sources = Vec::new();
    let shell_link =
        unsafe { CoCreateInstance::<_, IShellLinkW>(&ShellLink, None, CLSCTX_INPROC_SERVER) };
    let Ok(shell_link) = shell_link else {
        return sources;
    };
    let Ok(persist_file) = shell_link.cast::<IPersistFile>() else {
        return sources;
    };
    let shortcut = HSTRING::from(path.to_string_lossy().as_ref());
    if unsafe { persist_file.Load(&shortcut, STGM_READ) }.is_err() {
        return sources;
    }

    let mut icon_path = [0u16; 1024];
    let mut icon_index = 0;
    if unsafe { shell_link.GetIconLocation(&mut icon_path, &mut icon_index) }.is_ok() {
        if let Some(path) = path_from_wide_buffer(&icon_path) {
            sources.push(IconSource {
                path,
                icon_index: Some(icon_index),
            });
        }
    }

    let mut target_path = [0u16; 1024];
    if unsafe {
        shell_link.GetPath(
            &mut target_path,
            std::ptr::null_mut(),
            SLGP_UNCPRIORITY.0 as u32,
        )
    }
    .is_ok()
    {
        if let Some(path) = path_from_wide_buffer(&target_path) {
            if !sources.iter().any(|source| source.path == path) {
                sources.push(IconSource {
                    path,
                    icon_index: None,
                });
            }
        }
    }

    sources
}

#[cfg(target_os = "windows")]
fn path_from_wide_buffer(buffer: &[u16]) -> Option<PathBuf> {
    let length = buffer
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(buffer.len());
    if length == 0 {
        return None;
    }
    let value = String::from_utf16_lossy(&buffer[..length]);
    let value = expand_percent_env_vars(value.trim_matches('"').trim());
    if value.is_empty() {
        return None;
    }
    let path = PathBuf::from(value);
    path.exists().then_some(path)
}

#[cfg(target_os = "windows")]
fn expand_percent_env_vars(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let chars: Vec<char> = value.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        if chars[index] != '%' {
            output.push(chars[index]);
            index += 1;
            continue;
        }
        let Some(end) = chars[index + 1..]
            .iter()
            .position(|character| *character == '%')
        else {
            output.push(chars[index]);
            index += 1;
            continue;
        };
        let end = index + 1 + end;
        let key: String = chars[index + 1..end].iter().collect();
        if let Ok(value) = env::var(&key) {
            output.push_str(&value);
        } else {
            output.extend(chars[index..=end].iter());
        }
        index = end + 1;
    }
    output
}

#[cfg(target_os = "windows")]
fn extract_pe_resource_icon_png(
    source_path: &Path,
    output_path: &Path,
    icon_index: Option<i32>,
) -> Result<(), String> {
    let source = HSTRING::from(source_path.to_string_lossy().as_ref());
    let module = unsafe {
        LoadLibraryExW(
            &source,
            None,
            LOAD_LIBRARY_AS_DATAFILE | LOAD_LIBRARY_AS_IMAGE_RESOURCE,
        )
    }
    .map_err(|error| {
        format!(
            "Failed to load icon resource file {}: {error}",
            source_path.display()
        )
    })?;
    let _guard = LibraryGuard(module);
    let group_name = select_group_icon_name(enum_group_icon_names(module)?, icon_index)?;
    let group_data = read_resource(module, group_name.pcwstr(), RT_GROUP_ICON)?;
    let mut candidates = Vec::new();

    for entry in parse_group_icon_entries(&group_data)? {
        if let Ok(data) = read_resource(module, make_int_resource(entry.resource_id), RT_ICON) {
            candidates.push(IconCandidate {
                width: entry.width,
                height: entry.height,
                bit_count: entry.bit_count,
                is_png: is_png(&data),
                data,
            });
        }
    }

    write_best_icon_candidate(candidates, output_path)
}

#[cfg(target_os = "windows")]
fn extract_ico_png(source_path: &Path, output_path: &Path) -> Result<(), String> {
    let bytes = fs::read(source_path).map_err(|error| {
        format!(
            "Failed to read icon file {}: {error}",
            source_path.display()
        )
    })?;
    if bytes.len() < 6 || read_u16(&bytes, 2)? != 1 {
        return Err("File is not an ICO image".to_string());
    }
    let count = read_u16(&bytes, 4)? as usize;
    let mut candidates = Vec::new();
    for index in 0..count {
        let offset = 6 + index * 16;
        if bytes.len() < offset + 16 {
            continue;
        }
        let width = icon_size_byte(bytes[offset]);
        let height = icon_size_byte(bytes[offset + 1]);
        let bit_count = read_u16_at(&bytes, offset + 6)?;
        let bytes_in_res = read_u32_at(&bytes, offset + 8)? as usize;
        let image_offset = read_u32_at(&bytes, offset + 12)? as usize;
        if image_offset
            .checked_add(bytes_in_res)
            .is_some_and(|end| end <= bytes.len())
        {
            let data = bytes[image_offset..image_offset + bytes_in_res].to_vec();
            candidates.push(IconCandidate {
                width,
                height,
                bit_count,
                is_png: is_png(&data),
                data,
            });
        }
    }

    write_best_icon_candidate(candidates, output_path)
}

#[cfg(target_os = "windows")]
struct GroupIconEntry {
    width: u32,
    height: u32,
    bit_count: u16,
    resource_id: u16,
}

#[cfg(target_os = "windows")]
fn parse_group_icon_entries(data: &[u8]) -> Result<Vec<GroupIconEntry>, String> {
    if data.len() < 6 || read_u16(data, 2)? != 1 {
        return Err("Invalid icon group resource".to_string());
    }
    let count = read_u16(data, 4)? as usize;
    let mut entries = Vec::new();
    for index in 0..count {
        let offset = 6 + index * 14;
        if data.len() < offset + 14 {
            continue;
        }
        entries.push(GroupIconEntry {
            width: icon_size_byte(data[offset]),
            height: icon_size_byte(data[offset + 1]),
            bit_count: read_u16_at(data, offset + 6)?,
            resource_id: read_u16_at(data, offset + 12)?,
        });
    }
    Ok(entries)
}

#[cfg(target_os = "windows")]
fn select_group_icon_name(
    names: Vec<ResourceName>,
    icon_index: Option<i32>,
) -> Result<ResourceName, String> {
    if names.is_empty() {
        return Err("No icon group resources found".to_string());
    }
    if let Some(icon_index) = icon_index {
        if icon_index >= 0 {
            if let Some(name) = names.get(icon_index as usize).cloned() {
                return Ok(name);
            }
        } else {
            let resource_id = icon_index.unsigned_abs() as u16;
            if let Some(name) = names
                .iter()
                .find(|name| matches!(name, ResourceName::Id(id) if *id == resource_id))
                .cloned()
            {
                return Ok(name);
            }
        }
    }
    if let Some(name) = names
        .iter()
        .find(|name| matches!(name, ResourceName::Id(1)))
        .cloned()
    {
        return Ok(name);
    }
    Ok(names[0].clone())
}

#[cfg(target_os = "windows")]
fn write_best_icon_candidate(
    mut candidates: Vec<IconCandidate>,
    output_path: &Path,
) -> Result<(), String> {
    if candidates.is_empty() {
        return Err("No icon candidates found".to_string());
    }

    candidates.sort_by_key(|candidate| {
        let area = candidate.width.saturating_mul(candidate.height);
        let kind_score = if candidate.is_png { 2 } else { 1 };
        (kind_score, area, candidate.bit_count)
    });

    let selected = candidates
        .iter()
        .filter(|candidate| candidate.is_png)
        .max_by_key(|candidate| {
            (
                candidate.width.saturating_mul(candidate.height),
                candidate.bit_count,
            )
        })
        .or_else(|| {
            candidates
                .iter()
                .filter(|candidate| candidate.width <= 48 && candidate.height <= 48)
                .max_by_key(|candidate| {
                    (
                        candidate.width.saturating_mul(candidate.height),
                        candidate.bit_count,
                    )
                })
        })
        .or_else(|| {
            candidates.iter().min_by_key(|candidate| {
                (
                    candidate.width.saturating_mul(candidate.height),
                    candidate.bit_count,
                )
            })
        })
        .ok_or_else(|| "No icon candidates found".to_string())?;

    if selected.is_png {
        write_bytes(output_path, &selected.data)
    } else {
        write_dib_icon_as_png(&selected.data, selected.width, selected.height, output_path)
    }
}

#[cfg(target_os = "windows")]
fn enum_group_icon_names(module: HMODULE) -> Result<Vec<ResourceName>, String> {
    let mut names = Vec::<ResourceName>::new();
    let result = unsafe {
        EnumResourceNamesW(
            Some(module),
            RT_GROUP_ICON,
            Some(enum_resource_name_proc),
            (&mut names as *mut Vec<ResourceName>) as isize,
        )
    };
    if result.as_bool() {
        Ok(names)
    } else {
        Err("Failed to enumerate icon group resources".to_string())
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn enum_resource_name_proc(
    _module: HMODULE,
    _resource_type: PCWSTR,
    name: PCWSTR,
    lparam: isize,
) -> BOOL {
    let names = unsafe { &mut *(lparam as *mut Vec<ResourceName>) };
    if is_int_resource(name) {
        names.push(ResourceName::Id(name.0 as usize as u16));
    } else {
        names.push(ResourceName::Name(read_null_terminated_wide(name)));
    }
    BOOL(1)
}

#[cfg(target_os = "windows")]
fn read_resource(module: HMODULE, name: PCWSTR, resource_type: PCWSTR) -> Result<Vec<u8>, String> {
    let resource = unsafe { FindResourceW(Some(module), name, resource_type) };
    if resource.is_invalid() {
        return Err("Failed to find icon resource".to_string());
    }
    let size = unsafe { SizeofResource(Some(module), resource) };
    if size == 0 {
        return Err("Icon resource is empty".to_string());
    }
    let handle = unsafe { LoadResource(Some(module), resource) }
        .map_err(|error| format!("Failed to load icon resource: {error}"))?;
    let pointer = unsafe { LockResource(handle) };
    if pointer.is_null() {
        return Err("Failed to lock icon resource".to_string());
    }
    let bytes = unsafe { slice::from_raw_parts(pointer as *const u8, size as usize) };
    Ok(bytes.to_vec())
}

#[cfg(target_os = "windows")]
fn write_dib_icon_as_png(
    data: &[u8],
    directory_width: u32,
    directory_height: u32,
    output_path: &Path,
) -> Result<(), String> {
    let header_size = read_u32(data, 0)? as usize;
    if header_size < 40 || data.len() < header_size {
        return Err("Unsupported icon bitmap header".to_string());
    }

    let dib_width = read_i32(data, 4)?.unsigned_abs();
    let raw_height = read_i32(data, 8)?.unsigned_abs();
    let bit_count = read_u16(data, 14)?;
    let colors_used = read_u32(data, 32).unwrap_or(0);
    let width = if directory_width > 0 {
        directory_width
    } else {
        dib_width
    };
    let height = if directory_height > 0 {
        directory_height
    } else if raw_height > 1 {
        raw_height / 2
    } else {
        raw_height
    };
    if width == 0 || height == 0 {
        return Err("Icon bitmap has invalid dimensions".to_string());
    }

    let palette_entries = if bit_count <= 8 {
        if colors_used > 0 {
            colors_used as usize
        } else {
            1usize << bit_count
        }
    } else {
        0
    };
    let xor_offset = header_size + palette_entries * 4;
    let xor_stride = dib_xor_stride(width, bit_count)?;
    let mask_offset = xor_offset + xor_stride * height as usize;
    let mask_stride = (((width + 31) / 32) * 4) as usize;
    if data.len() < xor_offset + xor_stride * height as usize {
        return Err("Icon bitmap XOR data is truncated".to_string());
    }

    let bottom_up = read_i32(data, 8)? > 0;
    let has_alpha = bit_count == 32
        && (0..height as usize).any(|row| {
            let row_offset = xor_offset + row * xor_stride;
            (0..width as usize).any(|column| data[row_offset + column * 4 + 3] != 0)
        });
    let mut rgba = vec![0u8; (width as usize) * (height as usize) * 4];

    for y in 0..height as usize {
        let source_y = if bottom_up {
            height as usize - 1 - y
        } else {
            y
        };
        let xor_row = xor_offset + source_y * xor_stride;
        let mask_row = mask_offset + source_y * mask_stride;
        for x in 0..width as usize {
            let transparent = read_mask_bit(data, mask_row, x);
            let target = (y * width as usize + x) * 4;
            let (r, g, b, mut a) = read_dib_pixel(
                data,
                xor_row,
                x,
                bit_count,
                header_size,
                palette_entries,
                has_alpha,
                transparent,
            )?;
            if transparent && (!has_alpha || a == 0) {
                a = 0;
            }
            rgba[target] = if a == 0 { 0 } else { r };
            rgba[target + 1] = if a == 0 { 0 } else { g };
            rgba[target + 2] = if a == 0 { 0 } else { b };
            rgba[target + 3] = a;
        }
    }

    write_rgba_png(output_path, width, height, &rgba)
}

#[cfg(target_os = "windows")]
fn read_dib_pixel(
    data: &[u8],
    row_offset: usize,
    x: usize,
    bit_count: u16,
    header_size: usize,
    palette_entries: usize,
    has_alpha: bool,
    transparent: bool,
) -> Result<(u8, u8, u8, u8), String> {
    match bit_count {
        32 => {
            let offset = row_offset + x * 4;
            let b = data[offset];
            let g = data[offset + 1];
            let r = data[offset + 2];
            let a = if has_alpha {
                data[offset + 3]
            } else if transparent {
                0
            } else {
                255
            };
            Ok((r, g, b, a))
        }
        24 => {
            let offset = row_offset + x * 3;
            Ok((
                data[offset + 2],
                data[offset + 1],
                data[offset],
                if transparent { 0 } else { 255 },
            ))
        }
        8 => {
            let index = data[row_offset + x] as usize;
            read_palette_color(data, header_size, palette_entries, index, transparent)
        }
        4 => {
            let value = data[row_offset + x / 2];
            let index = if x % 2 == 0 { value >> 4 } else { value & 0x0f } as usize;
            read_palette_color(data, header_size, palette_entries, index, transparent)
        }
        1 => {
            let value = data[row_offset + x / 8];
            let index = ((value >> (7 - (x % 8))) & 1) as usize;
            read_palette_color(data, header_size, palette_entries, index, transparent)
        }
        _ => Err(format!("Unsupported icon bitmap bit depth: {bit_count}")),
    }
}

#[cfg(target_os = "windows")]
fn read_palette_color(
    data: &[u8],
    header_size: usize,
    palette_entries: usize,
    index: usize,
    transparent: bool,
) -> Result<(u8, u8, u8, u8), String> {
    if index >= palette_entries {
        return Err("Icon bitmap palette index is out of bounds".to_string());
    }
    let offset = header_size + index * 4;
    if data.len() < offset + 4 {
        return Err("Icon bitmap palette is truncated".to_string());
    }
    Ok((
        data[offset + 2],
        data[offset + 1],
        data[offset],
        if transparent { 0 } else { 255 },
    ))
}

#[cfg(target_os = "windows")]
fn read_mask_bit(data: &[u8], row_offset: usize, x: usize) -> bool {
    let offset = row_offset + x / 8;
    if offset >= data.len() {
        return false;
    }
    (data[offset] & (0x80 >> (x % 8))) != 0
}

#[cfg(target_os = "windows")]
fn dib_xor_stride(width: u32, bit_count: u16) -> Result<usize, String> {
    let bits = width
        .checked_mul(bit_count as u32)
        .ok_or_else(|| "Icon bitmap row is too wide".to_string())?;
    Ok((((bits + 31) / 32) * 4) as usize)
}

#[cfg(target_os = "windows")]
fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create icon output directory {}: {error}",
                parent.display()
            )
        })?;
    }
    fs::write(path, bytes)
        .map_err(|error| format!("Failed to write icon file {}: {error}", path.display()))
}

#[cfg(target_os = "windows")]
fn write_rgba_png(path: &Path, width: u32, height: u32, rgba: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create icon output directory {}: {error}",
                parent.display()
            )
        })?;
    }
    let file = File::create(path)
        .map_err(|error| format!("Failed to create icon file {}: {error}", path.display()))?;
    let writer = BufWriter::new(file);
    let mut encoder = Encoder::new(writer, width, height);
    encoder.set_color(ColorType::Rgba);
    encoder.set_depth(BitDepth::Eight);
    let mut png_writer = encoder
        .write_header()
        .map_err(|error| format!("Failed to write PNG header: {error}"))?;
    png_writer
        .write_image_data(rgba)
        .map_err(|error| format!("Failed to write PNG data: {error}"))
}

#[cfg(target_os = "windows")]
fn make_int_resource(id: u16) -> PCWSTR {
    PCWSTR(id as usize as *const u16)
}

#[cfg(target_os = "windows")]
fn is_int_resource(value: PCWSTR) -> bool {
    (value.0 as usize >> 16) == 0
}

#[cfg(target_os = "windows")]
fn read_null_terminated_wide(value: PCWSTR) -> Vec<u16> {
    let mut length = 0usize;
    unsafe {
        while *value.0.add(length) != 0 {
            length += 1;
        }
        let mut output = slice::from_raw_parts(value.0, length).to_vec();
        output.push(0);
        output
    }
}

#[cfg(target_os = "windows")]
fn icon_size_byte(value: u8) -> u32 {
    if value == 0 {
        256
    } else {
        value as u32
    }
}

#[cfg(target_os = "windows")]
fn is_png(data: &[u8]) -> bool {
    data.starts_with(b"\x89PNG\r\n\x1a\n")
}

#[cfg(target_os = "windows")]
fn read_u16(data: &[u8], offset: usize) -> Result<u16, String> {
    read_u16_at(data, offset)
}

#[cfg(target_os = "windows")]
fn read_u16_at(data: &[u8], offset: usize) -> Result<u16, String> {
    let bytes = data
        .get(offset..offset + 2)
        .ok_or_else(|| "Unexpected end of icon data".to_string())?;
    Ok(u16::from_le_bytes([bytes[0], bytes[1]]))
}

#[cfg(target_os = "windows")]
fn read_u32(data: &[u8], offset: usize) -> Result<u32, String> {
    read_u32_at(data, offset)
}

#[cfg(target_os = "windows")]
fn read_u32_at(data: &[u8], offset: usize) -> Result<u32, String> {
    let bytes = data
        .get(offset..offset + 4)
        .ok_or_else(|| "Unexpected end of icon data".to_string())?;
    Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

#[cfg(target_os = "windows")]
fn read_i32(data: &[u8], offset: usize) -> Result<i32, String> {
    let bytes = data
        .get(offset..offset + 4)
        .ok_or_else(|| "Unexpected end of icon data".to_string())?;
    Ok(i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

#[cfg(target_os = "windows")]
struct ComGuard {
    initialized: bool,
}

#[cfg(target_os = "windows")]
impl ComGuard {
    fn new() -> Self {
        let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok() };
        Self { initialized }
    }
}

#[cfg(target_os = "windows")]
impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.initialized {
            unsafe {
                CoUninitialize();
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn read_hbitmap_rgba(
    bitmap: windows::Win32::Graphics::Gdi::HBITMAP,
) -> Result<ShellIconBitmap, String> {
    let mut bitmap_info = BITMAP::default();
    let object_size = std::mem::size_of::<BITMAP>() as i32;
    let object_result = unsafe {
        GetObjectW(
            bitmap.into(),
            object_size,
            Some((&mut bitmap_info as *mut BITMAP).cast()),
        )
    };
    if object_result == 0 {
        return Err("Failed to read bitmap metadata".to_string());
    }

    let width = bitmap_info.bmWidth;
    let height = bitmap_info.bmHeight.abs();
    if width <= 0 || height <= 0 {
        return Err("Bitmap has invalid dimensions".to_string());
    }

    let mut dib_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..BITMAPINFOHEADER::default()
        },
        ..BITMAPINFO::default()
    };
    let mut bgra = vec![0u8; (width as usize) * (height as usize) * 4];
    let hdc = unsafe { CreateCompatibleDC(None) };
    if hdc.is_invalid() {
        return Err("Failed to create bitmap read context".to_string());
    }
    let read_lines = unsafe {
        GetDIBits(
            hdc,
            bitmap,
            0,
            height as u32,
            Some(bgra.as_mut_ptr().cast()),
            &mut dib_info,
            DIB_RGB_COLORS,
        )
    };
    unsafe {
        let _ = DeleteDC(hdc);
    }
    if read_lines == 0 {
        return Err("Failed to read bitmap pixels".to_string());
    }

    for pixel in bgra.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }

    Ok(ShellIconBitmap {
        width: width as u32,
        height: height as u32,
        pixels: bgra,
    })
}
