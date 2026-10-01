# Forge Artwork Launcher

This is the maintained macOS source for Forge artwork-template setup and
read-only master validation and prepared LIVE artwork creation. It registers the `forge-artwork://` URL scheme,
opens a native master file or folder picker, validates explicitly configured
variants, and reports limited validation results to Forge.

For an authenticated Forge preparation request, it exclusively copies the exact
registered master into the configured customer artwork root, verifies both
SHA-256 values, records the local association, and opens only the LIVE copy in
Adobe Illustrator 2025. It never opens or modifies a master.

For an authenticated Open All Artwork request, the launcher receives only a
single-use token. It resolves the explicitly associated prepared LIVE paths
through Forge, validates that every file is an existing regular file inside
the configured customer artwork root, and opens the complete set in
Illustrator. It does not create, copy, rename, or modify artwork in this mode.

For an authenticated proof request, the launcher resolves the exact associated
customer LIVE file from its local receipt, validates it inside the configured
customer artwork root, and renders the single PDF-compatible Illustrator
artboard through macOS PDFKit. It uploads only the PNG preview and hashes to
Forge. It verifies the LIVE file's inode, size, modification time, and SHA-256
before and after rendering and never opens Illustrator for proof generation.
Successful preparation, group-open, and proof operations close the launcher
silently after reporting to Forge; validation and error handling remain active.

## Local configuration

The launcher reads its machine-specific configuration from:

`~/Library/Application Support/Forge Artwork Launcher/config.json`

Create that protected local file from `config.example.json`. Keep absolute
paths, launcher profile details, and development certificate fingerprints out
of Git. The installer preserves an existing local configuration and sets its
permissions to `0600`.

`customer_artwork_root` must point to the permanent
`07_PRODUCTION/CUSTOMER_ARTWORK` directory. Forge supplies only the approved
relative year/customer/file path.

Local development at `https://forge.localhost:8443` additionally requires a
`development_certificate_sha256` value containing the exact lowercase SHA-256
fingerprint of the local server certificate. That pin is accepted only for the
fixed local-development origin and loopback transport. Normal HTTPS origins use
the macOS system trust store.

## Build, test, install

```bash
tools/forge-artwork-launcher/install.sh --build-only
tools/forge-artwork-launcher/test.sh
tools/forge-artwork-launcher/install.sh --install
```

Generated builds stay under the ignored `.deploy/forge-artwork-launcher-build`
directory. The installed application remains at
`~/Applications/Forge Artwork Launcher.app`.

## Remove

```bash
tools/forge-artwork-launcher/uninstall.sh REMOVE-FORGE-ARTWORK-LAUNCHER
```

Removal deletes the installed launcher and its local Application Support data.
It does not touch artwork masters or production folders.
