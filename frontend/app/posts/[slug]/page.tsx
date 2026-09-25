import { notFound } from 'next/navigation';
import { getPost } from '../../../lib/api';
import { PostEngagement } from '../../../components/PostEngagement';

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
  try {
    const post = await getPost((await params).slug);
    return (
      <article className="mx-auto max-w-3xl rounded-2xl border bg-white px-6 py-10 shadow-sm sm:px-12">
        <p className="text-sm text-slate-500">
          By {post.author.name} · {new Date(post.createdAt).toLocaleDateString()}
        </p>
        <h1 className="mt-4">{post.title}</h1>
        <div className="mt-5 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <span
              className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700"
              key={tag}
            >
              {tag}
            </span>
          ))}
        </div>
        <div
          className="mt-8 text-[1.05rem] leading-8 text-slate-700 [&_p]:mb-4 [&_img]:my-6 [&_img]:mx-auto [&_img]:max-w-full [&_img]:rounded-2xl [&_figure]:my-6 [&_figure]:text-center [&_figcaption]:mt-2 [&_figcaption]:text-xs [&_figcaption]:text-slate-500"
          dangerouslySetInnerHTML={renderContent(post.content)}
        />
        <PostEngagement slug={post.slug} />
      </article>
    );
  } catch {
    notFound();
  }
}

