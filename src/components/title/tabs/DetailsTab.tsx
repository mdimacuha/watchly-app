import React from "react";
import { TitleInfoPanelData } from "@/services/tmdb/title";
import { KeyValueRow } from "@/components/ui/KeyValueRow";

interface DetailsTabProps {
  data: TitleInfoPanelData;
}

export function DetailsTab({ data }: DetailsTabProps) {
  return (
    <div className="flex flex-col gap-2 w-full mt-4">
      <KeyValueRow 
        label="Production Companies" 
        value={
          <div className="flex flex-wrap gap-2 justify-end">
            {data.studios.length > 0 ? (
              data.studios.map(s => (
                <span key={s.id} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-xs">
                  {s.name}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground italic">Unknown</span>
            )}
          </div>
        } 
      />
      
      <KeyValueRow 
        label="Countries" 
        value={
          data.countries.length > 0 
            ? data.countries.map(c => c.name).join(", ") 
            : <span className="text-muted-foreground italic">Unknown</span>
        } 
      />
      
      <KeyValueRow 
        label="Primary Language" 
        value={
          data.primaryLanguage 
            ? <span className="uppercase">{data.primaryLanguage}</span> 
            : <span className="text-muted-foreground italic">Unknown</span>
        } 
      />
      
      <KeyValueRow 
        label="Spoken Languages" 
        value={
          data.spokenLanguages.length > 0 
            ? data.spokenLanguages.join(", ") 
            : <span className="text-muted-foreground italic">Unknown</span>
        } 
      />
      
      <KeyValueRow 
        label="Alternative Titles" 
        value={
          data.alternativeTitles.length > 0 
            ? (
              <div className="flex flex-col gap-1 items-end">
                {data.alternativeTitles.map((t, i) => (
                  <span key={i} className="text-sm text-right">{t}</span>
                ))}
              </div>
            )
            : <span className="text-muted-foreground italic">None</span>
        } 
      />
    </div>
  );
}
