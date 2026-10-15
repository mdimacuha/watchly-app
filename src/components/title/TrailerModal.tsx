"use client";

import React from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { TmdbVideo } from "@/server/tmdb/types";

interface TrailerModalProps {
  isOpen: boolean;
  onClose: () => void;
  trailer: TmdbVideo | null;
}

export function TrailerModal({ isOpen, onClose, trailer }: TrailerModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={''}
      // The close control lives in the header bar below, outside the video
      // frame — suppress Modal's built-in X so it doesn't overlap the iframe
      // and YouTube's own top-right controls.
      hideCloseButton
      className="bg-black border border-white/10"
    >
      {/* Header bar: sits above the embed so the close button never covers
          the trailer content or its controls. */}
      <div className="flex items-center justify-end px-2 py-2 border-b border-white/10">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Close trailer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="w-full aspect-video bg-black flex items-center justify-center">
        {isOpen && trailer ? (
          <iframe
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0`}
            title={trailer.name}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="text-muted-foreground">No trailer available</div>
        )}
      </div>
    </Modal>
  );
}
