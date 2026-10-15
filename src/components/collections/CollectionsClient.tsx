"use client";

import { TmdbCollectionGrid } from "./TmdbCollectionGrid";
import { TmdbCollectionSearchField } from "./TmdbCollectionSearchField";
import { Pagination } from "@/components/search/Pagination";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface CollectionItem {
  id: number;
  name: string;
  posterPath?: string | null;
  backdropPath?: string | null;
}

interface CollectionData {
  results: CollectionItem[];
  page: number;
  total_pages: number;
  total_results: number;
}

export function CollectionsClient() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q");
  const page = searchParams.get("page") || "1";

  const [data, setData] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        params.set("page", page);

        const res = await fetch(`/api/v1/tmdb/collections?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch collections");
        const json = await res.json();
        if (json.ok) {
          setData(json.data);
        } else {
          throw new Error(json.error?.message || "Unknown error");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [q, page]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Collections</h1>
        <TmdbCollectionSearchField />
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          Error: {error}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {data?.total_results?.toLocaleString()} results found
              {q ? ` for "${q}"` : " in Trending"}
            </span>
          </div>
          
          <TmdbCollectionGrid collections={data?.results || []} />
          
          <div className="mt-8 flex justify-center">
            <Pagination 
              currentPage={data?.page || 1} 
              totalPages={data?.total_pages || 1} 
            />
          </div>
        </>
      )}
    </div>
  );
}
