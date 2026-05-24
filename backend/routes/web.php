<?php

use Illuminate\Support\Facades\Route;

// إنتاج: تقديم واجهة SPA (يُبنى من frontend ويُنسخ إلى public)
Route::get('/', function () {
    $spa = public_path('index.html');
    if (file_exists($spa)) {
        return response()->file($spa);
    }

    return view('welcome');
});

Route::get('/{any}', function () {
    $spa = public_path('index.html');
    if (file_exists($spa)) {
        return response()->file($spa);
    }
    abort(404);
})->where('any', '.*');
