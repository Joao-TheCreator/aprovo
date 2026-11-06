import { PhoneFrame } from "@/components/app/PhoneFrame";

import { ConnectProfileForm } from "./ConnectProfileForm";

export default function NovoPerfilPage() {
  return (
    <PhoneFrame className="flex flex-col gap-6">
      <h1 className="text-2xl leading-8 font-bold">Conectar perfil do Instagram</h1>
      <ConnectProfileForm />
    </PhoneFrame>
  );
}
