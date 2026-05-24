<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

/**
 * Backward-compatible encrypted cast.
 *
 * - If DB value is encrypted: decrypt it.
 * - If DB value is plaintext (legacy rows): return as-is (or JSON-decode when expecting array).
 * - On set: always encrypt.
 */
class EncryptedOrPlain implements CastsAttributes
{
    public function __construct(private bool $asArray = false) {}

    public static function array(): self
    {
        return new self(true);
    }

    public function get(Model $model, string $key, mixed $value, array $attributes): mixed
    {
        if ($value === null) {
            return null;
        }

        if (! is_string($value)) {
            return $value;
        }

        try {
            $decrypted = Crypt::decryptString($value);
            if ($this->asArray) {
                $decoded = json_decode($decrypted, true);

                return is_array($decoded) ? $decoded : [];
            }

            return $decrypted;
        } catch (\Throwable) {
            // Legacy plaintext in DB.
            if ($this->asArray) {
                $decoded = json_decode($value, true);

                return is_array($decoded) ? $decoded : [];
            }

            return $value;
        }
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): mixed
    {
        if ($value === null) {
            return null;
        }

        if ($this->asArray) {
            $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            return Crypt::encryptString($json === false ? '[]' : $json);
        }

        $s = (string) $value;

        return Crypt::encryptString($s);
    }
}
