import { UsersIcon } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { Reveal } from "@/components/motion/reveal";
import { PageHead } from "@/components/page-head";
import { CreateRoomDialog } from "@/components/rooms/create-room-dialog";
import { RoomCard } from "@/components/rooms/room-card";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { listMyRooms } from "@/server/rooms/queries";

export const metadata: Metadata = { title: "Rooms · LemmaYard" };
export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const user = await requireUser("/rooms");
  const rooms = await listMyRooms(getDb(), user.id);

  return (
    <>
      <PageHead
        crumbs={[{ label: "Home", href: "/" }, { label: "Rooms" }]}
        title="Rooms"
        subtitle="Private rooms for solving problems with friends."
        actions={rooms.length > 0 ? <CreateRoomDialog /> : undefined}
      />
      <div className="container-page py-8">
        {rooms.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No rooms yet" action={<CreateRoomDialog />}>
            Create a room and send the invite link to your friends. Got an invite? Open the link you received.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {rooms.map((room, i) => (
              <Reveal as="li" index={i} key={room.id}>
                <RoomCard room={room} />
              </Reveal>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
