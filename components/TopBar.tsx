"use client";

import Link from "next/link";
import { PencilIcon } from "./icons";
import JobsIndicator from "./JobsIndicator";
import UpdateButton from "./UpdateButton";
import { PinsMenu } from "./Pins";

export default function TopBar({ active }: { active: "search" | "browse" | "routes" }) {
  const tab = (href: string, id: typeof active, label: string) => (
    <Link
      href={href}
      className={`rounded-full px-4 py-1.5 text-sm font-medium no-underline transition-colors duration-300 ${
        active === id ? "bg-ink text-cream" : "text-black hover:text-accent"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4">
      <nav className="header-drop mx-auto flex max-w-[1400px] items-center justify-between gap-4 rounded-full border border-black/10 bg-white/80 px-5 py-2 shadow-lg shadow-black/5 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2 text-ink no-underline">
            <span className="font-serif text-xl leading-none tracking-[-0.01em]">Previewer</span>
            <span className="size-1.5 rounded-full bg-accent" />
          </Link>
          <div className="flex items-center gap-1">
            {tab("/", "search", "Buscar")}
            {tab("/browse", "browse", "Explorar")}
            <PinsMenu />
          </div>
        </div>
        <div className="flex items-center gap-2">
        <JobsIndicator />
        <UpdateButton />
        <Link
          href="/routes"
          title="Editar rutas"
          aria-label="Editar rutas"
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium no-underline transition-colors duration-300 ${
            active === "routes" ? "bg-accent/12 text-accent" : "text-black/60 hover:bg-accent/10 hover:text-accent"
          }`}
        >
          <PencilIcon className="size-4" />
          <span>Rutas</span>
        </Link>
        </div>
      </nav>
    </header>
  );
}
