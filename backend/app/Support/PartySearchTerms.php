<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;

/**
 * توليد صيَغ بحث مرنة للعملاء/الموردين: مسافات، دون مسافات، وإسقاط «ال» التعريفية من بداية النص.
 * كل الصيَغ تُستخدم مع LIKE '%…%' (بحث جزئي).
 */
final class PartySearchTerms
{
    /**
     * @return list<string>
     */
    public static function variants(string $raw): array
    {
        $raw = trim($raw);
        if ($raw === '') {
            return [];
        }
        if (class_exists(\Normalizer::class)) {
            $n = \Normalizer::normalize($raw, \Normalizer::FORM_C);
            if ($n !== false) {
                $raw = $n;
            }
        }

        $spaced = preg_replace('/\s+/u', ' ', $raw) ?? $raw;
        $compact = preg_replace('/\s+/u', '', $spaced) ?? $spaced;

        $candidates = array_filter(array_unique([$spaced, $compact]), fn (string $s) => $s !== '');

        $out = [];
        foreach ($candidates as $s) {
            $out[] = $s;
            if (mb_substr($s, 0, 2, 'UTF-8') === 'ال') {
                $rest = mb_substr($s, 2, null, 'UTF-8');
                if ($rest !== '') {
                    $out[] = $rest;
                }
            }
        }

        return array_values(array_unique($out));
    }

    /**
     * @param  Builder<\Illuminate\Database\Eloquent\Model>  $query
     */
    public static function applyCustomerColumns(Builder $query, string $raw): void
    {
        $variants = self::variants($raw);
        if ($variants === []) {
            return;
        }

        $query->where(function ($outer) use ($variants) {
            foreach ($variants as $v) {
                $term = '%'.addcslashes($v, '%_\\').'%';
                $outer->orWhere(function ($inner) use ($term) {
                    $inner->where('name', 'like', $term)
                        ->orWhere('name_en', 'like', $term)
                        ->orWhere('phone', 'like', $term)
                        ->orWhere('company_name', 'like', $term)
                        ->orWhere('code', 'like', $term);
                });
            }
        });
    }

    /**
     * @param  Builder<\Illuminate\Database\Eloquent\Model>  $query
     */
    public static function applyVendorColumns(Builder $query, string $raw): void
    {
        $variants = self::variants($raw);
        if ($variants === []) {
            return;
        }

        $query->where(function ($outer) use ($variants) {
            foreach ($variants as $v) {
                $term = '%'.addcslashes($v, '%_\\').'%';
                $outer->orWhere(function ($inner) use ($term) {
                    $inner->where('name', 'like', $term)
                        ->orWhere('name_en', 'like', $term)
                        ->orWhere('phone', 'like', $term)
                        ->orWhere('company_name', 'like', $term)
                        ->orWhere('code', 'like', $term);
                });
            }
        });
    }
}
