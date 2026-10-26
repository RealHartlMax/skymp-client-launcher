//! Display names supplement the authenticated Steam identity; they never select a profile.
pub fn validate(value: Option<&str>) -> Result<Option<String>, String> {
    let value = value.unwrap_or("").trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > 32 || value.len() > 128 || value.chars().any(|c| c.is_control() || matches!(c, '<' | '>' | '\u{200b}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2060}'..='\u{206f}' | '\u{feff}')) {
        return Err("[PLAYER_NAME_INVALID]".into());
    }
    Ok(Some(value.to_owned()))
}
pub fn steam_fallback(value: &str) -> Option<String> {
    let clean: String = value.chars().filter(|c| !c.is_control() && !matches!(c, '<' | '>' | '\u{200b}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2060}'..='\u{206f}' | '\u{feff}')).take(32).collect();
    validate(Some(&clean)).ok().flatten()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn display_names_keep_unicode_and_reject_invisible_controls() {
        assert_eq!(
            validate(Some("  Hüter_ÄÖÜ Довакин  ")).unwrap().as_deref(),
            Some("Hüter_ÄÖÜ Довакин")
        );
        assert!(validate(Some(" ")).unwrap().is_none());
        for bad in [
            "Admin\nName",
            "<script>",
            "Steam\u{202e}Name",
            &"a".repeat(33),
        ] {
            assert!(validate(Some(bad)).is_err());
        }
        assert_eq!(
            steam_fallback("<Hüter>\nName").as_deref(),
            Some("HüterName")
        );
    }
}
