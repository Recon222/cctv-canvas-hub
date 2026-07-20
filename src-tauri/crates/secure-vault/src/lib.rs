//! Pure AES-256-GCM seal/open for the session vault (AD5).
//!
//! Framing: `nonce (12 bytes) ‖ ciphertext+tag`. No Tauri or keyring
//! dependency — the OS-keychain key lifecycle lives in the app crate's
//! `cloud_session` feature. This crate is pure input→output logic, so its
//! inline tests run WebView2-free (see docs/developer/testing.md).

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use rand::rngs::OsRng;
use rand::RngCore;

const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VaultError {
    /// Sealed input malformed — shorter than the minimum `nonce ‖ tag` frame.
    Corrupt,
    /// GCM tag mismatch — tampered ciphertext or wrong key.
    AuthFailed,
}

impl std::fmt::Display for VaultError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Corrupt => write!(f, "vault data is corrupt"),
            Self::AuthFailed => write!(f, "vault authentication failed"),
        }
    }
}

impl std::error::Error for VaultError {}

/// Generate a fresh 256-bit vault key from the OS CSPRNG.
pub fn generate_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    key
}

/// Encrypt `plaintext` under `key`, returning `nonce ‖ ciphertext+tag`.
/// A fresh random nonce is drawn per call, so identical plaintexts seal
/// to distinct outputs.
pub fn seal(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, VaultError> {
    let cipher = Aes256Gcm::new(key.into());
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    // Encrypt only fails on absurd plaintext lengths (beyond the AEAD limit,
    // ~64 GiB) — unreachable for session JSON, but never panic on it.
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plaintext)
        .map_err(|_| VaultError::Corrupt)?;
    let mut sealed = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    sealed.extend_from_slice(&nonce_bytes);
    sealed.extend_from_slice(&ciphertext);
    Ok(sealed)
}

/// Decrypt a `nonce ‖ ciphertext+tag` blob produced by [`seal`].
///
/// Returns [`VaultError::Corrupt`] when the framing is too short to ever
/// authenticate, and [`VaultError::AuthFailed`] on GCM tag mismatch
/// (tamper or wrong key). Never panics on malformed input.
pub fn open(key: &[u8; 32], sealed: &[u8]) -> Result<Vec<u8>, VaultError> {
    if sealed.len() < NONCE_LEN + TAG_LEN {
        return Err(VaultError::Corrupt);
    }
    let (nonce_bytes, ciphertext) = sealed.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new(key.into());
    cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|_| VaultError::AuthFailed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_seal_open_with_same_key() {
        let key = generate_key();
        let plaintext = b"session json";
        let sealed = seal(&key, plaintext).unwrap();
        assert_eq!(open(&key, &sealed).unwrap(), plaintext);
    }

    #[test]
    fn fails_to_open_with_different_key() {
        let sealed = seal(&generate_key(), b"secret").unwrap();
        assert_eq!(open(&generate_key(), &sealed), Err(VaultError::AuthFailed));
    }

    #[test]
    fn fails_to_open_tampered_ciphertext() {
        let key = generate_key();
        let mut sealed = seal(&key, b"secret").unwrap();
        let last = sealed.len() - 1;
        sealed[last] ^= 0x01;
        assert_eq!(open(&key, &sealed), Err(VaultError::AuthFailed));
    }

    #[test]
    fn rejects_sealed_input_shorter_than_nonce_frame() {
        let key = generate_key();
        assert_eq!(open(&key, &[]), Err(VaultError::Corrupt));
        assert_eq!(open(&key, &[0u8; 11]), Err(VaultError::Corrupt));
    }

    #[test]
    fn produces_distinct_ciphertexts_for_identical_plaintexts() {
        let key = generate_key();
        assert_ne!(seal(&key, b"same").unwrap(), seal(&key, b"same").unwrap());
    }

    #[test]
    fn round_trips_session_sized_payload() {
        // A GoTrue session JSON regularly exceeds the ~2.5 KB Windows
        // credential-blob cap (the reason this vault exists) — prove a
        // realistic ≥ 4 KB payload survives byte-identical.
        let key = generate_key();
        let payload = format!(r#"{{"access_token":"{}"}}"#, "x".repeat(4096));
        assert!(payload.len() >= 4096);
        let sealed = seal(&key, payload.as_bytes()).unwrap();
        assert_eq!(open(&key, &sealed).unwrap(), payload.as_bytes());
    }
}
