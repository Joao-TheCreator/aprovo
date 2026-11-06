import {
  ChevronDown,
  CircleCheck,
  Clapperboard,
  Grid3x3,
  History,
  Menu,
  Share,
  SquarePlus,
  UserSquare,
} from "lucide-react";

import type { ProfileFeed } from "@/lib/profiles/contracts";
import { formatCount } from "@/lib/profiles/ui-time";

/** Decorative Instagram top bar + profile header + tabs (everything but the grid). */
export function InstagramHeader({ profile }: { profile: ProfileFeed["profile"] }) {
  const stats: [number | null, string][] = [
    [profile.postsCount, "posts"],
    [profile.followersCount, "seguidores"],
    [profile.followingCount, "seguindo"],
  ];
  return (
    <>
      <div className="flex h-12 items-center justify-between gap-3 px-4">
        <span className="flex min-w-0 items-center gap-1 text-lg font-bold">
          <span className="truncate">{profile.igUsername}</span>
          <ChevronDown className="size-4 shrink-0" strokeWidth={2.5} aria-hidden />
        </span>
        <div aria-hidden className="flex shrink-0 items-center gap-3">
          <Share className="size-5" strokeWidth={1.75} />
          <CircleCheck className="size-5" strokeWidth={1.75} />
          <History className="size-5" strokeWidth={1.75} />
          <SquarePlus className="size-5" strokeWidth={1.75} />
          <Menu className="size-5" strokeWidth={1.75} />
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-3">
        <div className="flex items-center gap-6">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt={`Foto de perfil de @${profile.igUsername}`}
              className="size-[86px] shrink-0 rounded-full object-cover"
            />
          ) : (
            <div aria-hidden className="size-[86px] shrink-0 rounded-full bg-neutral-300" />
          )}
          <div className="flex flex-1 justify-around text-center">
            {stats.map(([n, label]) => (
              <div key={label} className="flex flex-col leading-5">
                <span className="text-base font-bold">{formatCount(n)}</span>
                <span className="text-[13px]">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-sm leading-[18px]">
          {profile.displayName ? <p className="font-bold">{profile.displayName}</p> : null}
          {profile.biography ? <p className="whitespace-pre-line">{profile.biography}</p> : null}
          {profile.externalUrl ? (
            <a
              href={profile.externalUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="focus-visible:ring-ring/50 rounded font-semibold text-[#00376B] outline-none focus-visible:ring-[3px]"
            >
              {profile.externalUrl.replace(/^https?:\/\//, "")}
            </a>
          ) : null}
        </div>

        <div aria-hidden className="flex gap-2">
          <span className="flex h-8 flex-1 items-center justify-center rounded-lg bg-[#0095F6] text-sm font-semibold text-white">
            Seguir
          </span>
          <span className="flex h-8 flex-1 items-center justify-center rounded-lg bg-neutral-200 text-sm font-semibold">
            Mensagem
          </span>
        </div>

        <div aria-hidden className="flex w-16 flex-col items-center gap-1 pt-1">
          <div className="size-16 rounded-full border border-neutral-300 bg-neutral-200" />
          <span className="text-xs">Destaque</span>
        </div>
      </div>

      <div aria-hidden className="flex border-b border-neutral-200">
        <div className="flex h-11 flex-1 items-center justify-center border-b border-black">
          <Grid3x3 className="size-6" strokeWidth={1.75} />
        </div>
        <div className="flex h-11 flex-1 items-center justify-center text-neutral-500">
          <Clapperboard className="size-6" strokeWidth={1.75} />
        </div>
        <div className="flex h-11 flex-1 items-center justify-center text-neutral-500">
          <UserSquare className="size-6" strokeWidth={1.75} />
        </div>
      </div>
    </>
  );
}
