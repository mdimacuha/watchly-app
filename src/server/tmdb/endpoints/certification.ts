import { tmdbFetch } from "../client";

interface Certification {
  certification: string;
  meaning: string;
  order: number;
}

interface CertificationsResponse {
  certifications: Record<string, Certification[]>;
}

export const certification = {
  movieList: () => tmdbFetch<CertificationsResponse>("/certification/movie/list"),
  tvList: () => tmdbFetch<CertificationsResponse>("/certification/tv/list"),
};
