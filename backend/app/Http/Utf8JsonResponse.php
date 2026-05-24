<?php

namespace App\Http;

use Illuminate\Contracts\Support\Arrayable;
use Illuminate\Contracts\Support\Jsonable;
use Illuminate\Http\JsonResponse;
use InvalidArgumentException;
use JsonSerializable;

/**
 * يفرض خيارات ترميز آمنة لـ UTF-8 على كل استجابة JSON، مع تنظيف النصوص المستخرجة من النماذج
 * قبل json_encode (بيانات قديمة من قاعدة البيانات قد تمرّ رغم IGNORE في بعض المسارات الداخلية).
 */
class Utf8JsonResponse extends JsonResponse
{
    /** @see https://wiki.php.net/rfc/json_encode_invalid_utf8 */
    private const BASE_FLAGS = JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_INVALID_UTF8_IGNORE;

    /**
     * @param  mixed  $data
     */
    public function __construct($data = null, int $status = 200, array $headers = [], int $options = 0, bool $json = false)
    {
        parent::__construct($data, $status, $headers, $options | self::BASE_FLAGS, $json);
    }

    private function scrubInvalidUtf8(mixed $value): mixed
    {
        if (is_string($value)) {
            if ($value === '') {
                return $value;
            }
            $clean = mb_convert_encoding($value, 'UTF-8', 'UTF-8');

            return $clean === false ? $value : $clean;
        }
        if (is_array($value)) {
            $out = [];
            foreach ($value as $k => $v) {
                $nk = is_string($k) ? $this->scrubInvalidUtf8($k) : $k;
                $out[$nk] = $this->scrubInvalidUtf8($v);
            }

            return $out;
        }
        if ($value instanceof JsonSerializable) {
            return $this->scrubInvalidUtf8($value->jsonSerialize());
        }
        if ($value instanceof \DateTimeInterface) {
            return $value;
        }
        if ($value instanceof \BackedEnum) {
            return $value->value;
        }

        return $value;
    }

    /**
     * تحويل الحمولة إلى بنية قابلة للترميز مع تنظيف UTF-8 (نفس ترتيب Laravel: Jsonable ثم JsonSerializable ثم Arrayable).
     */
    private function payloadForEncode(mixed $data, int $opts): mixed
    {
        return match (true) {
            $data instanceof Jsonable && $data instanceof JsonSerializable => $this->scrubInvalidUtf8($data->jsonSerialize()),
            $data instanceof Jsonable => $this->scrubInvalidUtf8(json_decode($data->toJson($opts), true)),
            $data instanceof JsonSerializable => $this->scrubInvalidUtf8($data->jsonSerialize()),
            $data instanceof Arrayable => $this->scrubInvalidUtf8($data->toArray()),
            default => is_string($data) ? $this->scrubInvalidUtf8($data) : $data,
        };
    }

    #[\Override]
    public function setData($data = []): static
    {
        $this->original = $data;

        json_decode('[]');

        $this->encodingOptions |= self::BASE_FLAGS;
        $opts = (int) $this->encodingOptions;

        $toEncode = $this->payloadForEncode($data, $opts);
        $this->data = json_encode($toEncode, $opts);

        if (! $this->hasValidJson(json_last_error())) {
            throw new InvalidArgumentException(json_last_error_msg());
        }

        return $this->update();
    }

    #[\Override]
    public function setEncodingOptions($options): static
    {
        $this->encodingOptions = ((int) $options) | self::BASE_FLAGS;

        return $this->setData($this->getData());
    }
}
