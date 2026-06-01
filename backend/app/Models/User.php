<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Seeders\OwnerSeeder;
use Database\Seeders\SuperAdminSeeder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'username',
        'email',
        'phone',
        'password',
        'is_super_admin',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_super_admin' => 'boolean',
        ];
    }

    public function tenants()
    {
        return $this->belongsToMany(Tenant::class, 'tenant_users')
            ->withPivot('role', 'role_id', 'permissions', 'is_active', 'default_branch_id', 'default_warehouse_id', 'restrict_to_branch_warehouse')
            ->withTimestamps();
    }

    public function isSuperAdmin(): bool
    {
        return (bool) $this->is_super_admin;
    }

    /** يفعّل is_super_admin لحسابات مالك المنصة المعروفة إن نُسيت على السيرفر */
    public function ensurePlatformOwnerFlag(): self
    {
        if ($this->is_super_admin) {
            return $this;
        }

        $ownerUsernames = [OwnerSeeder::OWNER_USERNAME, SuperAdminSeeder::USERNAME];
        $ownerEmails = ['owner@firstclick-erp.com', SuperAdminSeeder::EMAIL];

        if (in_array($this->username, $ownerUsernames, true)
            || in_array($this->email, $ownerEmails, true)) {
            $this->forceFill(['is_super_admin' => true])->save();
        }

        return $this;
    }
}
