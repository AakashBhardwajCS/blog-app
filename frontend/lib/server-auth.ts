import { cookies } from 'next/headers';
import { tokenCookie } from './auth';

/** The session token for server components, mirrored from localStorage into a cookie at sign-in. */
export async function getServerToken(): Promise<string | null> {
  const value = (await cookies()).get(tokenCookie)?.value;
  return value ? decodeURIComponent(value) : null;
}
