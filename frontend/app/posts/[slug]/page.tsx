import { notFound } from 'next/navigation';
import { getPost } from '../../../lib/api';

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
        <p className="mt-8 whitespace-pre-wrap text-[1.05rem] leading-8 text-slate-700">
          {post.content}
        </p>
      </article>
    );
  } catch {
    notFound();
  }
}

