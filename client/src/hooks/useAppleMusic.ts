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

export type SearchMode = "song" | "artist";

export function useAppleMusic() {
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [results, setResults] = useState<Track[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const currentQueryRef = useRef("");
  const currentModeRef = useRef<SearchMode>("song");
  const offsetRef = useRef(0);
  // Monotonic request id — only the latest request is allowed to write to
  // state. Prevents a slow song-mode response from clobbering a faster
  // artist-mode response when the user switches tabs (or types fast).
  const requestIdRef = useRef(0);

  // Server-side mode param. Artist mode triggers a two-stage lookup
  // (find top artist match → fetch their songs), since iTunes Search
  // ignores attribute=artistTerm for song-entity searches.
  const modeParam = (mode: SearchMode) => `&mode=${mode}`;

  const searchTracks = useCallback(async (query: string, mode: SearchMode = "song") => {
    if (!query.trim()) {
      requestIdRef.current++; // invalidate any in-flight request
      setResults([]);
      setHasMore(false);
      return;
    }

    currentQueryRef.current = query;
    currentModeRef.current = mode;
    offsetRef.current = 0;
    const myRequestId = ++requestIdRef.current;
    setIsSearching(true);
    
    try {
      const response = await fetch(
        `/api/apple-music/search?term=${encodeURIComponent(query)}&limit=${RESULTS_PER_PAGE}&offset=0${modeParam(mode)}`
      );
      // Stale response — a newer query/mode has already been requested.
      if (myRequestId !== requestIdRef.current) return;
      const data = await response.json();
      if (myRequestId !== requestIdRef.current) return;

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
      if (myRequestId !== requestIdRef.current) return;
      console.error("Search failed:", error);
      setResults([]);
      setHasMore(false);
    } finally {
      if (myRequestId === requestIdRef.current) setIsSearching(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!currentQueryRef.current || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const response = await fetch(
        `/api/apple-music/search?term=${encodeURIComponent(currentQueryRef.current)}&limit=${RESULTS_PER_PAGE}&offset=${offsetRef.current}${modeParam(currentModeRef.current)}`
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
