export const authChangeEvent = 'blog-auth-change';

import type { OrgRole, Session, User } from './types';

/** Mirrors the token into a cookie so server-rendered pages can fetch members-only posts. */
export const tokenCookie = 'blog_token';
const TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // matches the backend's token lifetime

function notifyAuthChange(): void {
  window.dispatchEvent(new Event(authChangeEvent));
}

/** The user saved at sign-in, or null when signed out (or on the server, where localStorage doesn't exist). */
export function getStoredUser(): User | null {
  try {
    if (!localStorage.getItem('blog_token')) return null;
    return JSON.parse(localStorage.getItem('blog_user') ?? 'null') as User | null;
  } catch {
    return null;
  }
}

/** Saves updated profile data so the header and other components refresh immediately. */
export function storeUser(user: User): void {
  localStorage.setItem('blog_user', JSON.stringify(user));
  notifyAuthChange();
}

export function storeSession(session: Session): void {
  localStorage.setItem('blog_token', session.token);
  localStorage.setItem('blog_user', JSON.stringify(session.user));
  writeTokenCookie(session.token);
  notifyAuthChange();
}

/**
 * Sessions created before the cookie existed only live in localStorage. Copies the token
 * across and returns true when it did, so the caller can re-render server content.
 */
export function syncTokenCookie(): boolean {
  const token = localStorage.getItem('blog_token');
  const hasCookie = document.cookie.split('; ').some((entry) => entry.startsWith(`${tokenCookie}=`));
  if (!token || hasCookie) return false;
  writeTokenCookie(token);
  return true;
}

export function signOut(): void {
  localStorage.removeItem('blog_token');
  localStorage.removeItem('blog_user');
  document.cookie = `${tokenCookie}=; Path=/; Max-Age=0; SameSite=Lax`;
  notifyAuthChange();
}

/** Owners and admins manage the organization and can moderate any post or comment. */
export function isOrgAdmin(role: OrgRole | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

function writeTokenCookie(token: string): void {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${tokenCookie}=${encodeURIComponent(token)}; Path=/; Max-Age=${TOKEN_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}
