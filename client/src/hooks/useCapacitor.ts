import { useState, useEffect } from "react";

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768 || isCapacitor();
  });

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768 || isCapacitor());
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

export function isCapacitor(): boolean {
  return typeof (window as any).Capacitor !== "undefined";
}
