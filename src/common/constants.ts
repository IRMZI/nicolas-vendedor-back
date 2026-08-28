export const ACCESS_COOKIE = 'nv_access';
export const REFRESH_COOKIE = 'nv_refresh';
export const CSRF_COOKIE = 'nv_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export const MAX_PER_PAGE = 100;
export const DEFAULT_PER_PAGE = 20;

export const ALLOWED_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
] as const;

export const HOME_SECTION_KEYS = [
  'hero',
  'categories',
  'featured',
  'most_viewed',
  'recent',
  'about',
  'benefits',
  'testimonials',
  'whatsapp_cta',
] as const;

export type HomeSectionKey = (typeof HOME_SECTION_KEYS)[number];
