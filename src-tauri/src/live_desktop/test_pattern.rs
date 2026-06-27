#[cfg(target_os = "windows")]
use windows::{
    core::Interface,
    Win32::Graphics::Direct3D11::{ID3D11DeviceContext, ID3D11Resource, D3D11_TEXTURE2D_DESC},
};

#[cfg(target_os = "windows")]
use super::{LiveDesktopCompositionSwapChain, LiveDesktopFrameProbe};

#[cfg(target_os = "windows")]
#[derive(Default)]
pub(super) struct LiveDesktopTestPatternState;

#[cfg(target_os = "windows")]
impl LiveDesktopTestPatternState {
    pub(super) fn invalidate(&mut self) {}
}

#[cfg(target_os = "windows")]
fn make_live_desktop_test_pattern_pixels(width: u32, height: u32) -> Vec<u8> {
    let width_usize = width as usize;
    let height_usize = height as usize;
    let mut pixels = vec![0u8; width_usize.saturating_mul(height_usize).saturating_mul(4)];
    let cell = (width.min(height) / 12).max(24) as usize;
    let dark = [28, 28, 28, 255];
    let light = [214, 214, 214, 255];
    let accent = [255, 255, 0, 255];

    for y in 0..height_usize {
        for x in 0..width_usize {
            let checker = ((x / cell) + (y / cell)) % 2 == 0;
            let color = if checker { light } else { dark };
            set_live_desktop_test_pattern_pixel(&mut pixels, width_usize, x, y, color);
        }
    }

    let corner = (width.min(height) / 7).max(72) as usize;
    fill_live_desktop_test_pattern_rect(
        &mut pixels,
        width_usize,
        height_usize,
        0,
        0,
        corner,
        corner,
        [64, 0, 255, 255],
    );
    fill_live_desktop_test_pattern_rect(
        &mut pixels,
        width_usize,
        height_usize,
        width_usize.saturating_sub(corner),
        0,
        corner,
        corner,
        [48, 220, 0, 255],
    );
    fill_live_desktop_test_pattern_rect(
        &mut pixels,
        width_usize,
        height_usize,
        0,
        height_usize.saturating_sub(corner),
        corner,
        corner,
        [255, 80, 16, 255],
    );
    fill_live_desktop_test_pattern_rect(
        &mut pixels,
        width_usize,
        height_usize,
        width_usize.saturating_sub(corner),
        height_usize.saturating_sub(corner),
        corner,
        corner,
        [0, 220, 255, 255],
    );

    let bar_width = (width_usize / 24).max(18);
    let bar_x = width_usize / 5;
    fill_live_desktop_test_pattern_rect(
        &mut pixels,
        width_usize,
        height_usize,
        bar_x,
        0,
        bar_width.min(width_usize.saturating_sub(bar_x)),
        height_usize,
        [255, 255, 255, 255],
    );

    let cross = (width.min(height) / 180).max(4) as usize;
    fill_live_desktop_test_pattern_rect(
        &mut pixels,
        width_usize,
        height_usize,
        (width_usize / 2).saturating_sub(cross / 2),
        0,
        cross,
        height_usize,
        accent,
    );
    fill_live_desktop_test_pattern_rect(
        &mut pixels,
        width_usize,
        height_usize,
        0,
        (height_usize / 2).saturating_sub(cross / 2),
        width_usize,
        cross,
        accent,
    );

    draw_live_desktop_test_pattern_counter(&mut pixels, width_usize, height_usize, 0);
    draw_live_desktop_test_pattern_binary_bar(&mut pixels, width_usize, height_usize);
    pixels
}

#[cfg(target_os = "windows")]
fn set_live_desktop_test_pattern_pixel(
    pixels: &mut [u8],
    width: usize,
    x: usize,
    y: usize,
    color: [u8; 4],
) {
    let offset = y.saturating_mul(width).saturating_add(x).saturating_mul(4);
    if offset + 3 >= pixels.len() {
        return;
    }
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
}

#[cfg(target_os = "windows")]
fn fill_live_desktop_test_pattern_rect(
    pixels: &mut [u8],
    width: usize,
    height: usize,
    left: usize,
    top: usize,
    rect_width: usize,
    rect_height: usize,
    color: [u8; 4],
) {
    let right = left.saturating_add(rect_width).min(width);
    let bottom = top.saturating_add(rect_height).min(height);
    for y in top..bottom {
        for x in left..right {
            set_live_desktop_test_pattern_pixel(pixels, width, x, y, color);
        }
    }
}

#[cfg(target_os = "windows")]
fn draw_live_desktop_test_pattern_counter(
    pixels: &mut [u8],
    width: usize,
    height: usize,
    value: u64,
) {
    let text = format!("{value:05}");
    let scale = (width.min(height) / 72).max(5);
    let digit_width = scale * 5;
    let gap = scale * 2;
    let total_width = text.len() * digit_width + text.len().saturating_sub(1) * gap;
    let start_x = width.saturating_sub(total_width) / 2;
    let start_y = (height / 9).min(height.saturating_sub(scale * 11));
    fill_live_desktop_test_pattern_rect(
        pixels,
        width,
        height,
        start_x.saturating_sub(scale),
        start_y.saturating_sub(scale),
        total_width + scale * 2,
        scale * 11,
        [0, 0, 0, 220],
    );
    for (index, digit) in text.bytes().enumerate() {
        draw_live_desktop_test_pattern_digit(
            pixels,
            width,
            height,
            (digit - b'0') as usize,
            start_x + index * (digit_width + gap),
            start_y,
            scale,
            [255, 255, 255, 255],
        );
    }
}

#[cfg(target_os = "windows")]
fn draw_live_desktop_test_pattern_digit(
    pixels: &mut [u8],
    width: usize,
    height: usize,
    digit: usize,
    x: usize,
    y: usize,
    scale: usize,
    color: [u8; 4],
) {
    const SEGMENTS: [[bool; 7]; 10] = [
        [true, true, true, true, true, true, false],
        [false, true, true, false, false, false, false],
        [true, true, false, true, true, false, true],
        [true, true, true, true, false, false, true],
        [false, true, true, false, false, true, true],
        [true, false, true, true, false, true, true],
        [true, false, true, true, true, true, true],
        [true, true, true, false, false, false, false],
        [true, true, true, true, true, true, true],
        [true, true, true, true, false, true, true],
    ];
    let Some(segments) = SEGMENTS.get(digit) else {
        return;
    };
    let thickness = scale.max(2);
    let long = scale * 5;
    let short = scale * 4;
    let segment_rects = [
        (x, y, long, thickness),
        (x + long - thickness, y, thickness, short),
        (x + long - thickness, y + short, thickness, short),
        (x, y + short * 2, long, thickness),
        (x, y + short, thickness, short),
        (x, y, thickness, short),
        (x, y + short, long, thickness),
    ];
    for (enabled, rect) in segments.iter().zip(segment_rects) {
        if *enabled {
            fill_live_desktop_test_pattern_rect(
                pixels, width, height, rect.0, rect.1, rect.2, rect.3, color,
            );
        }
    }
}

#[cfg(target_os = "windows")]
fn draw_live_desktop_test_pattern_binary_bar(pixels: &mut [u8], width: usize, height: usize) {
    let bits = 16usize;
    let gap = (width / 260).max(2);
    let bar_width = ((width / 3).max(bits * 8) - gap * (bits - 1)) / bits;
    let bar_height = (height / 28).max(14);
    let total_width = bits * bar_width + (bits - 1) * gap;
    let start_x = width.saturating_sub(total_width) / 2;
    let y = height.saturating_sub(bar_height * 2);
    for bit in 0..bits {
        let enabled = bit % 2 == 0;
        fill_live_desktop_test_pattern_rect(
            pixels,
            width,
            height,
            start_x + bit * (bar_width + gap),
            y,
            bar_width,
            bar_height,
            if enabled {
                [32, 255, 255, 255]
            } else {
                [24, 24, 24, 255]
            },
        );
    }
}

#[cfg(target_os = "windows")]
pub(super) unsafe fn draw_live_desktop_test_pattern_to_composition_surface(
    swap_chain: &LiveDesktopCompositionSwapChain,
    context: &ID3D11DeviceContext,
    _state: &mut LiveDesktopTestPatternState,
) -> Result<LiveDesktopFrameProbe, String> {
    let target_texture = unsafe { swap_chain.back_buffer("Test pattern") }?;
    let mut desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { target_texture.GetDesc(&mut desc) };
    if desc.Width == 0 || desc.Height == 0 {
        return Err("Test pattern target texture has invalid size".to_string());
    }
    let target_resource = target_texture
        .cast::<ID3D11Resource>()
        .map_err(|error| format!("Test pattern target texture resource cast failed: {error}"))?;
    let pixels = make_live_desktop_test_pattern_pixels(desc.Width, desc.Height);
    unsafe {
        context.UpdateSubresource(
            &target_resource,
            0,
            None,
            pixels.as_ptr() as *const std::ffi::c_void,
            desc.Width * 4,
            0,
        )
    };

    Ok(LiveDesktopFrameProbe {
        supports_frame_texture: true,
        width: desc.Width,
        height: desc.Height,
        format: desc.Format.0,
        reason: "testPattern",
        detail: format!(
            "Drew DirectComposition swap chain static test pattern {}x{} format {}",
            desc.Width, desc.Height, desc.Format.0
        ),
    })
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn test_pattern_pixels_mark_four_corners() {
        let pixels = make_live_desktop_test_pattern_pixels(320, 240);
        let pixel = |x: usize, y: usize| -> [u8; 4] {
            let offset = (y * 320 + x) * 4;
            [
                pixels[offset],
                pixels[offset + 1],
                pixels[offset + 2],
                pixels[offset + 3],
            ]
        };

        assert_eq!(pixel(0, 0), [64, 0, 255, 255]);
        assert_eq!(pixel(319, 0), [48, 220, 0, 255]);
        assert_eq!(pixel(0, 239), [255, 80, 16, 255]);
        assert_eq!(pixel(319, 239), [0, 220, 255, 255]);
    }
}
