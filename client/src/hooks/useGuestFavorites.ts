import { useState, useCallback, useEffect, useRef } from "react";
import { fetchGuestFavorites, addGuestFavoriteApi, removeGuestFavoriteApi } from "../lib/api";

interface FavoriteSong {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  albumCover: string;
  previewUrl?: string;
  duration?: number;
  isExplicit?: boolean;
}

export function useGuestFavorites(venueCode?: string, guestName?: string) {
  const [favorites, setFavorites] = useState<FavoriteSong[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!venueCode || !guestName) {
      setFavorites([]);
      setIsLoaded(false);
      loadedRef.current = null;
      return;
    }

    const key = `${venueCode}:${guestName.toLowerCase().trim()}`;
    if (loadedRef.current === key) return;

    loadedRef.current = key;
    fetchGuestFavorites(venueCode, guestName)
      .then(async (data) => {
        const cloudFavs: FavoriteSong[] = (data.favorites || []).map((f: any) => ({
          trackId: f.trackId,
          title: f.title,
          artist: f.artist,
          album: f.album || "",
          albumCover: f.albumCover || "",
          previewUrl: f.previewUrl,
          duration: f.duration,
          isExplicit: f.isExplicit,
        }));

        const legacyKey = `jukboks_favorites_${venueCode}`;
        const legacyGlobalKey = "jukboks_favorites";
        const legacyData = localStorage.getItem(legacyKey) || localStorage.getItem(legacyGlobalKey);
        if (legacyData) {
          try {
            const legacyFavs: any[] = JSON.parse(legacyData);
            const cloudTrackIds = new Set(cloudFavs.map((f) => f.trackId));
            const toMigrate = legacyFavs.filter((f) => f.trackId && !cloudTrackIds.has(f.trackId));
            for (const f of toMigrate) {
              addGuestFavoriteApi(venueCode, {
                guestName,
                trackId: f.trackId,
                title: f.title,
                artist: f.artist,
                album: f.album,
                albumCover: f.albumCover,
                previewUrl: f.previewUrl,
                duration: f.duration,
                isExplicit: f.isExplicit,
              }).catch(() => {});
              cloudFavs.push({
                trackId: f.trackId,
                title: f.title,
                artist: f.artist,
                album: f.album || "",
                albumCover: f.albumCover || "",
                previewUrl: f.previewUrl,
                duration: f.duration,
                isExplicit: f.isExplicit,
              });
            }
            localStorage.removeItem(legacyKey);
            if (legacyGlobalKey !== legacyKey) {
              localStorage.removeItem(legacyGlobalKey);
            }
          } catch {}
        }

        setFavorites(cloudFavs.slice(0, 50));
        setIsLoaded(true);
      })
      .catch(() => {
        setIsLoaded(true);
      });
  }, [venueCode, guestName]);

  const addFavorite = useCallback(
    (song: {
      id: string;
      title: string;
      artist: string;
      album?: string;
      albumCover?: string;
      previewUrl?: string;
      duration?: number;
      isExplicit?: boolean;
    }) => {
      const newFav: FavoriteSong = {
        trackId: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album || "",
        albumCover: song.albumCover || "",
        previewUrl: song.previewUrl,
        duration: song.duration,
        isExplicit: song.isExplicit,
      };

      setFavorites((prev) => {
        const filtered = prev.filter((f) => f.trackId !== song.id);
        return [newFav, ...filtered].slice(0, 50);
      });

      if (venueCode && guestName) {
        addGuestFavoriteApi(venueCode, {
          guestName,
          trackId: song.id,
          title: song.title,
          artist: song.artist,
          album: song.album,
          albumCover: song.albumCover,
          previewUrl: song.previewUrl,
          duration: song.duration,
          isExplicit: song.isExplicit,
        }).catch(console.error);
      }
    },
    [venueCode, guestName]
  );

  const removeFavorite = useCallback(
    (trackId: string) => {
      setFavorites((prev) => prev.filter((f) => f.trackId !== trackId));

      if (venueCode && guestName) {
        removeGuestFavoriteApi(venueCode, trackId, guestName).catch(console.error);
      }
    },
    [venueCode, guestName]
  );

  return { favorites, addFavorite, removeFavorite, isLoaded };
}
