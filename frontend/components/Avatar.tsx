/* eslint-disable @next/next/no-img-element -- avatars are served from object storage, not next/image. */
import type { User } from '../lib/types';

/** Profile picture, or the user's initials on a brand-colored circle when none is uploaded. */
export function Avatar({ user, size = 36 }: { user: Pick<User, 'name' | 'avatarUrl'>; size?: number }): React.ReactElement {
  const initials =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';

  return user.avatarUrl ? (
    <img alt="" className="shrink-0 rounded-full object-cover" height={size} src={user.avatarUrl} style={{ width: size, height: size }} width={size} />
  ) : (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-brand font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}
