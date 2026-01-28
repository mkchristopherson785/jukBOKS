import { useState, useCallback } from "react";

declare global {
  interface Window {
    MusicKit: any;
  }
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumCover: string;
  duration: number;
  isExplicit: boolean;
  previewUrl?: string;
}

export function useAppleMusic() {
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<Track[]>([]);

  const searchTracks = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=100`
      );
      const data = await response.json();

      const tracks: Track[] = data.results.map((item: any) => ({
        id: item.trackId?.toString() || "",
        title: item.trackName || "",
        artist: item.artistName || "",
        album: item.collectionName || "",
        albumCover: item.artworkUrl100?.replace("100x100", "300x300") || "",
        duration: item.trackTimeMillis || 0,
        isExplicit: item.trackExplicitness === "explicit",
        previewUrl: item.previewUrl,
      }));

      setResults(tracks);
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
  }, []);

  return { searchTracks, results, isSearching, clearResults };
}
