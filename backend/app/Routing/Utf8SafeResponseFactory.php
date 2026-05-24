<?php

namespace App\Routing;

use App\Http\Utf8JsonResponse;
use Illuminate\Routing\ResponseFactory;

/**
 * يمرّر خيارات UTF-8 الآمنة إلى Utf8JsonResponse (تعويض/تجاهل البايتات غير الصالحة).
 */
class Utf8SafeResponseFactory extends ResponseFactory
{
    private const JSON_SAFE_FLAGS = JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_INVALID_UTF8_IGNORE;

    /**
     * @param  mixed  $data
     */
    public function json($data = [], $status = 200, array $headers = [], $options = 0): Utf8JsonResponse
    {
        return new Utf8JsonResponse($data, $status, $headers, $options | self::JSON_SAFE_FLAGS);
    }

    /**
     * @param  mixed  $data
     */
    public function jsonp($callback, $data = [], $status = 200, array $headers = [], $options = 0): Utf8JsonResponse
    {
        return $this->json($data, $status, $headers, $options)->setCallback($callback);
    }
}
