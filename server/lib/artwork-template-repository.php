<?php
declare(strict_types=1);

namespace Forge\Server;

use JsonException;
use InvalidArgumentException;
use PDO;
use PDOException;

final class PdoArtworkTemplateRepository
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return array<string, array<string, mixed>> */
    public function listActiveRegistrationsByProduct(): array
    {
        try {
            $statement = $this->pdo->query(
                "SELECT
                    r.registration_id,
                    r.product_definition_id,
                    r.family_id,
                    r.selector_type,
                    r.allowed_variants_json,
                    r.resolution_config_json,
                    r.launcher_family_id,
                    r.artwork_label,
                    r.configuration_revision,
                    r.configuration_digest,
                    r.registration_status,
                    v.variant_key,
                    v.validation_status,
                    v.validated_at,
                    v.launcher_profile_label,
                    v.configuration_revision AS validation_revision,
                    v.configuration_digest AS validation_digest,
                    v.validation_error_code
                 FROM forge_artwork_template_registrations r
                 LEFT JOIN forge_artwork_template_validations v
                   ON v.registration_id = r.registration_id
                 WHERE r.registration_status = 'active'
                 ORDER BY r.product_definition_id, v.variant_key"
            );
            $rows = $statement ? $statement->fetchAll() : [];
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Forge artwork-template storage is currently unavailable.', 0, $exception);
        }

        $registrations = [];
        foreach (is_array($rows) ? $rows : [] as $row) {
            if (!is_array($row)) {
                continue;
            }
            $productId = trim((string) ($row['product_definition_id'] ?? ''));
            $registrationId = trim((string) ($row['registration_id'] ?? ''));
            if ($productId === '' || $registrationId === '') {
                continue;
            }
            if (!isset($registrations[$productId])) {
                $registrations[$productId] = [
                    'registration_id' => $registrationId,
                    'product_definition_id' => $productId,
                    'family_id' => trim((string) ($row['family_id'] ?? '')),
                    'selector_type' => trim((string) ($row['selector_type'] ?? '')),
                    'allowed_variants' => decodeArtworkAllowedVariants($row['allowed_variants_json'] ?? null),
                    'resolution_config' => decodeArtworkResolutionConfig($row['resolution_config_json'] ?? null),
                    'launcher_family_id' => trim((string) ($row['launcher_family_id'] ?? '')),
                    'artwork_label' => trim((string) ($row['artwork_label'] ?? '')),
                    'configuration_revision' => (int) ($row['configuration_revision'] ?? 0),
                    'configuration_digest' => strtolower(trim((string) ($row['configuration_digest'] ?? ''))),
                    'registration_status' => trim((string) ($row['registration_status'] ?? '')),
                    'validations' => [],
                ];
            }
            $variantKey = normalizeArtworkVariantKey((string) ($row['variant_key'] ?? ''));
            if ($variantKey !== '') {
                $registrations[$productId]['validations'][$variantKey] = [
                    'validation_status' => trim((string) ($row['validation_status'] ?? '')),
                    'validated_at' => normalizeArtworkValidationTimestamp($row['validated_at'] ?? null),
                    'launcher_profile_label' => trim((string) ($row['launcher_profile_label'] ?? '')),
                    'configuration_revision' => (int) ($row['validation_revision'] ?? 0),
                    'configuration_digest' => strtolower(trim((string) ($row['validation_digest'] ?? ''))),
                    'validation_error_code' => normalizeArtworkErrorCode($row['validation_error_code'] ?? null),
                ];
            }
        }

        return $registrations;
    }

    /** @return array<int, array<string, mixed>> */
    public function listRegistrations(): array
    {
        $byProduct = $this->loadRegistrations(false);
        return array_values($byProduct);
    }

    /** @return array<string, mixed>|null */
    public function getRegistration(string $registrationId): ?array
    {
        foreach ($this->loadRegistrations(false) as $registration) {
            if (($registration['registration_id'] ?? '') === trim($registrationId)) {
                return $registration;
            }
        }
        return null;
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function saveRegistration(array $input): array
    {
        $normalized = normalizeArtworkRegistrationInput($input);
        $existing = $this->getRegistrationByProduct($normalized['product_definition_id']);
        $timestamp = artworkDatabaseTimestamp();
        $registrationId = $existing['registration_id'] ?? createArtworkUuid();
        $revision = $existing ? (int) $existing['configuration_revision'] : 1;
        $digest = hash('sha256', canonicalArtworkConfigurationJson($normalized));
        if ($existing && !hash_equals((string) $existing['configuration_digest'], $digest)) {
            $revision++;
        }
        $status = $existing && ($existing['registration_status'] ?? '') === 'active' ? 'active' : 'inactive';

        try {
            if ($existing) {
                $statement = $this->pdo->prepare('UPDATE forge_artwork_template_registrations SET family_id=:family_id, selector_type=:selector_type, allowed_variants_json=:allowed, resolution_config_json=:resolution, launcher_family_id=:launcher_family_id, artwork_label=:label, configuration_revision=:revision, configuration_digest=:digest, registration_status=:status, updated_at=:updated WHERE registration_id=:id');
            } else {
                $statement = $this->pdo->prepare('INSERT INTO forge_artwork_template_registrations (registration_id, product_definition_id, family_id, selector_type, allowed_variants_json, resolution_config_json, launcher_family_id, artwork_label, configuration_revision, configuration_digest, registration_status, created_at, updated_at) VALUES (:id,:product_id,:family_id,:selector_type,:allowed,:resolution,:launcher_family_id,:label,:revision,:digest,:status,:created,:updated)');
            }
            $parameters = [
                ':id' => $registrationId,
                ':family_id' => $normalized['family_id'],
                ':selector_type' => $normalized['selector_type'],
                ':allowed' => json_encode($normalized['allowed_variants'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                ':resolution' => json_encode($normalized['resolution_config'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                ':launcher_family_id' => $normalized['launcher_family_id'],
                ':label' => $normalized['artwork_label'],
                ':revision' => $revision,
                ':digest' => $digest,
                ':status' => $status,
                ':updated' => $timestamp,
            ];
            if (!$existing) {
                $parameters[':product_id'] = $normalized['product_definition_id'];
                $parameters[':created'] = $timestamp;
            }
            $statement->execute($parameters);
        } catch (PDOException | JsonException $exception) {
            throw new StorageUnavailableException('Artwork template registration could not be saved.', 0, $exception);
        }
        return $this->getRegistration($registrationId) ?? throw new StorageUnavailableException('Artwork template registration could not be loaded.');
    }

    /** @return array<string, mixed> */
    public function setRegistrationActive(string $registrationId, bool $active): array
    {
        try {
            $statement = $this->pdo->prepare('UPDATE forge_artwork_template_registrations SET registration_status=:status, updated_at=:updated WHERE registration_id=:id');
            $statement->execute([':status' => $active ? 'active' : 'inactive', ':updated' => artworkDatabaseTimestamp(), ':id' => trim($registrationId)]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Artwork template status could not be saved.', 0, $exception);
        }
        if ($statement->rowCount() < 1 && $this->getRegistration($registrationId) === null) {
            throw new InvalidArgumentException('That artwork template registration was not found.');
        }
        return $this->getRegistration($registrationId) ?? throw new StorageUnavailableException('Artwork template registration could not be loaded.');
    }

    /** @return array{setup_token:string,expires_at:string,registration:array<string,mixed>} */
    public function issueSetupToken(string $registrationId, int $ttlSeconds = 300): array
    {
        $registration = $this->getRegistration($registrationId);
        if ($registration === null) throw new InvalidArgumentException('That artwork template registration was not found.');
        $token = bin2hex(random_bytes(32));
        $created = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $expires = $created->modify('+' . max(30, min(600, $ttlSeconds)) . ' seconds');
        try {
            $statement = $this->pdo->prepare('INSERT INTO forge_artwork_template_setup_tokens (token_hash,registration_id,configuration_revision,configuration_digest,expires_at,consumed_at,created_at) VALUES (:hash,:id,:revision,:digest,:expires,NULL,:created)');
            $statement->execute([':hash'=>hash('sha256',$token),':id'=>$registrationId,':revision'=>$registration['configuration_revision'],':digest'=>$registration['configuration_digest'],':expires'=>artworkFormatDate($expires),':created'=>artworkFormatDate($created)]);
        } catch (PDOException $exception) { throw new StorageUnavailableException('Artwork setup could not be started.', 0, $exception); }
        return ['setup_token'=>$token,'expires_at'=>$expires->format(\DateTimeInterface::ATOM),'registration'=>$registration];
    }

    /** @return array{report_token:string,expires_at:string,registration:array<string,mixed>} */
    public function exchangeSetupToken(string $token, int $ttlSeconds = 900): array
    {
        $hash = hash('sha256', normalizeArtworkToken($token));
        $now = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        try {
            $this->pdo->beginTransaction();
            $select = $this->pdo->prepare('SELECT * FROM forge_artwork_template_setup_tokens WHERE token_hash=:hash');
            $select->execute([':hash'=>$hash]);
            $row = $select->fetch();
            if (!is_array($row) || $row['consumed_at'] !== null || (string)$row['expires_at'] <= artworkFormatDate($now)) throw new InvalidArgumentException('The artwork setup token is invalid or expired.');
            $consume = $this->pdo->prepare('UPDATE forge_artwork_template_setup_tokens SET consumed_at=:now WHERE token_hash=:hash AND consumed_at IS NULL');
            $consume->execute([':now'=>artworkFormatDate($now),':hash'=>$hash]);
            if ($consume->rowCount() !== 1) throw new InvalidArgumentException('The artwork setup token has already been used.');
            $registration = $this->getRegistration((string)$row['registration_id']);
            if ($registration === null || (int)$registration['configuration_revision'] !== (int)$row['configuration_revision'] || !hash_equals((string)$registration['configuration_digest'], (string)$row['configuration_digest'])) throw new InvalidArgumentException('The artwork registration changed. Start setup again.');
            $reportToken = bin2hex(random_bytes(32));
            $expires = $now->modify('+' . max(60, min(1800, $ttlSeconds)) . ' seconds');
            $insert = $this->pdo->prepare('INSERT INTO forge_artwork_template_report_tokens (token_hash,registration_id,configuration_revision,configuration_digest,expires_at,consumed_at,created_at) VALUES (:hash,:id,:revision,:digest,:expires,NULL,:created)');
            $insert->execute([':hash'=>hash('sha256',$reportToken),':id'=>$registration['registration_id'],':revision'=>$registration['configuration_revision'],':digest'=>$registration['configuration_digest'],':expires'=>artworkFormatDate($expires),':created'=>artworkFormatDate($now)]);
            $this->pdo->commit();
            return ['report_token'=>$reportToken,'expires_at'=>$expires->format(\DateTimeInterface::ATOM),'registration'=>$registration];
        } catch (InvalidArgumentException $exception) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        } catch (PDOException $exception) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw new StorageUnavailableException('Artwork setup could not be verified.', 0, $exception);
        }
    }

    /** @param array<int,array<string,mixed>> $results @return array<string,mixed> */
    public function reportValidation(string $token, string $profileLabel, array $results): array
    {
        $hash = hash('sha256', normalizeArtworkToken($token));
        $profile = normalizeArtworkSafeLabel($profileLabel, 128, 'A launcher profile label is required.');
        $now = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        try {
            $this->pdo->beginTransaction();
            $select = $this->pdo->prepare('SELECT * FROM forge_artwork_template_report_tokens WHERE token_hash=:hash');
            $select->execute([':hash'=>$hash]);
            $row = $select->fetch();
            if (!is_array($row) || $row['consumed_at'] !== null || (string)$row['expires_at'] <= artworkFormatDate($now)) throw new InvalidArgumentException('The artwork validation report token is invalid or expired.');
            $registration = $this->getRegistration((string)$row['registration_id']);
            if ($registration === null || (int)$registration['configuration_revision'] !== (int)$row['configuration_revision'] || !hash_equals((string)$registration['configuration_digest'], (string)$row['configuration_digest'])) throw new InvalidArgumentException('The artwork registration changed. Validation was not saved.');
            $allowed = $registration['allowed_variants'];
            if ($results === []) throw new InvalidArgumentException('At least one validation result is required.');
            $seen = [];
            foreach ($results as $result) {
                if (!is_array($result)) throw new InvalidArgumentException('A validation result is invalid.');
                $key = normalizeArtworkVariantKey((string)($result['variant_key'] ?? ''));
                if ($key === '' || !isset($allowed[$key]) || isset($seen[$key])) throw new InvalidArgumentException('A validation result is outside the configured variants.');
                $seen[$key] = true;
                $valid = ($result['status'] ?? '') === 'valid';
                $error = $valid ? null : normalizeArtworkReportedError($result['error_code'] ?? null);
                $upsertSql = 'INSERT INTO forge_artwork_template_validations (registration_id,variant_key,validation_status,validated_at,launcher_profile_label,configuration_revision,configuration_digest,validation_error_code,updated_at) VALUES (:id,:variant,:status,:validated,:profile,:revision,:digest,:error,:updated)';
                $upsertSql .= $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
                    ? ' ON CONFLICT(registration_id,variant_key) DO UPDATE SET validation_status=excluded.validation_status,validated_at=excluded.validated_at,launcher_profile_label=excluded.launcher_profile_label,configuration_revision=excluded.configuration_revision,configuration_digest=excluded.configuration_digest,validation_error_code=excluded.validation_error_code,updated_at=excluded.updated_at'
                    : ' ON DUPLICATE KEY UPDATE validation_status=VALUES(validation_status),validated_at=VALUES(validated_at),launcher_profile_label=VALUES(launcher_profile_label),configuration_revision=VALUES(configuration_revision),configuration_digest=VALUES(configuration_digest),validation_error_code=VALUES(validation_error_code),updated_at=VALUES(updated_at)';
                $upsert = $this->pdo->prepare($upsertSql);
                $upsert->execute([':id'=>$registration['registration_id'],':variant'=>$key,':status'=>$valid?'valid':'invalid',':validated'=>artworkFormatDate($now),':profile'=>$profile,':revision'=>$registration['configuration_revision'],':digest'=>$registration['configuration_digest'],':error'=>$error,':updated'=>artworkFormatDate($now)]);
            }
            $consume = $this->pdo->prepare('UPDATE forge_artwork_template_report_tokens SET consumed_at=:now WHERE token_hash=:hash AND consumed_at IS NULL');
            $consume->execute([':now'=>artworkFormatDate($now),':hash'=>$hash]);
            if ($consume->rowCount() !== 1) throw new InvalidArgumentException('The artwork validation report token has already been used.');
            $this->pdo->commit();
            return $this->getRegistration((string)$row['registration_id']) ?? throw new StorageUnavailableException('Artwork validation could not be loaded.');
        } catch (InvalidArgumentException $exception) { if ($this->pdo->inTransaction()) $this->pdo->rollBack(); throw $exception; }
        catch (PDOException $exception) { if ($this->pdo->inTransaction()) $this->pdo->rollBack(); throw new StorageUnavailableException('Artwork validation could not be saved.',0,$exception); }
    }

    /** @return array<string,array<string,mixed>> */
    private function loadRegistrations(bool $activeOnly): array
    {
        $where = $activeOnly ? " WHERE r.registration_status='active'" : '';
        try {
            $statement = $this->pdo->query('SELECT r.*,v.variant_key,v.validation_status,v.validated_at,v.launcher_profile_label,v.configuration_revision AS validation_revision,v.configuration_digest AS validation_digest,v.validation_error_code FROM forge_artwork_template_registrations r LEFT JOIN forge_artwork_template_validations v ON v.registration_id=r.registration_id'.$where.' ORDER BY r.product_definition_id,v.variant_key');
            $rows = $statement ? $statement->fetchAll() : [];
        } catch (PDOException $exception) { throw new StorageUnavailableException('Forge artwork-template storage is currently unavailable.',0,$exception); }
        return hydrateArtworkRegistrations(is_array($rows)?$rows:[]);
    }

    /** @return array<string,mixed>|null */
    private function getRegistrationByProduct(string $productId): ?array
    {
        $registrations = $this->loadRegistrations(false);
        return $registrations[$productId] ?? null;
    }
}

/** @return array<string, string> */
function decodeArtworkAllowedVariants($json): array
{
    if (!is_string($json) || trim($json) === '') {
        return [];
    }
    try {
        $decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        throw new StorageUnavailableException('Forge artwork-template configuration is invalid.', 0, $exception);
    }
    return normalizeArtworkAllowedVariants($decoded);
}

function normalizeArtworkValidationTimestamp($value): ?string
{
    $normalized = is_string($value) ? trim($value) : '';
    if ($normalized === '') {
        return null;
    }
    if (strpos($normalized, 'T') !== false) {
        return $normalized;
    }
    return OrderPayload::databaseDateTimeToIso8601($normalized);
}

/** @return array<string,mixed> */
function decodeArtworkResolutionConfig($json): array
{
    if (!is_string($json) || trim($json)==='') return [];
    try { $decoded=json_decode($json,true,512,JSON_THROW_ON_ERROR); }
    catch (JsonException $exception) { throw new StorageUnavailableException('Forge artwork-template configuration is invalid.',0,$exception); }
    return is_array($decoded)?$decoded:[];
}

/** @param array<int,mixed> $rows @return array<string,array<string,mixed>> */
function hydrateArtworkRegistrations(array $rows): array
{
    $registrations=[];
    foreach($rows as $row){
        if(!is_array($row))continue;
        $product=trim((string)($row['product_definition_id']??'')); $id=trim((string)($row['registration_id']??''));
        if($product===''||$id==='')continue;
        if(!isset($registrations[$product]))$registrations[$product]=[
            'registration_id'=>$id,'product_definition_id'=>$product,'family_id'=>(string)$row['family_id'],'selector_type'=>(string)$row['selector_type'],
            'allowed_variants'=>decodeArtworkAllowedVariants($row['allowed_variants_json']??null),'resolution_config'=>decodeArtworkResolutionConfig($row['resolution_config_json']??null),
            'launcher_family_id'=>(string)$row['launcher_family_id'],'artwork_label'=>(string)$row['artwork_label'],'configuration_revision'=>(int)$row['configuration_revision'],
            'configuration_digest'=>(string)$row['configuration_digest'],'registration_status'=>(string)$row['registration_status'],'validations'=>[]];
        $key=normalizeArtworkVariantKey((string)($row['variant_key']??''));
        if($key!=='')$registrations[$product]['validations'][$key]=['validation_status'=>(string)$row['validation_status'],'validated_at'=>normalizeArtworkValidationTimestamp($row['validated_at']??null),'launcher_profile_label'=>(string)$row['launcher_profile_label'],'configuration_revision'=>(int)$row['validation_revision'],'configuration_digest'=>(string)$row['validation_digest'],'validation_error_code'=>normalizeArtworkErrorCode($row['validation_error_code']??null)];
    }
    return $registrations;
}

/** @param array<string,mixed> $input @return array<string,mixed> */
function normalizeArtworkRegistrationInput(array $input): array
{
    $product=trim((string)($input['product_definition_id']??''));
    $ornaments=['tree_ornament','antler_ornament','babys_first_christmas','mr_and_mrs_christmas','little_reindeer_letter','present_stack','grinch_tree','large_tree_frame','veteran_flag'];
    if(!in_array($product,$ornaments,true))throw new InvalidArgumentException('Select a canonical Forge ornament product.');
    $selector=trim((string)($input['selector_type']??''));
    if(!in_array($selector,['none','size','personalization_count'],true))throw new InvalidArgumentException('Select a valid artwork template type.');
    $allowed=normalizeArtworkAllowedVariants($input['allowed_variants']??[]);
    $resolution=is_array($input['resolution_config']??null)?$input['resolution_config']:[];
    if($selector==='none'){
        $allowed=['single'=>normalizeArtworkSafeLabel($allowed['single']??($input['artwork_label']??'Single Master'),255,'A single-master label is required.')];
        $resolution=['filename'=>normalizeArtworkMasterFilename($resolution['filename']??null)];
    }elseif($selector==='size'){
        if($allowed===[])throw new InvalidArgumentException('At least one size is required.');
        $filenames=is_array($resolution['filenames']??null)?$resolution['filenames']:[]; $normalizedFiles=[];
        foreach($allowed as $key=>$label)$normalizedFiles[$key]=normalizeArtworkMasterFilename($filenames[$key]??null);
        $resolution=['filenames'=>$normalizedFiles];
    }else{
        if($allowed===[])throw new InvalidArgumentException('At least one personalization count is required.');
        foreach(array_keys($allowed) as $key)if(!ctype_digit((string)$key)||(int)$key<1||(int)$key>250)throw new InvalidArgumentException('Personalization counts must be between 1 and 250.');
        $pattern=trim((string)($resolution['pattern']??''));
        if(substr_count($pattern,'{count}')!==1||preg_match('/\{(?!count\})[^}]*\}/',$pattern)||strpos($pattern,'/')!==false||strpos($pattern,'\\')!==false||!preg_match('/\.ai$/i',$pattern))throw new InvalidArgumentException('The count filename pattern must contain only one {count} placeholder and end in .ai.');
        $resolution=['pattern'=>$pattern];
    }
    $family=normalizeArtworkSafeIdentifier($input['family_id']??($product.'-artwork'));
    $launcher=normalizeArtworkSafeIdentifier($input['launcher_family_id']??$family);
    $label=normalizeArtworkSafeLabel($input['artwork_label']??$product,255,'An artwork label is required.');
    return ['product_definition_id'=>$product,'family_id'=>$family,'selector_type'=>$selector,'allowed_variants'=>$allowed,'resolution_config'=>$resolution,'launcher_family_id'=>$launcher,'artwork_label'=>$label];
}

function normalizeArtworkMasterFilename($value): string
{
    $filename=trim((string)$value);
    if($filename===''||$filename!==basename($filename)||strpos($filename,"\0")!==false||!preg_match('/\.ai$/i',$filename))throw new InvalidArgumentException('Each expected master must be an exact .ai filename.');
    return $filename;
}
function normalizeArtworkSafeIdentifier($value): string { $v=strtolower(trim((string)$value)); if(!preg_match('/^[a-z0-9][a-z0-9_-]{1,127}$/',$v))throw new InvalidArgumentException('A stable artwork family identifier is required.'); return $v; }
function normalizeArtworkSafeLabel($value,int $max,string $message): string { $v=trim((string)$value); if($v===''||strlen($v)>$max)throw new InvalidArgumentException($message); return $v; }
function normalizeArtworkToken(string $token): string { $v=trim($token); if(!preg_match('/^[a-f0-9]{64}$/',$v))throw new InvalidArgumentException('The artwork setup token is invalid or expired.'); return $v; }
function normalizeArtworkReportedError($value): string { $v=normalizeArtworkErrorCode($value); $allowed=['master_missing','outside_approved_root','symlink_rejected','not_regular_file','invalid_file_type','filename_mismatch','not_readable','configuration_mismatch']; return $v!==null&&in_array($v,$allowed,true)?$v:'validation_failed'; }
function canonicalArtworkConfigurationJson(array $normalized): string { $copy=$normalized; ksort($copy); $copy['allowed_variants']=array_replace([], $copy['allowed_variants']); ksort($copy['allowed_variants']); if(isset($copy['resolution_config']['filenames']))ksort($copy['resolution_config']['filenames']); return json_encode($copy,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES); }
function artworkDatabaseTimestamp(): string { return artworkFormatDate(new \DateTimeImmutable('now',new \DateTimeZone('UTC'))); }
function artworkFormatDate(\DateTimeImmutable $date): string { return $date->format('Y-m-d H:i:s.u'); }
function createArtworkUuid(): string { $b=random_bytes(16);$b[6]=chr((ord($b[6])&0x0f)|0x40);$b[8]=chr((ord($b[8])&0x3f)|0x80);$h=bin2hex($b);return substr($h,0,8).'-'.substr($h,8,4).'-'.substr($h,12,4).'-'.substr($h,16,4).'-'.substr($h,20); }
