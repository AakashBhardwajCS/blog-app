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
