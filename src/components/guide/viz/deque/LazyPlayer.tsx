"use client";

// The player in its own client chunk: every lesson shares the /learn/[slug]
// route, whose client components are otherwise bundled together, so a lesson
// page would load the generators of every other lesson.
import dynamic from "next/dynamic";

export const LazyDequePlayer = dynamic(() => import("./DequePlayer").then((m) => m.DequePlayer));
