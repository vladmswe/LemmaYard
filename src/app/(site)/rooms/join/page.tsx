import type { Metadata } from "next";

import { Reveal } from "@/components/motion/reveal";
import { JoinRoom } from "@/components/rooms/join-room";
import { getCurrentUser } from "@/server/auth/session";

// no-referrer (spec §8.1); next.config.ts also sends the header for this path.
export const metadata: Metadata = { title: "Join a room · LemmaYard", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** Open to guests: they get Log in / Sign up and come back here with the token kept in sessionStorage. */
export default async function JoinRoomPage() {
  const user = await getCurrentUser();
  return (
    <section className="relative flex flex-1 flex-col justify-center overflow-hidden px-4 py-12 sm:py-16">
      <div aria-hidden className="grid-paper [mask-image:radial-gradient(50%_60%_at_50%_45%,#000_30%,transparent_80%)]" />
      <Reveal className="relative mx-auto flex w-full justify-center">
        <JoinRoom signedIn={Boolean(user)} />
      </Reveal>
    </section>
  );
}
