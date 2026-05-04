import { useState, useCallback, useEffect } from "react";

interface FavoriteSong {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  albumCover: string;
  previewUrl?: string;
  duration?: number;
  isExplicit?: boolean;
  lastRequestedAt: number;
}

function getStorageKey(venueCode?: string): string {
  return venueCode ? `jukboks_favorites_${venueCode}` : "jukboks_favorites";
}
const MAX_FAVORITES = 50;

function loadFavorites(key: string): FavoriteSong[] {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function saveFavorites(key: string, favorites: FavoriteSong[]) {
  try {
    localStorage.setItem(key, JSON.stringify(favorites));
  } catch {}
}

export function useGuestFavorites(venueCode?: string) {
  const storageKey = getStorageKey(venueCode);
  const [favorites, setFavorites] = useState<FavoriteSong[]>(() => loadFavorites(storageKey));

  useEffect(() => {
    saveFavorites(storageKey, favorites);
  }, [storageKey, favorites]);

  const addFavorite = useCallback((song: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    albumCover?: string;
    previewUrl?: string;
    duration?: number;
    isExplicit?: boolean;
  }) => {
    setFavorites(prev => {
      const filtered = prev.filter(f => f.trackId !== song.id);
      const updated: FavoriteSong = {
        trackId: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album || "",
        albumCover: song.albumCover || "",
        previewUrl: song.previewUrl,
        duration: song.duration,
        isExplicit: song.isExplicit,
        lastRequestedAt: Date.now(),
      };
      const newList = [updated, ...filtered].slice(0, MAX_FAVORITES);
      return newList;
    });
  }, []);

  const removeFavorite = useCallback((trackId: string) => {
    setFavorites(prev => prev.filter(f => f.trackId !== trackId));
  }, []);

  return { favorites, addFavorite, removeFavorite };
}
