import { useState, useCallback, useRef } from "react";

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

const RESULTS_PER_PAGE = 50;

export function useAppleMusic() {
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [results, setResults] = useState<Track[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const currentQueryRef = useRef("");
  const offsetRef = useRef(0);

  const searchTracks = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setHasMore(false);
      return;
    }

    currentQueryRef.current = query;
    offsetRef.current = 0;
    setIsSearching(true);
    
    try {
      const response = await fetch(
        `/api/apple-music/search?term=${encodeURIComponent(query)}&limit=${RESULTS_PER_PAGE}&offset=0`
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

      const returned = data.results.length;
      setResults(tracks);
      // iTunes sometimes returns slightly more or fewer than the requested
      // limit, so treat anything >= page size (with a small tolerance) as
      // "probably more available". Advance the offset by what we actually
      // got so page 2 doesn't skip or duplicate rows.
      setHasMore(returned >= RESULTS_PER_PAGE);
      offsetRef.current = returned;
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
      setHasMore(false);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!currentQueryRef.current || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const response = await fetch(
        `/api/apple-music/search?term=${encodeURIComponent(currentQueryRef.current)}&limit=${RESULTS_PER_PAGE}&offset=${offsetRef.current}`
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

      const returned = data.results.length;
      setResults(prev => [...prev, ...tracks]);
      setHasMore(returned >= RESULTS_PER_PAGE);
      offsetRef.current += returned;
    } catch (error) {
      console.error("Load more failed:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore]);

  const clearResults = useCallback(() => {
    setResults([]);
    setHasMore(false);
    currentQueryRef.current = "";
    offsetRef.current = 0;
  }, []);

  return { searchTracks, results, isSearching, clearResults, loadMore, hasMore, isLoadingMore };
}
