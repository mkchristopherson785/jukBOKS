import { useState, useEffect, useRef } from "react";
import { WifiOff, Wifi } from "lucide-react";

interface ConnectionStatusProps {
  isError?: boolean;
  isLoading?: boolean;
}

export function ConnectionStatus({ isError, isLoading }: ConnectionStatusProps) {
  const [showOffline, setShowOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOfflineRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (isError && !isLoading) {
      setShowOffline(true);
      wasOfflineRef.current = true;
      setShowReconnected(false);
    } else if (wasOfflineRef.current && !isError) {
      setShowOffline(false);
      wasOfflineRef.current = false;
      setShowReconnected(true);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => setShowReconnected(false), 3000);
    }

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [isError, isLoading]);

  if (showReconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center animate-slide-down">
        <div className="mx-4 mt-2 px-4 py-2 bg-green-500/20 border border-green-500/30 backdrop-blur-lg rounded-full flex items-center gap-2 text-green-300 text-sm shadow-lg">
          <Wifi className="w-4 h-4" />
          Reconnected
        </div>
      </div>
    );
  }

  if (!showOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center animate-slide-down">
      <div className="mx-4 mt-2 px-4 py-2 bg-red-500/20 border border-red-500/30 backdrop-blur-lg rounded-full flex items-center gap-2 text-red-300 text-sm shadow-lg">
        <WifiOff className="w-4 h-4 animate-pulse" />
        Connection lost — reconnecting...
      </div>
    </div>
  );
}
