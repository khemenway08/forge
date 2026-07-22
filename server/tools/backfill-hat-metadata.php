<?php
declare(strict_types=1);

use Forge\Server\DatabaseConnectionFactory;
use Forge\Server\PdoStaffHatCatalogRepository;
use Forge\Server\StaffHatCatalogMetadataBackfill;

require_once dirname(__DIR__) . '/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This backfill utility must be run from the command line.\n");
    exit(1);
}

$options = parseHatMetadataBackfillOptions($argv);
if ($options['help']) {
    fwrite(STDOUT, buildHatMetadataBackfillUsage());
    exit(0);
}

if ($options['source'] === '') {
    fwrite(STDERR, "A source directory is required.\n\n" . buildHatMetadataBackfillUsage());
    exit(1);
}

try {
    $config = \Forge\Server\loadPrivateDatabaseConfig();
    assertLocalHatMetadataBackfillConfig($config);

    $pdo = DatabaseConnectionFactory::createFromEnvironment($config);
    $repository = new PdoStaffHatCatalogRepository($pdo);
    $backfill = new StaffHatCatalogMetadataBackfill($repository);
    $summary = $backfill->backfillDirectory($options['source'], !$options['apply']);

    fwrite(STDOUT, renderHatMetadataBackfillSummary($summary));
    exit($summary['failed'] > 0 ? 1 : 0);
} catch (Throwable $exception) {
    fwrite(STDERR, 'Hat metadata backfill failed: ' . $exception->getMessage() . PHP_EOL);
    exit(1);
}

/**
 * @param array<int, string> $argv
 * @return array{source:string,apply:bool,help:bool}
 */
function parseHatMetadataBackfillOptions(array $argv): array
{
    $source = '';
    $apply = false;
    $help = false;

    for ($index = 1, $count = count($argv); $index < $count; $index++) {
        $argument = $argv[$index];
        if ($argument === '--apply') {
            $apply = true;
            continue;
        }
        if ($argument === '--help' || $argument === '-h') {
            $help = true;
            continue;
        }
        if (str_starts_with($argument, '--source=')) {
            $source = substr($argument, strlen('--source='));
            continue;
        }
        if ($argument === '--source' && isset($argv[$index + 1])) {
            $source = $argv[$index + 1];
            $index++;
            continue;
        }
    }

    return [
        'source' => trim($source),
        'apply' => $apply,
        'help' => $help,
    ];
}

/**
 * @param array{FORGE_DB_DSN?: mixed, FORGE_DB_USER?: mixed, FORGE_DB_PASSWORD?: mixed} $config
 */
function assertLocalHatMetadataBackfillConfig(array $config): void
{
    $dsn = is_string($config['FORGE_DB_DSN'] ?? null)
        ? trim((string) $config['FORGE_DB_DSN'])
        : '';

    if ($dsn === '') {
        throw new RuntimeException('A local Forge database DSN is required.');
    }

    $databaseName = '';
    if (preg_match('/(?:^|;)dbname=([^;]+)/i', $dsn, $matches) === 1) {
        $databaseName = trim((string) $matches[1]);
    }

    if ($databaseName !== 'forge_local_dev') {
        throw new RuntimeException('This utility may run only against the local forge_local_dev database.');
    }
}

/**
 * @param array{
 *   source_directory:string,
 *   dry_run:bool,
 *   updated:int,
 *   unchanged:int,
 *   skipped_populated_fields:int,
 *   ambiguous:int,
 *   failed:int,
 *   updated_records:array<int, array<string, mixed>>,
 *   unchanged_records:array<int, array<string, mixed>>,
 *   ambiguous_records:array<int, array<string, mixed>>,
 *   failed_records:array<int, array<string, mixed>>
 * } $summary
 */
function renderHatMetadataBackfillSummary(array $summary): string
{
    $lines = [
        'Hilltop Hat Metadata Backfill',
        'Source: ' . $summary['source_directory'],
        'Mode: ' . ($summary['dry_run'] ? 'dry-run' : 'apply'),
        'Updated: ' . $summary['updated'],
        'Unchanged: ' . $summary['unchanged'],
        'Skipped Populated Fields: ' . $summary['skipped_populated_fields'],
        'Ambiguous: ' . $summary['ambiguous'],
        'Failed: ' . $summary['failed'],
    ];

    appendHatMetadataBackfillSection($lines, 'Updated Records', $summary['updated_records']);
    appendHatMetadataBackfillSection($lines, 'Unchanged Records', $summary['unchanged_records']);
    appendHatMetadataBackfillSection($lines, 'Ambiguous Records', $summary['ambiguous_records']);
    appendHatMetadataBackfillSection($lines, 'Failed Records', $summary['failed_records']);

    return implode(PHP_EOL, $lines) . PHP_EOL;
}

/**
 * @param array<int, string> $lines
 * @param array<int, array<string, mixed>> $records
 */
function appendHatMetadataBackfillSection(array &$lines, string $title, array $records): void
{
    if ($records === []) {
        return;
    }

    $lines[] = '';
    $lines[] = $title . ':';
    foreach ($records as $record) {
        $parts = [];
        foreach ($record as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }
            if (is_bool($value)) {
                $parts[] = $key . '=' . ($value ? 'true' : 'false');
                continue;
            }
            $parts[] = $key . '=' . (string) $value;
        }
        $lines[] = ' - ' . implode(' | ', $parts);
    }
}

function buildHatMetadataBackfillUsage(): string
{
    return <<<TEXT
Usage:
  php server/tools/backfill-hat-metadata.php --source /absolute/path/to/02_HAT\ PHOTOS [--apply]

Options:
  --source    Absolute source directory containing blank hat photos
  --apply     Persist high-confidence metadata updates locally (dry-run is the default)
  --help      Show this help text

TEXT;
}
