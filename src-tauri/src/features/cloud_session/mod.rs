//! Cloud session feature: agency-cloud connection config + encrypted
//! session vault (key in OS keychain, ciphertext in app data — AD5).
//! Also serves the ProcessPanel's SYSTEM lane: bounded log-tail reads
//! and a plaintext-free vault presence status (6.3B).

pub mod commands;
pub mod services;
pub mod types;
