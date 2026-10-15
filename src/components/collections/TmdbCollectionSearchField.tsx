"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export function TmdbCollectionSearchField() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [value, setValue] = useState(initialQuery);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (value === initialQuery) return;
      
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set("q", value);
        params.set("page", "1");
      } else {
        params.delete("q");
        params.delete("page");
      }
      router.push(`/collections?${params.toString()}`);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [value, router, searchParams, initialQuery]);

  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search collections..."
        className="pl-9 bg-background/50"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
}
