<?php

return [
    /*
    | مدة تخزين تنبيهات النواقص في الكاش (بالدقائق).
    | المهمة الخلفية inventory:low-stock-alerts تحدّث هذا الكاش لكل شركة.
    */
    'low_stock_cache_ttl' => (int) (env('INVENTORY_LOW_STOCK_CACHE_TTL', 15)),
];
