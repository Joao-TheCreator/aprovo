import { notFound } from "next/navigation";

import { PostEditor } from "./PostEditor";
import { getPost } from "@/lib/posts/queries";

export const metadata = { title: "Editar publicação" };

export default async function EditarPostPage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>;
}) {
  const { id, postId } = await params;
  const post = await getPost(postId);
  if (!post || post.profileId !== id) notFound();
  return <PostEditor post={post} />;
}
