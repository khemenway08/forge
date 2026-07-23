<?php
declare(strict_types=1);

use Forge\Server\DatabaseConnectionFactory;
use Forge\Server\PdoStaffFinishedHatCatalogRepository;
use Forge\Server\StaffFinishedHatCatalogImporter;

require_once dirname(__DIR__) . '/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This importer must be run from the command line.\n");
    exit(1);
}

$options = parseFinishedHatImporterOptions($argv);
if ($options['help']) {
    fwrite(STDOUT, buildFinishedHatImporterUsage());
    exit(0);
}

if ($options['source'] === '') {
    fwrite(STDERR, "A source directory is required.\n\n" . buildFinishedHatImporterUsage());
    exit(1);
}

try {
    $config = \Forge\Server\loadPrivateDatabaseConfig();
    $dsn = is_string($config['FORGE_DB_DSN'] ?? null) ? $config['FORGE_DB_DSN'] : '';
    if (!str_contains($dsn, 'dbname=forge_local_dev')) {
        throw new RuntimeException('This importer may only run against the local forge_local_dev database.');
    }

    $pdo = DatabaseConnectionFactory::createFromEnvironment($config);
    $repository = new PdoStaffFinishedHatCatalogRepository($pdo);
    $importer = new StaffFinishedHatCatalogImporter($repository, resolveManagedFinishedHatUploadDirectory());
    $summary = $importer->importDirectory($options['source'], $options['dry_run']);
    fwrite(STDOUT, renderFinishedHatImportSummary($summary));
    exit($summary['failed'] > 0 ? 1 : 0);
} catch (Throwable $exception) {
    fwrite(STDERR, 'Import failed: ' . $exception->getMessage() . PHP_EOL);
    exit(1);
}

/**
 * @param array<int, string> $argv
 * @return array{source:string,dry_run:bool,help:bool}
 */
function parseFinishedHatImporterOptions(array $argv): array
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

function resolveManagedFinishedHatUploadDirectory(): string
{
    return dirname(__DIR__, 2) . '/public/uploads/finished-hat-photos';
}

/**
 * @param array{
 *   source_directory:string,
 *   dry_run:bool,
 *   imported:int,
 *   skipped:int,
 *   failed:int,
 *   collisions:int,
 *   manual_review:int,
 *   alternate_skipped:int,
 *   imported_records:array<int, array<string, mixed>>,
 *   skipped_records:array<int, array<string, mixed>>,
 *   failed_records:array<int, array<string, mixed>>,
 *   collision_records:array<int, array<string, mixed>>,
 *   manual_review_records:array<int, array<string, mixed>>,
 *   alternate_groups:array<int, array<string, mixed>>,
 *   alternate_skipped_records:array<int, array<string, mixed>>
 * } $summary
 */
function renderFinishedHatImportSummary(array $summary): string
{
    $lines = [
        'Hilltop Finished Hat Photo Import',
        'Source: ' . $summary['source_directory'],
        'Mode: ' . ($summary['dry_run'] ? 'dry-run' : 'import'),
        'Imported: ' . $summary['imported'],
        'Skipped: ' . $summary['skipped'],
        'Failed: ' . $summary['failed'],
        'Collisions: ' . $summary['collisions'],
        'Manual Review: ' . $summary['manual_review'],
        'Alternate Skipped: ' . $summary['alternate_skipped'],
    ];

    appendFinishedHatImportSection($lines, 'Imported Records', $summary['imported_records']);
    appendFinishedHatImportSection($lines, 'Skipped Records', $summary['skipped_records']);
    appendFinishedHatImportSection($lines, 'Collision Records', $summary['collision_records']);
    appendFinishedHatImportSection($lines, 'Manual Review Records', $summary['manual_review_records']);
    appendFinishedHatImportSection($lines, 'Alternate Groups', $summary['alternate_groups']);
    appendFinishedHatImportSection($lines, 'Alternate Skipped Records', $summary['alternate_skipped_records']);
    appendFinishedHatImportSection($lines, 'Failed Records', $summary['failed_records']);

    return implode(PHP_EOL, $lines) . PHP_EOL;
}

/**
 * @param array<int, string> $lines
 * @param array<int, array<string, mixed>> $records
 */
function appendFinishedHatImportSection(array &$lines, string $title, array $records): void
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

function buildFinishedHatImporterUsage(): string
{
    return <<<TEXT
Usage:
  php server/tools/import-finished-hat-photos.php --source /absolute/path/to/04_FINISHED_HAT_PHOTOS [--dry-run]

Options:
  --source    Absolute source directory containing finished hat photos
  --dry-run   Report what would be imported without changing the database or managed photo storage
  --help      Show this help text

TEXT;
}
