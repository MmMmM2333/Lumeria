use super::{Point, Rect};
use std::time::{Duration, Instant};
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Monitor {
    pub id: usize,
    pub rect: Rect,
    pub dpi: u32,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Zone {
    pub monitor: usize,
    pub corner: u32,
    pub screen: Rect,
    exit: Rect,
    group: usize,
    pub rect: Rect,
}
impl Rect {
    pub fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.left && x < self.right && y >= self.top && y < self.bottom
    }
    fn expanded(&self, p: i32) -> Self {
        Self {
            left: self.left.saturating_sub(p),
            top: self.top.saturating_sub(p),
            right: self.right.saturating_add(p),
            bottom: self.bottom.saturating_add(p),
        }
    }
}
fn overlaps(a: i32, b: i32, c: i32, d: i32) -> bool {
    a < d && c < b
}
fn touches(a: Rect, b: Rect) -> bool {
    a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom
}
fn seam(m: Rect, other: Rect, zone: Rect, left: bool, top: bool) -> bool {
    let vertical = if left {
        other.left < m.left && other.right >= m.left
    } else {
        other.left <= m.right && other.right > m.right
    };
    let horizontal = if top {
        other.top < m.top && other.bottom >= m.top
    } else {
        other.top <= m.bottom && other.bottom > m.bottom
    };
    (vertical && overlaps(zone.top, zone.bottom, other.top, other.bottom))
        || (horizontal && overlaps(zone.left, zone.right, other.left, other.right))
}
pub(super) fn normalize(mut monitors: Vec<Monitor>) -> Vec<Monitor> {
    monitors.retain(|m| m.rect.left < m.rect.right && m.rect.top < m.rect.bottom && m.dpi > 0);
    monitors.sort_by_key(|m| m.id);
    monitors
}
pub(super) fn zones(monitors: &[Monitor], mask: u32, allow_seams: bool) -> Vec<Zone> {
    let mut result: Vec<Zone> = Vec::new();
    for m in monitors {
        if result.iter().any(|z| z.screen == m.rect) {
            continue;
        }
        let r = m.rect;
        let size = ((8u64 * u64::from(m.dpi) + 95) / 96).clamp(2, 256) as i32;
        let w = (i64::from(r.right) - i64::from(r.left)).min(i64::from(size)) as i32;
        let h = (i64::from(r.bottom) - i64::from(r.top)).min(i64::from(size)) as i32;
        for corner in [1, 2, 4, 8] {
            if mask & corner == 0 {
                continue;
            }
            let left = corner == 1 || corner == 4;
            let top = corner == 1 || corner == 2;
            let rect = Rect {
                left: if left { r.left } else { r.right - w },
                right: if left { r.left + w } else { r.right },
                top: if top { r.top } else { r.bottom - h },
                bottom: if top { r.top + h } else { r.bottom },
            };
            if !allow_seams
                && monitors
                    .iter()
                    .any(|other| other.rect != r && seam(r, other.rect, rect, left, top))
            {
                continue;
            }
            result.push(Zone {
                monitor: m.id,
                screen: r,
                corner,
                rect,
                exit: rect.expanded(size),
                group: result.len(),
            });
        }
    }
    // Connected components of touching enabled hot zones, computed only on rebuild.
    for i in 0..result.len() {
        for j in 0..i {
            if touches(result[i].rect, result[j].rect) {
                let old = result[i].group;
                let new = result[j].group;
                for z in &mut result {
                    if z.group == old {
                        z.group = new;
                    }
                }
            }
        }
    }
    result
}
#[derive(Default)]
pub(super) struct Detector {
    armed: bool,
    active: Option<(Zone, Instant)>,
    spent: Option<Zone>,
}
impl Detector {
    pub fn next_sample_delay(&self, now: Instant, delay: Duration) -> Duration {
        let normal = Duration::from_millis(50);
        self.active.map_or(normal, |(_, entered)| {
            delay.saturating_sub(now.duration_since(entered))
                .max(Duration::from_millis(1)).min(normal)
        })
    }

    pub fn reset(&mut self) {
        *self = Self::default();
    }
    pub fn sample(
        &mut self,
        zones: &[Zone],
        point: &Point,
        now: Instant,
        delay: Duration,
        blocked: bool,
        owner: Option<Rect>,
    ) -> Option<Zone> {
        if !self.armed {
            if !zones.iter().any(|z| z.exit.contains(point.x, point.y)) {
                self.armed = true;
            }
            return None;
        }
        if let Some(zone) = self.spent {
            if zones
                .iter()
                .any(|z| z.group == zone.group && z.exit.contains(point.x, point.y))
            {
                return None;
            }
            self.spent = None;
        }
        let Some(zone) = zones
            .iter()
            .find(|z| owner == Some(z.screen) && z.rect.contains(point.x, point.y))
            .copied()
        else {
            self.active = None;
            return None;
        };
        if blocked {
            self.active = None;
            self.spent = Some(zone);
            return None;
        }
        let entered = match self.active {
            Some((previous, time)) if previous == zone => time,
            _ => {
                self.active = Some((zone, now));
                now
            }
        };
        if now.duration_since(entered) >= delay {
            self.active = None;
            self.spent = Some(zone);
            return Some(zone);
        }
        None
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn m(id: usize, x: i32, y: i32, w: i32, h: i32, dpi: u32) -> Monitor {
        Monitor {
            id,
            rect: Rect {
                left: x,
                top: y,
                right: x + w,
                bottom: y + h,
            },
            dpi,
        }
    }
    #[test]
    fn custom_delays_keep_their_deadline_between_poll_intervals() {
        let monitor = m(1, 0, 0, 100, 100, 96);
        let areas = zones(&[monitor], 1, false);
        for millis in [80, 100, 137, 10000] {
            let mut detector = Detector::default();
            let now = Instant::now();
            let delay = Duration::from_millis(millis);
            detector.sample(&areas, &Point { x: 50, y: 50 }, now, delay, false, Some(monitor.rect));
            detector.sample(&areas, &Point { x: 0, y: 0 }, now, delay, false, Some(monitor.rect));
            let remaining = detector.next_sample_delay(now + delay - Duration::from_millis(7), delay);
            assert_eq!(remaining, Duration::from_millis(7));
            assert!(detector.sample(&areas, &Point { x: 0, y: 0 }, now + delay - Duration::from_millis(1), delay, false, Some(monitor.rect)).is_none());
            assert!(detector.sample(&areas, &Point { x: 0, y: 0 }, now + delay, delay, false, Some(monitor.rect)).is_some());
        }
    }
    #[test]
    fn seam_toggle_and_offset_threshold() {
        let a = m(1, 0, 0, 100, 100, 96);
        for offset in [0, 2, 7, 8, 9, 40] {
            let b = m(2, 100, offset, 100, 100, 96);
            let z = zones(&[a, b], 2, false);
            assert_eq!(z.iter().any(|z| z.monitor == 1), offset >= 8);
            assert_eq!(zones(&[a, b], 15, true).len(), 8);
        }
    }
    #[test]
    fn mirrors_gaps_diagonal_negative_and_extremes() {
        let a = m(1, -100, -100, 100, 100, 96);
        let mirror = Monitor { id: 2, ..a };
        assert_eq!(zones(&[a, mirror], 15, true).len(), 4);
        assert_eq!(zones(&[a, m(2, 0, 0, 100, 100, 96)], 15, false).len(), 8);
        assert_eq!(zones(&[a, m(2, 1, -100, 100, 100, 96)], 15, false).len(), 8);
        let z = zones(&[m(1, i32::MIN, i32::MIN, 100, 100, 192)], 15, false);
        assert_eq!(z[0].exit.left, i32::MIN);
        assert_eq!(z[0].rect.right - z[0].rect.left, 16);
        assert!(normalize(vec![m(1, 0, 0, 0, 100, 96)]).is_empty());
    }
    #[test]
    fn stacked_and_t_junctions() {
        let a = m(1, 0, 0, 200, 100, 96);
        let b = m(2, 50, 100, 100, 100, 96);
        let z = zones(&[a, b], 15, false);
        assert!(z.iter().any(|z| z.monitor == 1 && z.corner == 4));
        assert!(!z.iter().any(|z| z.monitor == 2 && z.corner == 1));
        assert_eq!(zones(&[a, m(2, 0, 100, 200, 100, 96)], 15, false).len(), 4);
    }
    #[test]
    fn adjacent_zones_do_not_retrigger_and_dwell_does_not_accumulate() {
        let a = m(1, 0, 0, 100, 100, 96);
        let b = m(2, 100, 0, 100, 100, 192);
        let z = zones(&[a, b], 3, true);
        let mut d = Detector::default();
        let t = Instant::now();
        let delay = Duration::from_millis(200);
        d.sample(&z, &Point { x: 50, y: 50 }, t, delay, false, Some(a.rect));
        assert!(d
            .sample(&z, &Point { x: 99, y: 0 }, t, delay, false, Some(a.rect))
            .is_none());
        assert!(d
            .sample(
                &z,
                &Point { x: 100, y: 0 },
                t + delay,
                delay,
                false,
                Some(b.rect)
            )
            .is_none());
        assert!(d
            .sample(
                &z,
                &Point { x: 100, y: 0 },
                t + delay * 2,
                delay,
                false,
                Some(b.rect)
            )
            .is_some());
        assert!(d
            .sample(
                &z,
                &Point { x: 99, y: 0 },
                t + delay * 3,
                delay,
                false,
                Some(a.rect)
            )
            .is_none());
        d.sample(
            &z,
            &Point { x: 50, y: 50 },
            t + delay * 4,
            delay,
            false,
            Some(a.rect),
        );
        assert!(d
            .sample(
                &z,
                &Point { x: 99, y: 0 },
                t + delay * 5,
                Duration::ZERO,
                false,
                Some(a.rect)
            )
            .is_some());
    }
    #[test]
    fn overlap_requires_platform_owner() {
        let a = m(1, 0, 0, 100, 100, 96);
        let b = m(2, 95, 0, 100, 100, 96);
        let z = zones(&[a, b], 3, true);
        let mut d = Detector::default();
        let t = Instant::now();
        d.sample(
            &z,
            &Point { x: 50, y: 50 },
            t,
            Duration::ZERO,
            false,
            Some(a.rect),
        );
        assert!(d
            .sample(&z, &Point { x: 97, y: 0 }, t, Duration::ZERO, false, None)
            .is_none());
        assert_eq!(
            d.sample(
                &z,
                &Point { x: 97, y: 0 },
                t,
                Duration::ZERO,
                false,
                Some(b.rect)
            )
            .unwrap()
            .monitor,
            2
        );
    }
}
