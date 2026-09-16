# Changes

## 1.1.0 — September 16, 2026

Restored the extracted Discord project for local development and prepared its first source-code publication in the existing leaf repository.

- **Startup:** combined, bot-only and web-only commands; command catalog available before login; event handlers loaded before connecting; clear startup failures and shutdown behavior.
- **Setup:** configuration template, random session secret for fresh installs and non-destructive creation of missing data files.
- **Dependencies:** declared the missing emoji renderer dependency, corrected a CommonJS fetch mismatch, removed unused packages, replaced the deprecated Roblox client with public HTTP lookups and updated the math evaluator and NightAPI HTTP dependency. Four moderate image-library advisories remain; no high or critical findings remain in the final audit.
- **Dashboard:** confined static files to their public directories, enforced session age, enabled secure cookies for HTTPS and corrected font paths and connection status copy.
- **Assets:** removed 17 unused images and legacy badge assets after checking source and local data references; retained the Leaf banner and all referenced image assets.
- **Documentation:** replaced the README with setup, startup, features, AI-assisted development and learning sections; added a code guide and realistic policy text while retaining legal page styling.
- **Repository hygiene:** excluded credentials, saved user data, dependencies and old source backups from Git. The existing Git history and policy filenames are preserved.

External provider behavior, live OAuth sign-in and the full collection of legacy command interactions require separate verification. See the README for hosting limitations.
