"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shareTitle } from "@/lib/share";
import { FavoriteButton } from "../watchly/FavoriteButton";
import { AddCollectionToWatchlistButton } from "@/components/watchlists/AddCollectionToWatchlistButton";
import { useAuthStore } from "@/client/stores/auth";

interface CollectionActionsProps {
  collectionId: number;
  collectionName: string;
  className?: string;
}

export function CollectionActions({ collectionId, collectionName, className }: CollectionActionsProps) {
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');

  const handleShare = () => {
    shareTitle("co", collectionId, collectionName);
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {isAuthenticated && (
        <>
          <AddCollectionToWatchlistButton
            collectionId={String(collectionId)}
            collectionName={collectionName}
          />
          <FavoriteButton
            id={collectionId}
            type="collection"
            className="w-full md:w-auto mt-2"
            showText={true}
            fetchInitial
          />
        </>
      )}

      <Button
        variant="secondary"
        size="icon"
        onClick={handleShare}
        aria-label="Share collection"
      >
        <Share2 className="w-5 h-5" />
      </Button>
    </div>
  );
}
