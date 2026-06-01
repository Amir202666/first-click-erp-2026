<?php

namespace App\Console\Commands;

use App\Models\User;
use Database\Seeders\OwnerSeeder;
use Database\Seeders\SuperAdminSeeder;
use Illuminate\Console\Command;

/**
 * يفعّل is_super_admin دون حذف مستخدمين أو شركات (آمن للإنتاج).
 */
class GrantSuperAdmin extends Command
{
    protected $signature = 'admin:grant-super-admin
                            {--username=* : أسماء مستخدمين (افتراضي: حسابات مالك المنصة المعروفة)}
                            {--email= : بريد واحد}
                            {--display-name= : الاسم الظاهر في النظام مثل «مالك النظام»}';

    protected $description = 'تفعيل صلاحية مالك المنصة (is_super_admin) — إدارة الاشتراكات تظهر له فقط';

    public function handle(): int
    {
        $email = trim((string) $this->option('email'));
        $displayName = trim((string) $this->option('display-name'));
        $usernames = array_filter(array_map('trim', (array) $this->option('username')));

        if ($displayName !== '') {
            $users = User::query()->where('name', $displayName)->get();
            if ($users->isEmpty()) {
                $this->error("لم يُعثر على مستخدم بالاسم: {$displayName}");

                return self::FAILURE;
            }
            foreach ($users as $user) {
                $this->promoteUser($user);
            }
            $this->info('سجّل خروجاً ثم ادخل من جديد.');

            return self::SUCCESS;
        }

        if ($email !== '') {
            $user = User::query()->where('email', $email)->first();
            if (! $user) {
                $this->error("لم يُعثر على مستخدم بالبريد: {$email}");

                return self::FAILURE;
            }
            $this->promoteUser($user);
            $this->info('سجّل خروجاً ثم ادخل من جديد.');

            return self::SUCCESS;
        }

        if ($usernames === []) {
            $usernames = [
                OwnerSeeder::OWNER_USERNAME,
                SuperAdminSeeder::USERNAME,
            ];
        }

        $updated = 0;
        foreach ($usernames as $username) {
            $user = User::query()->where('username', $username)->first();
            if (! $user) {
                $this->warn("  ✗ غير موجود (username: {$username})");
                continue;
            }
            if ($this->promoteUser($user)) {
                $updated++;
            }
        }

        if ($updated === 0) {
            $this->error('لم يُعثر على أي مستخدم. حدّد --username=أو --email=');

            return self::FAILURE;
        }

        $this->newLine();
        $this->info("تم التحديث: {$updated} مستخدم(ين). سجّل خروجاً ثم ادخل من جديد.");

        return self::SUCCESS;
    }

    private function promoteUser(User $user): bool
    {
        if ($user->is_super_admin) {
            $this->line("  ✓ {$user->username} ({$user->email}) — مفعّل مسبقاً");

            return true;
        }

        $user->forceFill(['is_super_admin' => true])->save();
        $this->info("  ✓ {$user->username} ({$user->email}) — تم تفعيل is_super_admin");

        return true;
    }
}
