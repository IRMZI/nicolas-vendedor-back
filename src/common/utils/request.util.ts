import type { Request } from 'express';
import { UAParser } from 'ua-parser-js';
import { DeviceType } from '@prisma/client';

export function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.split(',')[0]?.trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? undefined;
}

export function getUserAgent(req: Request): string | undefined {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 500) : undefined;
}

export function detectDevice(userAgent?: string): DeviceType {
  if (!userAgent) return DeviceType.UNKNOWN;
  const parsed = new UAParser(userAgent).getDevice();
  switch (parsed.type) {
    case 'mobile':
      return DeviceType.MOBILE;
    case 'tablet':
      return DeviceType.TABLET;
    case undefined:
      return DeviceType.DESKTOP;
    default:
      return DeviceType.UNKNOWN;
  }
}

export function referrerHost(referrer?: string | null): string | undefined {
  if (!referrer) return undefined;
  try {
    return new URL(referrer).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}
