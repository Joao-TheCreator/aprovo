import { notFound } from "next/navigation";

import { PostDetailView } from "./PostDetailView";
import { getPost } from "@/lib/posts/queries";

export const metadata = { title: "Publicação" };

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>;
}) {
  const { id, postId } = await params;
  const post = await getPost(postId);
  if (!post || post.profileId !== id) notFound();
  return <PostDetailView post={post} />;
}
