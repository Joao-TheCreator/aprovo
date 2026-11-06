import { PhoneFrame } from "@/components/app/PhoneFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NovoPerfilPage() {
  return (
    <PhoneFrame className="flex flex-col gap-6">
      <h1 className="text-2xl leading-8 font-bold">Conectar perfil do Instagram</h1>
      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="handle">@ do Instagram</Label>
          <div className="relative">
            <span
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
            >
              @
            </span>
            <Input id="handle" name="handle" placeholder="perfil" className="pl-9" disabled />
          </div>
        </div>
        <Button type="submit" disabled>
          Continuar
        </Button>
      </form>
      <p className="text-muted-foreground text-sm">Disponível na Fase 1</p>
    </PhoneFrame>
  );
}
