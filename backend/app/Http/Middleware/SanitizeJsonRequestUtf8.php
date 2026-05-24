<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * يزيل التسلسلات غير الصالحة من نصوص جسم JSON قبل التحقق والمعالجة.
 * يمنع أخطاء الترميز النادرة ويُكمّل Utf8JsonResponse على الاستجابة.
 */
class SanitizeJsonRequestUtf8
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->isJson() && in_array($request->method(), ['POST', 'PUT', 'PATCH'], true)) {
            $request->replace($this->scrub($request->all()));
        }

        return $next($request);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function scrub(array $data): array
    {
        $out = [];
        foreach ($data as $key => $value) {
            $k = is_string($key) ? $this->cleanStr($key) : $key;
            $out[$k] = $this->scrubValue($value);
        }

        return $out;
    }

    private function scrubValue(mixed $value): mixed
    {
        if (is_string($value)) {
            return $this->cleanStr($value);
        }
        if (is_array($value)) {
            return $this->scrub($value);
        }

        return $value;
    }

    private function cleanStr(string $s): string
    {
        if ($s === '') {
            return $s;
        }

        $clean = mb_convert_encoding($s, 'UTF-8', 'UTF-8');

        return $clean === false ? $s : $clean;
    }
}
