import { Department } from './departments';

export interface Author {
  id: string;
  name: string;
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImage?: string | null;
  imageAlt?: string | null;
  department: Department;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  author: Author;
}

export interface Session {
  token: string;
  user: User;
}

/** What a user may do in their organization. Separate from `role`, their free-text job title. */
export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER';

/** The signed-in user as returned by /auth/login, /auth/register and /profile. */
export interface User {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  department: Department;
  role: string;
  avatarUrl: string | null;
  orgRole: OrgRole;
  tenant: { id: string; name: string; slug: string };
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  myRole: OrgRole;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  department: Department;
  role: string;
  avatarUrl: string | null;
  orgRole: OrgRole;
  deactivatedAt: string | null;
  createdAt: string;
}

export interface Invite {
  id: string;
  code: string;
  role: OrgRole;
  email: string | null;
  maxUses: number | null;
  uses: number;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  createdBy: Author;
}

/** What the sign-up page shows about an invite link before the account exists. */
export interface InvitePreview {
  organization: string;
  role: OrgRole;
  email: string | null;
  expiresAt: string;
}

export interface PostPage {
  items: Post[];
  meta: { page: number; limit: number; total: number; pages: number };
}

export interface PostSearchHit {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  department: Department;
  createdAt: string;
  author: Author;
  /** Best-matching passage of the post. */
  snippet: string;
  /** Offsets in `snippet` of the sentence closest in meaning to the query. */
  passage: { start: number; end: number } | null;
  /** Section heading the snippet comes from. */
  section: string | null;
  score: number;
  matchedBy: 'keyword' | 'semantic' | 'both';
  /** How close the post is in meaning; null when only keywords matched. */
  meaning: 'strong' | 'close' | 'related' | null;
}

export interface PostSearchResult {
  items: PostSearchHit[];
  mode: 'hybrid' | 'lexical' | 'fallback';
  /** Whether meaning-based matching ran for this query. */
  semantic: boolean;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: Author;
  replies: Comment[];
}

export interface Engagement {
  likes: number;
  liked: boolean;
  comments: Comment[];
}
