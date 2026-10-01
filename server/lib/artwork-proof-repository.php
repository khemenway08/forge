<?php
declare(strict_types=1);

namespace Forge\Server;

use InvalidArgumentException;
use PDO;
use PDOException;

final class ArtworkProofConflictException extends \RuntimeException {}
final class ArtworkProofNotFoundException extends \RuntimeException {}

final class PdoArtworkProofRepository
{
    private const MAX_PREVIEW_BYTES = 4194304;
    private const TERMINAL_STATUSES = ['completed', 'packed', 'shipped', 'picked_up', 'cancelled'];

    public function __construct(private PDO $pdo) {}

    /** @return array<string,mixed> */
    public function issueProofToken(string $orderUuid, string $lineId, int $ttlSeconds = 300): array
    {
        [$orderUuid, $lineId] = normalizeArtworkProofIdentity($orderUuid, $lineId);
        $association = $this->loadAssociationForLine($orderUuid, $lineId, true);
        $proof = $this->loadProof((string) $association['artwork_file_id']);
        $revision = (int) ($proof['preview_revision'] ?? 0);
        $token = bin2hex(random_bytes(32));
        $now = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $expires = $now->modify('+' . max(30, min(600, $ttlSeconds)) . ' seconds');
        try {
            $statement = $this->pdo->prepare('INSERT INTO forge_artwork_proof_tokens (token_hash,token_type,artwork_file_id,expected_preview_revision,expires_at,consumed_at,created_at) VALUES (:hash,:type,:artwork,:revision,:expires,NULL,:created)');
            $statement->execute([
                ':hash' => hash('sha256', 'proof-start:' . $token),
                ':type' => 'start',
                ':artwork' => $association['artwork_file_id'],
                ':revision' => $revision,
                ':expires' => artworkFormatDate($expires),
                ':created' => artworkFormatDate($now),
            ]);
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Artwork proofing could not be started.', 0, $exception);
        }
        return [
            'proof_token' => $token,
            'expires_at' => $expires->format(\DateTimeInterface::ATOM),
            'association' => publicArtworkAssociation($association),
            'proof' => publicArtworkProof($proof, (string) $association['artwork_file_id']),
        ];
    }

    /** @return array<string,mixed> */
    public function exchangeProofToken(string $token): array
    {
        $hash = hash('sha256', 'proof-start:' . normalizeArtworkToken($token));
        $now = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        try {
            $this->pdo->beginTransaction();
            $tokenRow = $this->loadToken($hash, 'start', $now);
            $association = $this->loadAssociationById((string) $tokenRow['artwork_file_id'], true);
            $proof = $this->loadProof((string) $association['artwork_file_id']);
            if ((int) ($proof['preview_revision'] ?? 0) !== (int) $tokenRow['expected_preview_revision']) {
                throw new ArtworkProofConflictException('The artwork proof changed. Refresh Forge and try again.');
            }
            $this->consumeToken($hash, $now);
            $reportToken = bin2hex(random_bytes(32));
            $expires = $now->modify('+10 minutes');
            $statement = $this->pdo->prepare('INSERT INTO forge_artwork_proof_tokens (token_hash,token_type,artwork_file_id,expected_preview_revision,expires_at,consumed_at,created_at) VALUES (:hash,:type,:artwork,:revision,:expires,NULL,:created)');
            $statement->execute([
                ':hash' => hash('sha256', 'proof-report:' . $reportToken),
                ':type' => 'report',
                ':artwork' => $association['artwork_file_id'],
                ':revision' => (int) $tokenRow['expected_preview_revision'],
                ':expires' => artworkFormatDate($expires),
                ':created' => artworkFormatDate($now),
            ]);
            $this->pdo->commit();
            return [
                'report_token' => $reportToken,
                'expires_at' => $expires->format(\DateTimeInterface::ATOM),
                'artwork' => publicArtworkAssociation($association),
            ];
        } catch (InvalidArgumentException|ArtworkProofConflictException|ArtworkProofNotFoundException $exception) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        } catch (PDOException $exception) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw new StorageUnavailableException('Artwork proofing could not be verified.', 0, $exception);
        }
    }

    /** @return array<string,mixed> */
    public function reportProof(string $token, string $profile, string $sourceHash, string $previewHash, int $width, int $height, string $previewBase64): array
    {
        $tokenHash = hash('sha256', 'proof-report:' . normalizeArtworkToken($token));
        $profile = normalizeArtworkSafeLabel($profile, 128, 'A launcher profile label is required.');
        $sourceHash = normalizeArtworkProofHash($sourceHash, 'A valid LIVE artwork hash is required.');
        $previewHash = normalizeArtworkProofHash($previewHash, 'A valid proof preview hash is required.');
        $preview = base64_decode($previewBase64, true);
        if (!is_string($preview) || $preview === '' || strlen($preview) > self::MAX_PREVIEW_BYTES || !str_starts_with($preview, "\x89PNG\r\n\x1a\n")) {
            throw new InvalidArgumentException('A valid PNG proof preview is required.');
        }
        if (!hash_equals($previewHash, hash('sha256', $preview))) throw new InvalidArgumentException('The proof preview hash does not match its contents.');
        $info = @getimagesizefromstring($preview);
        if (!is_array($info) || ($info['mime'] ?? '') !== 'image/png' || (int) ($info[0] ?? 0) !== $width || (int) ($info[1] ?? 0) !== $height || $width < 1 || $height < 1 || $width > 4096 || $height > 4096) {
            throw new InvalidArgumentException('The proof preview dimensions are invalid.');
        }
        $now = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        try {
            $this->pdo->beginTransaction();
            $tokenRow = $this->loadToken($tokenHash, 'report', $now);
            $association = $this->loadAssociationById((string) $tokenRow['artwork_file_id'], true);
            $proof = $this->loadProof((string) $association['artwork_file_id']);
            if ((int) ($proof['preview_revision'] ?? 0) !== (int) $tokenRow['expected_preview_revision']) {
                throw new ArtworkProofConflictException('The artwork proof changed before the preview was received.');
            }
            $proofId = is_array($proof) ? (string) $proof['proof_id'] : createArtworkUuid();
            $revision = (int) $tokenRow['expected_preview_revision'] + 1;
            if ($proof === null) {
                $statement = $this->pdo->prepare('INSERT INTO forge_artwork_proofs (proof_id,artwork_file_id,preview_revision,preview_status,source_live_sha256,preview_sha256,preview_mime_type,preview_width,preview_height,preview_bytes,rendered_at,renderer_profile_label,proof_status,correction_note,decided_at,decided_by,created_at,updated_at) VALUES (:proof,:artwork,:revision,:preview_status,:source_hash,:preview_hash,:mime,:width,:height,:bytes,:rendered,:profile,:proof_status,NULL,NULL,NULL,:created,:updated)');
            } else {
                $statement = $this->pdo->prepare('UPDATE forge_artwork_proofs SET preview_revision=:revision,preview_status=:preview_status,source_live_sha256=:source_hash,preview_sha256=:preview_hash,preview_mime_type=:mime,preview_width=:width,preview_height=:height,preview_bytes=:bytes,rendered_at=:rendered,renderer_profile_label=:profile,proof_status=:proof_status,decided_at=NULL,decided_by=NULL,updated_at=:updated WHERE proof_id=:proof');
            }
            $statement->bindValue(':proof', $proofId);
            if ($proof === null) $statement->bindValue(':artwork', $association['artwork_file_id']);
            $statement->bindValue(':revision', $revision, PDO::PARAM_INT);
            $statement->bindValue(':preview_status', 'ready');
            $statement->bindValue(':source_hash', $sourceHash);
            $statement->bindValue(':preview_hash', $previewHash);
            $statement->bindValue(':mime', 'image/png');
            $statement->bindValue(':width', $width, PDO::PARAM_INT);
            $statement->bindValue(':height', $height, PDO::PARAM_INT);
            $statement->bindValue(':bytes', $preview, PDO::PARAM_LOB);
            $statement->bindValue(':rendered', artworkFormatDate($now));
            $statement->bindValue(':profile', $profile);
            $statement->bindValue(':proof_status', 'waiting_for_proof');
            if ($proof === null) $statement->bindValue(':created', artworkFormatDate($now));
            $statement->bindValue(':updated', artworkFormatDate($now));
            $statement->execute();
            $this->insertEvent($proofId, 'preview_created', $revision, null, $profile, $now);
            $this->consumeToken($tokenHash, $now);
            $this->pdo->commit();
            return publicArtworkProof($this->loadProof((string) $association['artwork_file_id']), (string) $association['artwork_file_id']);
        } catch (InvalidArgumentException|ArtworkProofConflictException|ArtworkProofNotFoundException $exception) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        } catch (PDOException $exception) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw new StorageUnavailableException('The artwork proof preview could not be saved.', 0, $exception);
        }
    }

    /** @return array<string,mixed> */
    public function getProofContext(string $orderUuid, string $lineId): array
    {
        [$orderUuid, $lineId] = normalizeArtworkProofIdentity($orderUuid, $lineId);
        try {
            $association = $this->loadAssociationForLine($orderUuid, $lineId, false);
            $proof = $this->loadProof((string) $association['artwork_file_id']);
            return [
                'association' => publicArtworkAssociation($association),
                'proof' => publicArtworkProof($proof, (string) $association['artwork_file_id']),
                'history' => $proof === null ? [] : $this->loadEvents((string) $proof['proof_id']),
                'can_update' => !in_array(normalizeArtworkProofOrderStatus($association['production_status'] ?? null), self::TERMINAL_STATUSES, true),
            ];
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('Artwork proofing could not be loaded.', 0, $exception);
        }
    }

    /** @return array<string,mixed> */
    public function saveDecision(string $orderUuid, string $lineId, string $status, ?string $note, string $staffIdentity, int $expectedRevision): array
    {
        [$orderUuid, $lineId] = normalizeArtworkProofIdentity($orderUuid, $lineId);
        $status = strtolower(trim($status));
        if (!in_array($status, ['approved', 'correction_needed'], true)) throw new InvalidArgumentException('Choose a valid proof decision.');
        $staffIdentity = normalizeArtworkSafeLabel($staffIdentity, 128, 'Enter the staff name for this proof decision.');
        $note = trim((string) $note);
        if ($status === 'correction_needed' && $note === '') throw new InvalidArgumentException('Enter a short correction note.');
        if (strlen($note) > 1000) throw new InvalidArgumentException('Correction notes must be 1000 characters or fewer.');
        if ($expectedRevision < 1) throw new InvalidArgumentException('A current proof preview is required.');
        $now = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        try {
            $this->pdo->beginTransaction();
            $association = $this->loadAssociationForLine($orderUuid, $lineId, true);
            $proof = $this->loadProof((string) $association['artwork_file_id']);
            if ($proof === null || $proof['preview_status'] !== 'ready' || (int) $proof['preview_revision'] !== $expectedRevision) {
                throw new ArtworkProofConflictException('The proof preview changed. Refresh it before recording a decision.');
            }
            $statement = $this->pdo->prepare('UPDATE forge_artwork_proofs SET proof_status=:status,correction_note=:note,decided_at=:decided,decided_by=:staff,updated_at=:updated WHERE proof_id=:proof AND preview_revision=:revision');
            $statement->execute([
                ':status' => $status,
                ':note' => $status === 'correction_needed' ? $note : null,
                ':decided' => artworkFormatDate($now),
                ':staff' => $staffIdentity,
                ':updated' => artworkFormatDate($now),
                ':proof' => $proof['proof_id'],
                ':revision' => $expectedRevision,
            ]);
            if ($statement->rowCount() !== 1) throw new ArtworkProofConflictException('The proof preview changed. Refresh it before recording a decision.');
            $this->insertEvent((string) $proof['proof_id'], $status, $expectedRevision, $status === 'correction_needed' ? $note : null, $staffIdentity, $now);
            $this->pdo->commit();
            $updated = $this->loadProof((string) $association['artwork_file_id']);
            return [
                'proof' => publicArtworkProof($updated, (string) $association['artwork_file_id']),
                'history' => $this->loadEvents((string) $proof['proof_id']),
            ];
        } catch (InvalidArgumentException|ArtworkProofConflictException|ArtworkProofNotFoundException $exception) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        } catch (PDOException $exception) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw new StorageUnavailableException('The proof decision could not be saved.', 0, $exception);
        }
    }

    /** @return array{bytes:string,mime_type:string,sha256:string} */
    public function loadPreview(string $artworkFileId): array
    {
        $artworkFileId = normalizeArtworkProofUuid($artworkFileId, 'A valid artwork file is required.');
        try {
            $statement = $this->pdo->prepare("SELECT p.preview_bytes,p.preview_mime_type,p.preview_sha256 FROM forge_artwork_proofs p INNER JOIN forge_order_artwork_files a ON a.artwork_file_id=p.artwork_file_id WHERE p.artwork_file_id=:id AND p.preview_status='ready' AND p.preview_bytes IS NOT NULL AND a.preparation_status='prepared' LIMIT 1");
            $statement->execute([':id' => $artworkFileId]);
            $row = $statement->fetch();
            if (!is_array($row) || !is_string($row['preview_bytes'] ?? null)) throw new ArtworkProofNotFoundException('That proof preview is not available.');
            return ['bytes' => $row['preview_bytes'], 'mime_type' => 'image/png', 'sha256' => (string) $row['preview_sha256']];
        } catch (ArtworkProofNotFoundException $exception) {
            throw $exception;
        } catch (PDOException $exception) {
            throw new StorageUnavailableException('The proof preview could not be loaded.', 0, $exception);
        }
    }

    /** @return array<string,mixed> */
    private function loadToken(string $hash, string $type, \DateTimeImmutable $now): array
    {
        $statement = $this->pdo->prepare('SELECT * FROM forge_artwork_proof_tokens WHERE token_hash=:hash AND token_type=:type LIMIT 1');
        $statement->execute([':hash' => $hash, ':type' => $type]);
        $row = $statement->fetch();
        if (!is_array($row) || $row['consumed_at'] !== null || (string) $row['expires_at'] <= artworkFormatDate($now)) throw new InvalidArgumentException('The artwork proof token is invalid or expired.');
        return $row;
    }

    private function consumeToken(string $hash, \DateTimeImmutable $now): void
    {
        $statement = $this->pdo->prepare('UPDATE forge_artwork_proof_tokens SET consumed_at=:now WHERE token_hash=:hash AND consumed_at IS NULL');
        $statement->execute([':now' => artworkFormatDate($now), ':hash' => $hash]);
        if ($statement->rowCount() !== 1) throw new InvalidArgumentException('The artwork proof token has already been used.');
    }

    /** @return array<string,mixed> */
    private function loadAssociationForLine(string $orderUuid, string $lineId, bool $requireActive): array
    {
        $statement = $this->pdo->prepare('SELECT a.*,o.production_status FROM forge_order_artwork_files a INNER JOIN forge_orders o ON o.forge_order_uuid=a.forge_order_uuid WHERE a.forge_order_uuid=:uuid AND a.line_id=:line LIMIT 1');
        $statement->execute([':uuid' => $orderUuid, ':line' => $lineId]);
        $row = $statement->fetch();
        return $this->validateAssociation($row, $requireActive);
    }

    /** @return array<string,mixed> */
    private function loadAssociationById(string $artworkFileId, bool $requireActive): array
    {
        $statement = $this->pdo->prepare('SELECT a.*,o.production_status FROM forge_order_artwork_files a INNER JOIN forge_orders o ON o.forge_order_uuid=a.forge_order_uuid WHERE a.artwork_file_id=:id LIMIT 1');
        $statement->execute([':id' => $artworkFileId]);
        $row = $statement->fetch();
        return $this->validateAssociation($row, $requireActive);
    }

    /** @return array<string,mixed> */
    private function validateAssociation($row, bool $requireActive): array
    {
        if (!is_array($row)) throw new ArtworkProofNotFoundException('That prepared artwork association could not be found.');
        if ((string) ($row['preparation_status'] ?? '') !== 'prepared') throw new ArtworkProofConflictException('Prepare the customer LIVE artwork before creating a proof.');
        if ($requireActive && in_array(normalizeArtworkProofOrderStatus($row['production_status'] ?? null), self::TERMINAL_STATUSES, true)) {
            throw new ArtworkProofConflictException('Proof decisions cannot be changed for a terminal order.');
        }
        return $row;
    }

    /** @return array<string,mixed>|null */
    private function loadProof(string $artworkFileId): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM forge_artwork_proofs WHERE artwork_file_id=:id LIMIT 1');
        $statement->execute([':id' => $artworkFileId]);
        $row = $statement->fetch();
        return is_array($row) ? $row : null;
    }

    /** @return array<int,array<string,mixed>> */
    private function loadEvents(string $proofId): array
    {
        $statement = $this->pdo->prepare('SELECT event_type,preview_revision,note,staff_identity,created_at FROM forge_artwork_proof_events WHERE proof_id=:proof ORDER BY created_at DESC,proof_event_id DESC');
        $statement->execute([':proof' => $proofId]);
        return array_map(static fn(array $row): array => [
            'event_type' => (string) $row['event_type'],
            'preview_revision' => (int) $row['preview_revision'],
            'note' => normalizeArtworkProofOptionalLabel($row['note'] ?? null),
            'staff_identity' => normalizeArtworkProofOptionalLabel($row['staff_identity'] ?? null),
            'created_at' => normalizeArtworkValidationTimestamp($row['created_at'] ?? null),
        ], array_values(array_filter($statement->fetchAll() ?: [], 'is_array')));
    }

    private function insertEvent(string $proofId, string $type, int $revision, ?string $note, ?string $identity, \DateTimeImmutable $now): void
    {
        $statement = $this->pdo->prepare('INSERT INTO forge_artwork_proof_events (proof_event_id,proof_id,event_type,preview_revision,note,staff_identity,created_at) VALUES (:id,:proof,:type,:revision,:note,:identity,:created)');
        $statement->execute([':id' => createArtworkUuid(), ':proof' => $proofId, ':type' => $type, ':revision' => $revision, ':note' => $note, ':identity' => $identity, ':created' => artworkFormatDate($now)]);
    }
}

/** @return array{0:string,1:string} */
function normalizeArtworkProofIdentity(string $orderUuid, string $lineId): array
{
    return [normalizeArtworkProofUuid($orderUuid, 'A valid Forge order is required.'), normalizeArtworkSafeLabel($lineId, 128, 'A valid order item is required.')];
}

function normalizeArtworkProofUuid(string $value, string $message): string
{
    $value = strtolower(trim($value));
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $value)) throw new InvalidArgumentException($message);
    return $value;
}

function normalizeArtworkProofHash(string $value, string $message): string
{
    $value = strtolower(trim($value));
    if (!preg_match('/^[a-f0-9]{64}$/', $value)) throw new InvalidArgumentException($message);
    return $value;
}

function normalizeArtworkProofOrderStatus($value): string
{
    $value = strtolower(trim((string) $value));
    return $value === '' ? 'submitted' : $value;
}

/** @return array<string,mixed> */
function publicArtworkProof(?array $row, string $artworkFileId): array
{
    $ready = is_array($row) && ($row['preview_status'] ?? '') === 'ready' && (int) ($row['preview_revision'] ?? 0) > 0;
    $revision = is_array($row) ? (int) ($row['preview_revision'] ?? 0) : 0;
    return [
        'proof_id' => is_array($row) ? (string) ($row['proof_id'] ?? '') : '',
        'status' => is_array($row) ? (string) ($row['proof_status'] ?? 'waiting_for_proof') : 'waiting_for_proof',
        'preview_status' => is_array($row) ? (string) ($row['preview_status'] ?? 'not_generated') : 'not_generated',
        'preview_revision' => $revision,
        'preview_url' => $ready ? '/api/v1/staff/artwork-proof-preview.php?artwork_file_id=' . rawurlencode($artworkFileId) . '&revision=' . $revision : null,
        'source_live_sha256' => $ready ? (string) ($row['source_live_sha256'] ?? '') : null,
        'preview_sha256' => $ready ? (string) ($row['preview_sha256'] ?? '') : null,
        'preview_width' => $ready ? (int) ($row['preview_width'] ?? 0) : null,
        'preview_height' => $ready ? (int) ($row['preview_height'] ?? 0) : null,
        'rendered_at' => is_array($row) ? normalizeArtworkValidationTimestamp($row['rendered_at'] ?? null) : null,
        'renderer_profile_label' => is_array($row) ? normalizeArtworkProofOptionalLabel($row['renderer_profile_label'] ?? null) : null,
        'correction_note' => is_array($row) ? normalizeArtworkProofOptionalLabel($row['correction_note'] ?? null) : null,
        'decided_at' => is_array($row) ? normalizeArtworkValidationTimestamp($row['decided_at'] ?? null) : null,
        'decided_by' => is_array($row) ? normalizeArtworkProofOptionalLabel($row['decided_by'] ?? null) : null,
    ];
}

function normalizeArtworkProofOptionalLabel($value): ?string
{
    $value = trim((string) $value);
    return $value === '' ? null : $value;
}
