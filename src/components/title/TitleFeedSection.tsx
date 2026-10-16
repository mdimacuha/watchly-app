"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { FeedItem, ReleaseRow } from "@/services/tmdb/title";
import Image from "next/image";
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { buildImageUrl } from "@/lib/tmdb";
import { ArrowRight } from "lucide-react";

interface TitleFeedSectionProps {
  items: FeedItem[];
}

export function TitleFeedSection({ items }: TitleFeedSectionProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl border-t border-border/10 pt-10 mt-10">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80">
          Watch / News
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item, i) => {
          const imageUrl = buildImageUrl(item.imagePath, "w500");
          
          return (
            <QuickViewLink 
              key={i} 
              href={item.href}
              className="group flex flex-col gap-3 rounded-lg hover:bg-muted/5 transition-all p-2 -mx-2"
            >
              <div className="relative aspect-video w-full bg-muted rounded overflow-hidden border border-white/5 group-hover:border-white/20 transition-colors">
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={item.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    sizes="(max-width: 768px) 100vw, 300px"
                  />
                ) : (
                  <div className="flex w-full h-full items-center justify-center bg-secondary text-secondary-foreground text-[10px] font-bold">
                    IMG
                  </div>
                )}
                
                <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[9px] font-bold uppercase tracking-widest text-white border border-white/10">
                  {item.kind}
                </div>
              </div>
              
              <div className="flex flex-col gap-1 min-w-0">
                <h4 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                  {item.title}
                </h4>
                {item.subtitle && (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {item.subtitle}
                  </p>
                )}
                
                <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                  {item.ctaLabel} <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </QuickViewLink>
          );
        })}
      </div>
    </div>
  );
}
