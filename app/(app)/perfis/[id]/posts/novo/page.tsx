import { NewPostFlow } from "./NewPostFlow";

export const metadata = { title: "Nova publicação" };

export default async function NovoPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  const { id } = await params;
  const { kind } = await searchParams;
  const k = (Array.isArray(kind) ? kind[0] : kind) === "video" ? "video" : "post";
  return <NewPostFlow profileId={id} kind={k} />;
}
