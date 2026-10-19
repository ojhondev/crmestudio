"use client";

import Link from "next/link";
import { BookOpen, CircleHelp, Map, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ANA_UI_ENABLED } from "@/lib/ana-flag";
import { useAna } from "@/components/ana/ana-provider";
import { useTour } from "./tour";

/** Botão "?" no topo: tours, central de ajuda e atalho para a Ana. */
export function HelpMenu() {
  const tour = useTour();
  const ana = useAna();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ajuda" data-tour="help-button">
          <CircleHelp />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuLabel className="label">Ajuda</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTimeout(tour.startForPage, 120)}>
          <MapPin /> Tour desta tela
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTimeout(() => tour.start("welcome"), 120)}>
          <Map /> Tour de boas-vindas
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/ajuda">
            <BookOpen /> Central de ajuda
          </Link>
        </DropdownMenuItem>
        {ANA_UI_ENABLED && (
          <DropdownMenuItem onClick={() => setTimeout(() => ana.open("Preciso de ajuda para usar o sistema. Por onde começo?"), 120)}>
            <Sparkles className="text-brand" /> Perguntar à Ana
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
