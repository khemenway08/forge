<?php
declare(strict_types=1);

use Forge\Server\DatabaseConnectionFactory;
use Forge\Server\PdoStaffMaterialCatalogRepository;
use Forge\Server\StaffMaterialCatalogImporter;

require_once dirname(__DIR__) . '/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This importer must be run from the command line.\n");
    exit(1);
}

$options = parseMaterialImporterOptions($argv);
if ($options['help']) {
    fwrite(STDOUT, buildMaterialImporterUsage());
    exit(0);
}

if ($options['source'] === '') {
    fwrite(STDERR, "A source directory is required.\n\n" . buildMaterialImporterUsage());
    exit(1);
}

try {
    $config = \Forge\Server\loadPrivateDatabaseConfig();
    $resolvedConfig = DatabaseConnectionFactory::resolveConfiguration([], $config);
    if (strpos($resolvedConfig['FORGE_DB_DSN'], 'dbname=forge_local_dev') === false) {
        throw new RuntimeException('The material importer is restricted to the local forge_local_dev database.');
    }

    $pdo = DatabaseConnectionFactory::createFromEnvironment($config);
    $repository = new PdoStaffMaterialCatalogRepository($pdo);
    $importer = new StaffMaterialCatalogImporter($repository, resolveManagedMaterialUploadDirectory());
    $summary = $importer->importDirectory($options['source'], $options['dry_run']);
    fwrite(STDOUT, renderMaterialImportSummary($summary));
    exit($summary['failed'] > 0 ? 1 : 0);
} catch (Throwable $exception) {
    fwrite(STDERR, 'Import failed: ' . $exception->getMessage() . PHP_EOL);
    exit(1);
}

/**
 * @param array<int, string> $argv
 * @return array{source:string,dry_run:bool,help:bool}
 */
function parseMaterialImporterOptions(array $argv): array
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

function resolveManagedMaterialUploadDirectory(): string
{
    return dirname(__DIR__, 2) . '/public/uploads/material-swatches';
}

/**
 * @param array{
 *   source_directory:string,
 *   dry_run:bool,
 *   imported:int,
 *   skipped:int,
 *   failed:int,
 *   collisions:int,
 *   portrait:int,
 *   landscape:int,
 *   approximately_square:int,
 *   imported_records:array<int, array<string, mixed>>,
 *   skipped_records:array<int, array<string, mixed>>,
 *   failed_records:array<int, array<string, mixed>>,
 *   collision_records:array<int, array<string, mixed>>
 * } $summary
 */
function renderMaterialImportSummary(array $summary): string
{
    $lines = [
        'Hilltop Material Swatch Import',
        'Source: ' . $summary['source_directory'],
        'Mode: ' . ($summary['dry_run'] ? 'dry-run' : 'import'),
        'Imported: ' . $summary['imported'],
        'Skipped: ' . $summary['skipped'],
        'Failed: ' . $summary['failed'],
        'Collisions: ' . $summary['collisions'],
        'Portrait: ' . $summary['portrait'],
        'Landscape: ' . $summary['landscape'],
        'Approximately Square: ' . $summary['approximately_square'],
    ];

    appendMaterialImportSection($lines, 'Imported Records', $summary['imported_records']);
    appendMaterialImportSection($lines, 'Skipped Records', $summary['skipped_records']);
    appendMaterialImportSection($lines, 'Collision Records', $summary['collision_records']);
    appendMaterialImportSection($lines, 'Failed Records', $summary['failed_records']);

    return implode(PHP_EOL, $lines) . PHP_EOL;
}

/**
 * @param array<int, string> $lines
 * @param array<int, array<string, mixed>> $records
 */
function appendMaterialImportSection(array &$lines, string $title, array $records): void
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

function buildMaterialImporterUsage(): string
{
    return <<<TEXT
Usage:
  php server/tools/import-material-swatches.php --source /absolute/path/to/03_MATERIAL_SWATCHES [--dry-run]

Options:
  --source    Absolute source directory containing material swatch images
  --dry-run   Report what would be imported without changing the database or managed swatch storage
  --help      Show this help text

TEXT;
}
