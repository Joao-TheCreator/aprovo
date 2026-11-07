import { CardsPageSkeleton } from "@/components/app/PageSkeletons";

export default function NovoPerfilLoading() {
  return <CardsPageSkeleton label="Carregando…" cards={2} />;
}
