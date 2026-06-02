import { api } from './client'

export interface LoginPagePublic {
  headline: string
  tagline: string
  subtitle: string
  features: string[]
  contact_title: string
  phone: string
  phone_display: string
  whatsapp: string
  email: string
  website: string
  show_brand_panel: boolean
  show_contact_section: boolean
  show_demo_hint: boolean
  show_forgot_password_link: boolean
  copyright: string
  app_version: string
}

export interface LoginPageAdminSettings {
  headline_ar: string
  headline_en: string
  tagline_ar: string
  tagline_en: string
  subtitle_ar: string
  subtitle_en: string
  features_ar: string[]
  features_en: string[]
  contact_title_ar: string
  contact_title_en: string
  phone: string
  phone_display: string
  whatsapp: string
  email: string
  website: string
  show_brand_panel: boolean
  show_contact_section: boolean
  show_demo_hint: boolean
  show_forgot_password_link: boolean
  copyright_ar: string
  copyright_en: string
  app_version: string
}

export function fetchLoginPagePublic(lang: string): Promise<{ data: LoginPagePublic }> {
  return api.get<{ data: LoginPagePublic }>('/login-page', { params: { lang } }).then((r) => r.data)
}

export function fetchAdminLoginPageSettings(): Promise<{ data: LoginPageAdminSettings }> {
  return api.get<{ data: LoginPageAdminSettings }>('/admin/login-page').then((r) => r.data)
}

export function updateAdminLoginPageSettings(
  data: Partial<LoginPageAdminSettings>
): Promise<{ message: string; data: LoginPageAdminSettings }> {
  return api.put<{ message: string; data: LoginPageAdminSettings }>('/admin/login-page', data).then((r) => r.data)
}
