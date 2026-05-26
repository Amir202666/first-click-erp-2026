<?php

return [

    /*
    |--------------------------------------------------------------------------
    | مصادر أسعار الصرف (بالترتيب)
    |--------------------------------------------------------------------------
    | frankfurter: مجاني، يعتمد ECB — لا يدعم KWD وعملات خليجية عدة.
    | open_er_api: مجاني بدون مفتاح — يدعم KWD, SAR, AED, ...
    */
    'providers' => [
        'frankfurter' => 'https://api.frankfurter.app/latest',
        'open_er_api' => 'https://open.er-api.com/v6/latest',
        'er_api_v4' => 'https://api.exchangerate-api.com/v4/latest',
    ],

    'timeout_seconds' => 20,

    /** على بعض السيرفرات (Hostinger) قد يفشل SSL — جرّب false في .env */
    'verify_ssl' => env('EXCHANGE_RATE_VERIFY_SSL', true),

];
