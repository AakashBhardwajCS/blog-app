import { notFound, redirect } from 'next/navigation';
import { ApiError, getPost } from '../../../lib/api';
import { getServerToken } from '../../../lib/server-auth';
import { PostActions } from '../../../components/PostActions';
import { PostEngagement } from '../../../components/PostEngagement';
import { departmentLabel } from '../../../lib/departments';

function renderContent(content: string): { __html: string } {
  if (!content.trim()) return { __html: '' };
  if (/<[a-z][\s\S]*>/i.test(content)) {
    return { __html: content };
  }

  const paragraphs = content
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${paragraph.trim().replace(/\n/g, '<br />')}</p>`)
    .join('');

  return { __html: paragraphs };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  const signIn = `/login?next=${encodeURIComponent(`/posts/${slug}`)}`;
  const token = await getServerToken();
  if (!token) redirect(signIn);

  let post: Awaited<ReturnType<typeof getPost>>;
  try {
    post = await getPost(token, slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect(signIn);
    notFound();
  }

  return (
    <article className="mx-auto max-w-3xl rounded-2xl border bg-white px-6 py-10 shadow-sm sm:px-12">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-slate-500">
          By {post.author.name} · {new Date(post.createdAt).toLocaleDateString()}
        </p>
        <PostActions authorId={post.author.id} postId={post.id} />
      </div>
      <h1 className="mt-4">{post.title}</h1>
      <div className="mt-5 flex flex-wrap gap-2">
        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
          {departmentLabel(post.department)}
        </span>
      </div>
      <div
        className="mt-8 text-[1.05rem] leading-8 text-slate-700 [&_p]:mb-4 [&_img]:my-6 [&_img]:mx-auto [&_img]:max-w-full [&_img]:rounded-2xl [&_figure]:my-6 [&_figure]:text-center [&_figcaption]:mt-2 [&_figcaption]:text-xs [&_figcaption]:text-slate-500"
        dangerouslySetInnerHTML={renderContent(post.content)}
      />
      <PostEngagement slug={post.slug} />
    </article>
  );
}
