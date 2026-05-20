use png::{BitDepth, ColorType, Encoder};
use std::{
    env, fs,
    fs::File,
    io::BufWriter,
    path::{Path, PathBuf},
};
use windows::{
    core::HSTRING,
    Win32::{
        Foundation::SIZE,
        Graphics::Gdi::{
            CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
            BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
        },
        System::Com::{CoInitializeEx, CoUninitialize, IBindCtx, COINIT_APARTMENTTHREADED},
        UI::Shell::{
            IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF, SIIGBF_BIGGERSIZEOK,
            SIIGBF_ICONONLY, SIIGBF_SCALEUP,
        },
    },
};

const SIZES: [i32; 5] = [32, 48, 64, 128, 256];

struct FlagVariant {
    name: &'static str,
    flags: SIIGBF,
}

struct RgbaImage {
    width: i32,
    height: i32,
    pixels: Vec<u8>,
}

#[derive(Default)]
struct AlphaStats {
    total: usize,
    transparent: usize,
    dirty_transparent: usize,
    translucent: usize,
    translucent_rgb_le_alpha: usize,
    opaque: usize,
}

struct ComGuard {
    initialized: bool,
}

impl ComGuard {
    fn new() -> Self {
        let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok() };
        Self { initialized }
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.initialized {
            unsafe {
                CoUninitialize();
            }
        }
    }
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut args = env::args_os().skip(1);
    let source_path = match args.next() {
        Some(path) => PathBuf::from(path),
        None => {
            return Err(format!(
                "Usage: cargo run --bin icon_dump -- <path-to-lnk-or-exe> [output-dir]\n\
                 Example: cargo run --bin icon_dump -- \"{}\" .\\icon-dump",
                r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\App.lnk"
            ));
        }
    };
    let output_dir = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("icon-dump"));

    if !source_path.exists() {
        return Err(format!(
            "Source path does not exist: {}",
            source_path.display()
        ));
    }
    fs::create_dir_all(&output_dir).map_err(|error| {
        format!(
            "Failed to create output directory {}: {error}",
            output_dir.display()
        )
    })?;

    let _com_guard = ComGuard::new();
    let source = HSTRING::from(source_path.to_string_lossy().as_ref());
    let factory: IShellItemImageFactory = unsafe {
        SHCreateItemFromParsingName(&source, None::<&IBindCtx>)
            .map_err(|error| format!("Failed to create shell item image factory: {error}"))?
    };

    let variants = [
        FlagVariant {
            name: "current",
            flags: SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK | SIIGBF_SCALEUP,
        },
        FlagVariant {
            name: "icononly",
            flags: SIIGBF_ICONONLY,
        },
        FlagVariant {
            name: "icon_bigger",
            flags: SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK,
        },
        FlagVariant {
            name: "icon_scaleup",
            flags: SIIGBF_ICONONLY | SIIGBF_SCALEUP,
        },
    ];

    let stem = sanitize_filename(
        source_path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("icon"),
    );

    println!("source: {}", source_path.display());
    println!("output: {}", output_dir.display());

    let production_path = output_dir.join(format!("{stem}_production.png"));
    match launchpad_lib::debug_extract_icon_png(&source_path, &production_path) {
        Ok(()) => println!("production -> {}", production_path.display()),
        Err(error) => println!("production failed: {error}"),
    }

    for size in SIZES {
        for variant in &variants {
            let bitmap = unsafe {
                factory
                    .GetImage(SIZE { cx: size, cy: size }, variant.flags)
                    .map_err(|error| {
                        format!(
                            "Failed to get image for size {size} variant {}: {error}",
                            variant.name
                        )
                    })?
            };
            let image_result = read_hbitmap_rgba(bitmap);
            unsafe {
                let _ = DeleteObject(bitmap.into());
            }
            let image = image_result?;
            let output_path = output_dir.join(format!("{stem}_{size}px_{}.png", variant.name));
            write_png(&output_path, image.width, image.height, &image.pixels)?;
            let stats = analyze_alpha(&image.pixels);

            println!(
                "{:>3}px {:<12} actual {:>4}x{:<4} -> {} | {}",
                size,
                variant.name,
                image.width,
                image.height,
                output_path.display(),
                format_alpha_stats(&stats)
            );
        }
    }

    Ok(())
}

fn read_hbitmap_rgba(bitmap: HBITMAP) -> Result<RgbaImage, String> {
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
    let mut pixels = vec![0u8; (width as usize) * (height as usize) * 4];
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
            Some(pixels.as_mut_ptr().cast()),
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

    for pixel in pixels.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }

    Ok(RgbaImage {
        width,
        height,
        pixels,
    })
}

fn write_png(path: &Path, width: i32, height: i32, pixels: &[u8]) -> Result<(), String> {
    let file = File::create(path)
        .map_err(|error| format!("Failed to create PNG {}: {error}", path.display()))?;
    let writer = BufWriter::new(file);
    let mut encoder = Encoder::new(writer, width as u32, height as u32);
    encoder.set_color(ColorType::Rgba);
    encoder.set_depth(BitDepth::Eight);
    let mut png_writer = encoder
        .write_header()
        .map_err(|error| format!("Failed to write PNG header {}: {error}", path.display()))?;
    png_writer
        .write_image_data(pixels)
        .map_err(|error| format!("Failed to write PNG data {}: {error}", path.display()))
}

fn analyze_alpha(pixels: &[u8]) -> AlphaStats {
    let mut stats = AlphaStats {
        total: pixels.len() / 4,
        ..AlphaStats::default()
    };

    for pixel in pixels.chunks_exact(4) {
        let r = pixel[0];
        let g = pixel[1];
        let b = pixel[2];
        let a = pixel[3];

        if a == 0 {
            stats.transparent += 1;
            if r != 0 || g != 0 || b != 0 {
                stats.dirty_transparent += 1;
            }
        } else if a == 255 {
            stats.opaque += 1;
        } else {
            stats.translucent += 1;
            if r <= a && g <= a && b <= a {
                stats.translucent_rgb_le_alpha += 1;
            }
        }
    }

    stats
}

fn format_alpha_stats(stats: &AlphaStats) -> String {
    let premul_like_percent = if stats.translucent == 0 {
        0.0
    } else {
        stats.translucent_rgb_le_alpha as f64 * 100.0 / stats.translucent as f64
    };

    format!(
        "alpha total={} transparent={} dirty0={} translucent={} rgb<=a={:.1}% opaque={}",
        stats.total,
        stats.transparent,
        stats.dirty_transparent,
        stats.translucent,
        premul_like_percent,
        stats.opaque
    )
}

fn sanitize_filename(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    for character in value.chars() {
        if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
            output.push(character);
        } else {
            output.push('_');
        }
    }

    if output.is_empty() {
        "icon".to_string()
    } else {
        output
    }
}
