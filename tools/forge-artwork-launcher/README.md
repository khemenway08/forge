# Forge Artwork Launcher

This is the maintained macOS source for Forge artwork-template setup and
read-only master validation. It registers the `forge-artwork://` URL scheme,
opens a native master file or folder picker, validates explicitly configured
variants, and reports limited validation results to Forge.

It does not create customer artwork, modify masters, or open Illustrator.

## Local configuration

The launcher reads its machine-specific configuration from:

`~/Library/Application Support/Forge Artwork Launcher/config.json`

Create that protected local file from `config.example.json`. Keep absolute
paths, launcher profile details, and development certificate fingerprints out
of Git. The installer preserves an existing local configuration and sets its
permissions to `0600`.

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
