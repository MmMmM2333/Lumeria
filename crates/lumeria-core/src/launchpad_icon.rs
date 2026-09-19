#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum LaunchpadIconVariant {
    #[default]
    Light,
    Dark,
    PastelLight,
    PastelDark,
}

impl LaunchpadIconVariant {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "light" => Some(Self::Light),
            "dark" => Some(Self::Dark),
            "pastelLight" => Some(Self::PastelLight),
            "pastelDark" => Some(Self::PastelDark),
            _ => None,
        }
    }

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Light => "light",
            Self::Dark => "dark",
            Self::PastelLight => "pastelLight",
            Self::PastelDark => "pastelDark",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::LaunchpadIconVariant;

    #[test]
    fn launchpad_icon_variants_use_the_persisted_frontend_contract() {
        for value in ["light", "dark", "pastelLight", "pastelDark"] {
            let variant = LaunchpadIconVariant::parse(value).expect("documented icon variant");
            assert_eq!(variant.as_str(), value);
        }
        assert!(LaunchpadIconVariant::parse("system").is_none());
    }
}
