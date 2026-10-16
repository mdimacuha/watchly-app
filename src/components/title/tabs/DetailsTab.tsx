import React from "react";
import type { CrewPerson, TitleInfoPanelData } from "@/services/tmdb/title";
import { KeyValueRow } from "@/components/ui/KeyValueRow";
import { QuickViewLink } from "@/components/watchly/QuickViewLink";

interface DetailsTabProps {
  data: TitleInfoPanelData;
}

export function DetailsTab({ data }: DetailsTabProps) {
  const { creators, directors, writers, producers } = data.keyCrew;

  return (
    <div className="flex flex-col gap-2 w-full mt-4">
      {/* Key people first. Rows hide when TMDB has no one for the role
          (e.g. series-level directors are rare on TV). */}
      <CrewRow label="Created by" people={creators} />
      <CrewRow label={directors.length > 1 ? "Directors" : "Director"} people={directors} />
      <CrewRow label={writers.length > 1 ? "Writers" : "Writer"} people={writers} />
      <CrewRow label={producers.length > 1 ? "Producers" : "Producer"} people={producers} />

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

/** Names open the person Quick View, same as cast cards. */
function CrewRow({ label, people }: { label: string; people: CrewPerson[] }) {
  if (people.length === 0) return null;
  return (
    <KeyValueRow
      label={label}
      value={
        <div className="flex flex-wrap justify-end gap-x-1">
          {people.map((p, i) => (
            <span key={p.id}>
              <QuickViewLink
                mediaType="person"
                titleId={p.id}
                className="hover:text-primary transition-colors"
              >
                {p.name}
              </QuickViewLink>
              {i < people.length - 1 && ","}
            </span>
          ))}
        </div>
      }
    />
  );
}
