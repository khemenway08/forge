<?php
declare(strict_types=1);

use Forge\Server\StaffHatCatalogImporter;
use Forge\Server\PdoStaffHatCatalogRepository;
use Forge\Server\DatabaseConnectionFactory;

require_once dirname(__DIR__) . '/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This importer must be run from the command line.\n");
    exit(1);
}

$options = parseHatImporterOptions($argv);
if ($options['help']) {
    fwrite(STDOUT, buildHatImporterUsage());
    exit(0);
}

if ($options['source'] === '') {
    fwrite(STDERR, "A source directory is required.\n\n" . buildHatImporterUsage());
    exit(1);
}

try {
    $pdo = DatabaseConnectionFactory::createFromEnvironment(\Forge\Server\loadPrivateDatabaseConfig());
    $repository = new PdoStaffHatCatalogRepository($pdo);
    $importer = new StaffHatCatalogImporter($repository, resolveManagedHatUploadDirectory());
    $summary = $importer->importDirectory($options['source'], $options['dry_run']);
    fwrite(STDOUT, renderHatImportSummary($summary));
    exit($summary['failed'] > 0 ? 1 : 0);
} catch (Throwable $exception) {
    fwrite(STDERR, 'Import failed: ' . $exception->getMessage() . PHP_EOL);
    exit(1);
}

/**
 * @param array<int, string> $argv
 * @return array{source:string,dry_run:bool,help:bool}
 */
function parseHatImporterOptions(array $argv): array
{
    $source = '';
    $dryRun = false;
    $help = false;

    for ($index = 1, $count = count($argv); $index < $count; $index++) {
        $argument = $argv[$index];
        if ($argument === '--dry-run') {
            $dryRun = true;
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
        'dry_run' => $dryRun,
        'help' => $help,
    ];
}

function resolveManagedHatUploadDirectory(): string
{
    return dirname(__DIR__, 2) . '/public/uploads/hat-photos';
}

/**
 * @param array{
 *   source_directory:string,
 *   dry_run:bool,
 *   imported:int,
 *   skipped:int,
 *   failed:int,
 *   collisions:int,
 *   imported_records:array<int, array<string, mixed>>,
 *   skipped_records:array<int, array<string, mixed>>,
 *   failed_records:array<int, array<string, mixed>>,
 *   collision_records:array<int, array<string, mixed>>
 * } $summary
 */
function renderHatImportSummary(array $summary): string
{
    $lines = [
        'Hilltop Hat Photo Import',
        'Source: ' . $summary['source_directory'],
        'Mode: ' . ($summary['dry_run'] ? 'dry-run' : 'import'),
        'Imported: ' . $summary['imported'],
        'Skipped: ' . $summary['skipped'],
        'Failed: ' . $summary['failed'],
        'Collisions: ' . $summary['collisions'],
    ];

    appendHatImportSection($lines, 'Imported Records', $summary['imported_records']);
    appendHatImportSection($lines, 'Skipped Records', $summary['skipped_records']);
    appendHatImportSection($lines, 'Collision Records', $summary['collision_records']);
    appendHatImportSection($lines, 'Failed Records', $summary['failed_records']);

    return implode(PHP_EOL, $lines) . PHP_EOL;
}

/**
 * @param array<int, string> $lines
 * @param array<int, array<string, mixed>> $records
 */
function appendHatImportSection(array &$lines, string $title, array $records): void
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
            if (is_array($value)) {
                $parts[] = $key . '=' . implode(', ', array_map('strval', $value));
                continue;
            }
            $parts[] = $key . '=' . (string) $value;
        }
        $lines[] = ' - ' . implode(' | ', $parts);
    }
}

function buildHatImporterUsage(): string
{
    return <<<TEXT
Usage:
  php server/tools/import-hat-photos.php --source /absolute/path/to/02_HAT\ PHOTOS [--dry-run]

Options:
  --source    Absolute source directory containing blank hat photos
  --dry-run   Report what would be imported without changing the database or managed photo storage
  --help      Show this help text

TEXT;
}
