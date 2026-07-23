<?php
declare(strict_types=1);

use Forge\Server\DatabaseConnectionFactory;
use Forge\Server\PdoStaffFinishedHatCatalogRepository;
use Forge\Server\StaffFinishedHatCatalogAssistedLinker;

require_once dirname(__DIR__) . '/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This utility must be run from the command line.\n");
    exit(1);
}

$options = parseStaffCatalogFinishedHatAssistedLinkerOptions($argv);
if ($options['help']) {
    fwrite(STDOUT, buildStaffCatalogFinishedHatAssistedLinkerUsage());
    exit(0);
}

try {
    $config = \Forge\Server\loadPrivateDatabaseConfig();
    assertLocalFinishedHatAssistedLinkerConfig($config);

    $pdo = DatabaseConnectionFactory::createFromEnvironment($config);
    $repository = new PdoStaffFinishedHatCatalogRepository($pdo);
    $linker = new StaffFinishedHatCatalogAssistedLinker($repository);
    $summary = $linker->link(!$options['apply']);

    fwrite(STDOUT, renderStaffCatalogFinishedHatAssistedLinkerSummary($summary));
    exit($summary['failures'] > 0 ? 1 : 0);
} catch (Throwable $exception) {
    fwrite(STDERR, 'Finished hat assisted linking failed: ' . $exception->getMessage() . PHP_EOL);
    exit(1);
}

/**
 * @param array<int, string> $argv
 * @return array{apply:bool,help:bool}
 */
function parseStaffCatalogFinishedHatAssistedLinkerOptions(array $argv): array
{
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
        }
    }

    return [
        'apply' => $apply,
        'help' => $help,
    ];
}

/**
 * @param array{FORGE_DB_DSN?: mixed, FORGE_DB_USER?: mixed, FORGE_DB_PASSWORD?: mixed} $config
 */
function assertLocalFinishedHatAssistedLinkerConfig(array $config): void
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
 *   dry_run:bool,
 *   records_processed:int,
 *   design_links_proposed:int,
 *   hat_links_proposed:int,
 *   material_links_proposed:int,
 *   existing_links_preserved:int,
 *   ambiguous_fields:int,
 *   missing_catalog_records:int,
 *   fully_linkable_records:int,
 *   partially_linkable_records:int,
 *   records_receiving_no_proposals:int,
 *   failures:int,
 *   updated_records:int,
 *   records:array<int, array<string, mixed>>
 * } $summary
 */
function renderStaffCatalogFinishedHatAssistedLinkerSummary(array $summary): string
{
    $lines = [
        'Hilltop Finished Hat Assisted Linking',
        'Mode: ' . ($summary['dry_run'] ? 'dry-run' : 'apply'),
        'Records Processed: ' . $summary['records_processed'],
        'Design Links Proposed: ' . $summary['design_links_proposed'],
        'Hat Links Proposed: ' . $summary['hat_links_proposed'],
        'Material Links Proposed: ' . $summary['material_links_proposed'],
        'Existing Links Preserved: ' . $summary['existing_links_preserved'],
        'Ambiguous Fields: ' . $summary['ambiguous_fields'],
        'Missing Catalog Records: ' . $summary['missing_catalog_records'],
        'Fully Linkable Records: ' . $summary['fully_linkable_records'],
        'Partially Linkable Records: ' . $summary['partially_linkable_records'],
        'Records Receiving No Proposals: ' . $summary['records_receiving_no_proposals'],
        'Updated Records: ' . $summary['updated_records'],
        'Failures: ' . $summary['failures'],
    ];

    foreach ($summary['records'] as $record) {
        $lines[] = '';
        $lines[] = '- ' . (string) ($record['finished_hat_name'] ?? 'Finished Hat');
        $lines[] = '  Current Design: ' . ((string) ($record['current_design_link'] ?? '') !== '' ? (string) $record['current_design_link'] : 'Unlinked');
        $lines[] = '  Proposed Design: ' . ((string) ($record['proposed_design_link'] ?? '') !== '' ? (string) $record['proposed_design_link'] : 'None')
            . ' [' . (string) ($record['design_status'] ?? 'unknown') . '; ' . (string) ($record['design_confidence'] ?? 'review') . ']';
        $lines[] = '  Design Reason: ' . (string) ($record['design_reason'] ?? '');
        $lines[] = '  Current Hat: ' . ((string) ($record['current_hat_link'] ?? '') !== '' ? (string) $record['current_hat_link'] : 'Unlinked');
        $lines[] = '  Proposed Hat: ' . ((string) ($record['proposed_hat_link'] ?? '') !== '' ? (string) $record['proposed_hat_link'] : 'None')
            . ' [' . (string) ($record['hat_status'] ?? 'unknown') . '; ' . (string) ($record['hat_confidence'] ?? 'review') . ']';
        $lines[] = '  Hat Reason: ' . (string) ($record['hat_reason'] ?? '');
        $lines[] = '  Current Material: ' . ((string) ($record['current_material_link'] ?? '') !== '' ? (string) $record['current_material_link'] : 'Unlinked');
        $lines[] = '  Proposed Material: ' . ((string) ($record['proposed_material_link'] ?? '') !== '' ? (string) $record['proposed_material_link'] : 'None')
            . ' [' . (string) ($record['material_status'] ?? 'unknown') . '; ' . (string) ($record['material_confidence'] ?? 'review') . ']';
        $lines[] = '  Material Reason: ' . (string) ($record['material_reason'] ?? '');
        $remaining = is_array($record['remaining_missing_fields'] ?? null) ? array_values($record['remaining_missing_fields']) : [];
        $lines[] = '  Still Needs Linking: ' . ($remaining === [] ? 'No' : implode(', ', $remaining));
        if (!empty($record['updated'])) {
            $lines[] = '  Updated: yes';
        }
        if (!empty($record['update_failed'])) {
            $lines[] = '  Update Failed: ' . (string) ($record['failure_message'] ?? 'Unknown error');
        }
    }

    return implode(PHP_EOL, $lines) . PHP_EOL;
}

function buildStaffCatalogFinishedHatAssistedLinkerUsage(): string
{
    return <<<TEXT
Usage:
  php server/tools/assist-link-finished-hats.php [--apply]

Options:
  --apply     Persist only high-confidence finished hat link proposals locally
  --help      Show this help text

TEXT;
}
