use super::*;

struct TestDir(PathBuf);
impl TestDir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "lumeria-icons-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}
impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn dib(width: u32, height: u32, alpha: u8) -> Vec<u8> {
    let mut bytes = vec![0; 40 + (width * height * 4 + width.div_ceil(32) * 4 * height) as usize];
    bytes[0..4].copy_from_slice(&40u32.to_le_bytes());
    bytes[4..8].copy_from_slice(&width.to_le_bytes());
    bytes[8..12].copy_from_slice(&(height * 2).to_le_bytes());
    bytes[12..14].copy_from_slice(&1u16.to_le_bytes());
    bytes[14..16].copy_from_slice(&32u16.to_le_bytes());
    for y in 0..height {
        for x in 0..width {
            let offset = 40 + ((y * width + x) * 4) as usize;
            bytes[offset..offset + 4].copy_from_slice(&[x as u8, y as u8, 120, alpha]);
        }
    }
    bytes
}

fn candidate(data: Vec<u8>, directory_size: u32) -> IconCandidate {
    IconCandidate {
        width: directory_size,
        height: directory_size,
        bit_count: 32,
        is_png: is_png(&data),
        data,
    }
}

fn png_bytes(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut encoder = Encoder::new(&mut bytes, width, height);
    encoder.set_color(ColorType::Rgba);
    encoder.set_depth(BitDepth::Eight);
    let mut writer = encoder.write_header().unwrap();
    writer
        .write_image_data(&vec![255; (width * height * 4) as usize])
        .unwrap();
    writer.finish().unwrap();
    bytes
}

fn read_png(path: &Path) -> ShellIconBitmap {
    let mut reader = png::Decoder::new(std::io::Cursor::new(fs::read(path).unwrap()))
        .read_info()
        .unwrap();
    let mut pixels = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut pixels).unwrap();
    pixels.truncate(info.buffer_size());
    ShellIconBitmap {
        width: info.width,
        height: info.height,
        pixels,
    }
}

fn write_ico(path: &Path, size: u32) {
    let data = dib(size, size, 255);
    let dimension = if size >= 256 { 0 } else { size as u8 };
    let mut bytes = vec![0, 0, 1, 0, 1, 0, dimension, dimension, 0, 0, 1, 0, 32, 0];
    bytes.extend_from_slice(&(data.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&22u32.to_le_bytes());
    bytes.extend_from_slice(&data);
    fs::write(path, bytes).unwrap();
}

#[test]
fn default_group_uses_first_entry_but_explicit_indexes_and_ids_are_respected() {
    let names = || {
        vec![
            ResourceName::Name("APPICON\0".encode_utf16().collect()),
            ResourceName::Id(1),
        ]
    };
    assert!(matches!(
        select_group_icon_name(names(), None).unwrap(),
        ResourceName::Name(_)
    ));
    assert!(matches!(
        select_group_icon_name(names(), Some(0)).unwrap(),
        ResourceName::Name(_)
    ));
    assert!(matches!(
        select_group_icon_name(names(), Some(1)).unwrap(),
        ResourceName::Id(1)
    ));
    assert!(matches!(
        select_group_icon_name(names(), Some(-1)).unwrap(),
        ResourceName::Id(1)
    ));
    assert!(select_group_icon_name(names(), Some(9)).is_err());
    assert!(select_group_icon_name(names(), Some(-65537)).is_err());
}

#[test]
fn actual_dib_dimensions_control_stride_and_selection_even_past_256() {
    let dir = TestDir::new();
    let output = dir.0.join("icon.png");
    write_best_icon_candidate(
        vec![
            candidate(dib(48, 48, 255), 48),
            candidate(dib(512, 512, 255), 256),
        ],
        &output,
    )
    .unwrap();
    let image = read_png(&output);
    assert_eq!((image.width, image.height), (512, 512));
    let offset = (17 * 512 + 301) * 4;
    assert_eq!(
        &image.pixels[offset..offset + 4],
        &[120, (511 - 17) as u8, 301u32 as u8, 255]
    );
}

#[test]
fn real_resolution_wins_over_encoding_and_directory_hints() {
    let dir = TestDir::new();
    let output = dir.0.join("icon.png");
    write_best_icon_candidate(
        vec![
            candidate(png_bytes(32, 32), 256),
            candidate(dib(256, 256, 255), 256),
        ],
        &output,
    )
    .unwrap();
    assert_eq!(read_png(&output).width, 256);
    let large_png = png_bytes(512, 384);
    write_best_icon_candidate(
        vec![
            candidate(large_png.clone(), 13),
            candidate(dib(256, 256, 255), 256),
        ],
        &output,
    )
    .unwrap();
    assert_eq!(fs::read(&output).unwrap(), large_png);
}

#[test]
fn expanded_low_color_png_does_not_replace_full_color_artwork() {
    let dir = TestDir::new();
    let output = dir.0.join("icon.png");
    let mut low_color = candidate(png_bytes(256, 256), 256);
    low_color.bit_count = 4;
    let mut bytes = Vec::new();
    let mut encoder = Encoder::new(&mut bytes, 256, 256);
    encoder.set_color(ColorType::Rgba);
    encoder.set_depth(BitDepth::Eight);
    let mut writer = encoder.write_header().unwrap();
    writer.write_image_data(&vec![100; 256 * 256 * 4]).unwrap();
    writer.finish().unwrap();
    write_best_icon_candidate(vec![low_color, candidate(bytes.clone(), 256)], &output).unwrap();
    assert_eq!(fs::read(output).unwrap(), bytes);
}

#[test]
fn legacy_frames_keep_their_real_size_including_64px() {
    let dir = TestDir::new();
    for size in [32, 48, 64] {
        let output = dir.0.join(format!("{size}.png"));
        write_best_icon_candidate(
            vec![
                candidate(dib(16, 16, 255), 16),
                candidate(dib(size, size, 255), size),
            ],
            &output,
        )
        .unwrap();
        assert_eq!(read_png(&output).width, size);
    }
}

#[test]
fn damaged_high_resolution_frames_fall_back_to_a_valid_frame() {
    let dir = TestDir::new();
    let output = dir.0.join("icon.png");
    let mut bad_dib = dib(256, 256, 255);
    bad_dib.truncate(100);
    let mut bad_png = png_bytes(512, 512);
    bad_png.truncate(50);
    write_best_icon_candidate(
        vec![
            candidate(bad_dib, 256),
            candidate(bad_png, 256),
            candidate(dib(48, 48, 255), 48),
        ],
        &output,
    )
    .unwrap();
    assert_eq!(read_png(&output).width, 48);
}

#[test]
fn dib_masks_alpha_top_down_and_invalid_headers_are_handled() {
    let mut bytes = dib(2, 2, 0);
    bytes[40 + 16] = 0x80; // bottom-left pixel is masked out
    let image = decode_dib_icon(&bytes).unwrap();
    assert_eq!(image.pixels[11], 0);
    assert_eq!(image.pixels[3], 255);
    bytes[8..12].copy_from_slice(&(-4i32).to_le_bytes());
    assert_eq!(decode_dib_icon(&bytes).unwrap().pixels[3], 0);
    // Alpha-bearing 32-bit frames may omit the legacy mask; preserve semitransparency.
    let mut alpha = dib(2, 2, 100);
    alpha.truncate(40 + 16);
    assert_eq!(decode_dib_icon(&alpha).unwrap().pixels[3], 100);
    bytes.truncate(40 + 16);
    assert!(decode_dib_icon(&bytes).is_err());
    let mut invalid = dib(2, 2, 255);
    invalid[16..20].copy_from_slice(&3u32.to_le_bytes());
    assert!(decode_dib_icon(&invalid).is_err());
    invalid[16..20].fill(0);
    invalid[4..8].copy_from_slice(&i32::MAX.to_le_bytes());
    assert!(decode_dib_icon(&invalid).is_err());
}

fn shortcut(path: &Path, target: &Path, icon: &Path, index: i32) {
    use windows::Win32::{
        System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER},
        UI::Shell::{IShellLinkW, ShellLink},
    };
    let _com = ComGuard::new().unwrap();
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
        link.SetPath(&HSTRING::from(windows_api_path(target)))
            .unwrap();
        link.SetIconLocation(&HSTRING::from(windows_api_path(icon)), index)
            .unwrap();
        let persist: IPersistFile = link.cast().unwrap();
        persist
            .Save(&HSTRING::from(windows_api_path(path)), true)
            .unwrap();
    }
}

#[test]
fn default_and_choice_caches_follow_shortcut_resource_changes_without_overwriting_old_choices() {
    let dir = TestDir::new();
    let source = dir.0.join("app.ico");
    let link = dir.0.join("app.lnk");
    write_ico(&source, 32);
    shortcut(&link, &source, &source, 0);
    let default = cache_app_icon_for_identity(&link, &dir.0, "app", "source:user").unwrap();
    let choices = cache_app_icon_choices(&link, &dir.0, "app").unwrap();
    let previous_choice = fs::read(&choices[0]).unwrap();
    assert_eq!(
        cache_app_icon_for_identity(&link, &dir.0, "app", "source:user").unwrap(),
        default
    );
    assert_eq!(
        cache_app_icon_choices(&link, &dir.0, "app").unwrap(),
        choices
    );
    fs::write(&choices[0], "corrupt cached candidate").unwrap();
    assert_eq!(
        cache_app_icon_choices(&link, &dir.0, "app").unwrap(),
        choices
    );
    assert_eq!(
        fs::read(&choices[0]).unwrap(),
        previous_choice,
        "candidate manifest detects and repairs modified PNG data"
    );
    fs::remove_file(&choices[0]).unwrap();
    assert_eq!(
        cache_app_icon_choices(&link, &dir.0, "app").unwrap(),
        choices
    );
    assert_eq!(
        fs::read(&choices[0]).unwrap(),
        previous_choice,
        "missing candidate files are rebuilt without changing their content identity"
    );
    let changed_identity =
        cache_app_icon_for_identity(&link, &dir.0, "app", "source:custom").unwrap();
    assert_eq!(
        changed_identity, default,
        "different sources with identical PNG content share a snapshot"
    );
    write_ico(&source, 256); // .lnk itself is unchanged
    let updated = cache_app_icon_for_identity(&link, &dir.0, "app", "source:user").unwrap();
    let updated_choices = cache_app_icon_choices(&link, &dir.0, "app").unwrap();
    assert_ne!(updated, default);
    assert_ne!(updated_choices, choices);
    assert_eq!(read_png(Path::new(&updated)).width, 256);
    assert_eq!(read_png(&updated_choices[0]).width, 256);
    assert_eq!(fs::read(&choices[0]).unwrap(), previous_choice);
    // The resource's mtime and the explicit shortcut icon index both affect revision.
    let revision = icon_cache_revision(&link, "test").unwrap();
    let file = fs::OpenOptions::new().write(true).open(&source).unwrap();
    file.set_times(
        fs::FileTimes::new()
            .set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_000_000)),
    )
    .unwrap();
    assert_ne!(icon_cache_revision(&link, "test").unwrap(), revision);
    let revision = icon_cache_revision(&link, "test").unwrap();
    shortcut(&link, &source, &source, -1);
    assert_ne!(icon_cache_revision(&link, "test").unwrap(), revision);
}

#[test]
fn shell_halo_fallback_detection_remains_available_for_legacy_icons() {
    let mut pixels = vec![0; 256 * 256 * 4];
    for pixel in pixels.chunks_exact_mut(4) {
        pixel[3] = 32;
    }
    assert!(has_suspicious_edge_halo(&ShellIconBitmap {
        width: 256,
        height: 256,
        pixels
    }));
    assert!(!has_suspicious_edge_halo(&ShellIconBitmap {
        width: 48,
        height: 48,
        pixels: vec![255; 48 * 48 * 4]
    }));
}

#[test]
fn failed_output_does_not_leave_partial_cached_images_or_temporary_files() {
    let dir = TestDir::new();
    let destination = dir.0.join("directory.png");
    fs::create_dir(&destination).unwrap();
    assert!(write_rgba_png(&destination, 1, 1, &[0, 0, 0, 255]).is_err());
    assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 1);
}

#[test]
fn content_snapshots_recover_corruption_and_keep_old_package_artwork() {
    let dir = TestDir::new();
    let first = dir.0.join("package-v1.json");
    let second = dir.0.join("package-v2.json");
    let old = cache_extracted_icon(&dir.0, &first, |path| {
        write_rgba_png(path, 1, 1, &[255, 0, 0, 255])
    })
    .unwrap();
    let duplicate = cache_extracted_icon(&dir.0, &second, |path| {
        write_rgba_png(path, 1, 1, &[255, 0, 0, 255])
    })
    .unwrap();
    assert_eq!(old, duplicate);
    let previous = fs::read(&old).unwrap();
    fs::write(&old, "damaged").unwrap();
    assert_eq!(
        cache_extracted_icon(&dir.0, &first, |path| write_rgba_png(
            path,
            1,
            1,
            &[255, 0, 0, 255]
        ))
        .unwrap(),
        old
    );
    assert_eq!(fs::read(&old).unwrap(), previous);
    fs::remove_file(&second).unwrap();
    let new = cache_extracted_icon(&dir.0, &second, |path| {
        write_rgba_png(path, 1, 1, &[0, 255, 0, 255])
    })
    .unwrap();
    assert_ne!(new, old);
    assert_eq!(fs::read(&old).unwrap(), previous);
    assert!(fs::read_dir(&dir.0).unwrap().all(|entry| !entry
        .unwrap()
        .path()
        .extension()
        .is_some_and(|extension| extension == "tmp" || extension == "extract")));
}

#[test]
fn concurrent_extraction_has_independent_staging_and_complete_content() {
    let dir = TestDir::new();
    let reference = dir.0.join("concurrent.json");
    let barrier = std::sync::Barrier::new(2);
    std::thread::scope(|scope| {
        let extract = || {
            cache_extracted_icon(&dir.0, &reference, |path| {
                barrier.wait();
                write_rgba_png(path, 1, 1, &[1, 2, 3, 255])
            })
            .unwrap()
        };
        let first = scope.spawn(extract);
        let second = scope.spawn(extract);
        let first = first.join().unwrap();
        let second = second.join().unwrap();
        assert_eq!(first, second);
        assert_eq!(read_png(&first).pixels, [1, 2, 3, 255]);
    });
    assert!(fs::read_dir(&dir.0).unwrap().all(|entry| !entry
        .unwrap()
        .path()
        .extension()
        .is_some_and(|extension| extension == "tmp" || extension == "extract")));
}
