pub(crate) const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

pub(crate) fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);

    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = *chunk.get(1).unwrap_or(&0);
        let third = *chunk.get(2).unwrap_or(&0);

        output.push(TABLE[(first >> 2) as usize] as char);
        output.push(TABLE[(((first & 0b0000_0011) << 4) | (second >> 4)) as usize] as char);
        output.push(if chunk.len() > 1 {
            TABLE[(((second & 0b0000_1111) << 2) | (third >> 6)) as usize] as char
        } else {
            '='
        });
        output.push(if chunk.len() > 2 {
            TABLE[(third & 0b0011_1111) as usize] as char
        } else {
            '='
        });
    }

    output
}

pub(crate) fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let mut output = Vec::with_capacity(input.len() * 3 / 4);
    let mut buffer = 0u32;
    let mut bits = 0u8;
    let mut data_chars = 0usize;
    let mut padding_count = 0usize;
    let mut padding_started = false;

    for byte in input.bytes() {
        let value = match byte {
            b'A'..=b'Z' => Some(byte - b'A'),
            b'a'..=b'z' => Some(byte - b'a' + 26),
            b'0'..=b'9' => Some(byte - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            b'=' => {
                padding_started = true;
                padding_count += 1;
                if padding_count > 2 {
                    return Err("Custom icon data URL has invalid base64 padding".to_string());
                }
                None
            }
            b'\r' | b'\n' | b'\t' | b' ' => None,
            _ => return Err("Custom icon data URL has invalid base64".to_string()),
        };

        let Some(value) = value else {
            continue;
        };
        if padding_started {
            return Err("Custom icon data URL has invalid base64 padding".to_string());
        }
        data_chars += 1;
        buffer = (buffer << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }

    if data_chars % 4 == 1 {
        return Err("Custom icon data URL has invalid base64 length".to_string());
    }
    if padding_count > 0 {
        let expected_padding = match data_chars % 4 {
            2 => 2,
            3 => 1,
            _ => return Err("Custom icon data URL has invalid base64 padding".to_string()),
        };
        if padding_count != expected_padding {
            return Err("Custom icon data URL has invalid base64 padding".to_string());
        }
    }
    if bits > 0 && buffer != 0 {
        return Err("Custom icon data URL has invalid base64 trailing bits".to_string());
    }

    Ok(output)
}

pub(crate) fn short_blake3_hex(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex()[..32].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_base64_rejects_invalid_length() {
        let error = decode_base64("A").expect_err("single base64 sextet should fail");

        assert!(error.contains("length"));
    }

    #[test]
    fn decode_base64_rejects_invalid_padding() {
        let error = decode_base64("AAAA=").expect_err("unexpected padding should fail");

        assert!(error.contains("padding"));
    }

    #[test]
    fn decode_base64_rejects_non_zero_trailing_bits() {
        let error = decode_base64("AB==").expect_err("non-zero trailing bits should fail");

        assert!(error.contains("trailing bits"));
    }
}
