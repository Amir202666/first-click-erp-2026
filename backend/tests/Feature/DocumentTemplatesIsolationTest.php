<?php

namespace Tests\Feature;

use App\Models\DocumentTemplate;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class DocumentTemplatesIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_document_templates_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        DocumentTemplate::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'Tpl A',
            'doc_type' => 'invoice',
            'format' => 'a4',
            'content' => '<div>A</div>',
            'is_active' => true,
            'is_system' => false,
        ]);
        DocumentTemplate::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'Tpl B',
            'doc_type' => 'invoice',
            'format' => 'a4',
            'content' => '<div>B</div>',
            'is_active' => true,
            'is_system' => false,
        ]);

        $rows = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/document-templates')
            ->assertOk()
            ->json();

        $names = array_values(array_map(fn ($r) => $r['name'] ?? null, $rows));
        $this->assertContains('Tpl A', $names);
        $this->assertNotContains('Tpl B', $names);
    }

    public function test_document_template_show_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $tplA = DocumentTemplate::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'Tpl A',
            'doc_type' => 'invoice',
            'format' => 'a4',
            'content' => '<div>A</div>',
            'is_active' => true,
            'is_system' => false,
        ]);
        $tplB = DocumentTemplate::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'Tpl B',
            'doc_type' => 'invoice',
            'format' => 'a4',
            'content' => '<div>B</div>',
            'is_active' => true,
            'is_system' => false,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/document-templates/'.$tplB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/document-templates/'.$tplB->id, ['name' => 'Hacked'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/document-templates/'.$tplB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/document-templates/'.$tplA->id, ['name' => 'Tpl A Updated'])
            ->assertOk()
            ->assertJsonPath('name', 'Tpl A Updated');
    }
}
