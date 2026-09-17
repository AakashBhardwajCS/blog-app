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
  tags: string[];
  published: boolean;
  createdAt: string;
  updatedAt: string;
  author: Author;
}

export interface Session {
  token: string;
  user: { id: string; email: string; name: string };
}

export interface PostPage {
  items: Post[];
  meta: { page: number; limit: number; total: number; pages: number };
}
