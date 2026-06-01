<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const PATH_INDEX = 'accounts_tenant_id_path_index';

    public function up(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            if (! Schema::hasColumn('accounts', 'path')) {
                $table->string('path', 1000)->nullable()->after('level');
            }
            if (! Schema::hasColumn('accounts', 'is_group')) {
                $table->boolean('is_group')->default(false)->after('is_postable');
            }
            if (! Schema::hasColumn('accounts', 'opening_balance')) {
                $table->decimal('opening_balance', 18, 4)->default(0)->after('currency');
            }
            if (! Schema::hasColumn('accounts', 'sort_order')) {
                $table->integer('sort_order')->default(0)->after('opening_balance');
            }
            if (! Schema::hasColumn('accounts', 'deleted_at')) {
                $table->softDeletes();
            }
        });

        if (Schema::hasColumn('accounts', 'path') && ! $this->indexExists('accounts', self::PATH_INDEX)) {
            if (DB::getDriverName() === 'sqlite') {
                Schema::table('accounts', function (Blueprint $table) {
                    $table->index(['tenant_id', 'path'], self::PATH_INDEX);
                });
            } else {
                // فهرس مركّب ببادئة path — تجنّب خطأ MySQL 1071 (utf8mb4 × VARCHAR(1000))
                DB::statement('ALTER TABLE accounts ADD INDEX '.self::PATH_INDEX.' (tenant_id, path(191))');
            }
        }

        if (Schema::hasColumn('accounts', 'code') && DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE accounts MODIFY code VARCHAR(50) NOT NULL');
        }

        $this->backfillPathsAndGroups();
    }

    public function down(): void
    {
        if ($this->indexExists('accounts', self::PATH_INDEX)) {
            if (DB::getDriverName() === 'sqlite') {
                Schema::table('accounts', function (Blueprint $table) {
                    $table->dropIndex(self::PATH_INDEX);
                });
            } else {
                DB::statement('ALTER TABLE accounts DROP INDEX '.self::PATH_INDEX);
            }
        }

        Schema::table('accounts', function (Blueprint $table) {
            if (Schema::hasColumn('accounts', 'path')) {
                $table->dropColumn('path');
            }
            if (Schema::hasColumn('accounts', 'is_group')) {
                $table->dropColumn('is_group');
            }
            if (Schema::hasColumn('accounts', 'opening_balance')) {
                $table->dropColumn('opening_balance');
            }
            if (Schema::hasColumn('accounts', 'sort_order')) {
                $table->dropColumn('sort_order');
            }
            if (Schema::hasColumn('accounts', 'deleted_at')) {
                $table->dropColumn('deleted_at');
            }
        });

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE accounts MODIFY code VARCHAR(20) NOT NULL');
        }
    }

    private function indexExists(string $table, string $indexName): bool
    {
        if (DB::getDriverName() === 'sqlite') {
            foreach (DB::select('PRAGMA index_list('.DB::getPdo()->quote($table).')') as $idx) {
                if (($idx->name ?? null) === $indexName) {
                    return true;
                }
            }

            return false;
        }

        $db = DB::getDatabaseName();

        return DB::table('information_schema.statistics')
            ->where('table_schema', $db)
            ->where('table_name', $table)
            ->where('index_name', $indexName)
            ->exists();
    }

    private function backfillPathsAndGroups(): void
    {
        if (! Schema::hasColumn('accounts', 'path')) {
            return;
        }

        $tenantIds = DB::table('accounts')->distinct()->pluck('tenant_id');

        foreach ($tenantIds as $tenantId) {
            $accounts = DB::table('accounts')
                ->where('tenant_id', $tenantId)
                ->orderBy('level')
                ->orderBy('code')
                ->get(['id', 'parent_id', 'code', 'is_postable']);

            $byId = $accounts->keyBy('id');

            foreach ($accounts as $row) {
                $path = $this->buildPath($row, $byId);
                $hasChildren = $accounts->contains(fn ($a) => (int) $a->parent_id === (int) $row->id);
                $isGroup = $hasChildren || ! (bool) $row->is_postable;

                $update = ['path' => $path];
                if (Schema::hasColumn('accounts', 'is_group')) {
                    $update['is_group'] = $isGroup;
                }
                DB::table('accounts')->where('id', $row->id)->update($update);
            }
        }
    }

    private function buildPath(object $row, $byId): string
    {
        $segments = [$row->code];
        $parentId = $row->parent_id;

        while ($parentId && $byId->has($parentId)) {
            $parent = $byId->get($parentId);
            array_unshift($segments, $parent->code);
            $parentId = $parent->parent_id;
        }

        return implode('/', $segments);
    }
};
