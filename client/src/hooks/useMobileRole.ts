import { useState, useCallback } from "react";

export type MobileRole = "host" | "guest" | null;

export function useMobileRole() {
  const [role, setRoleState] = useState<MobileRole>(() => {
    return (localStorage.getItem("jukboks-mobile-role") as MobileRole) || null;
  });

  const [venueCode, setVenueCodeState] = useState<string | null>(() => {
    return localStorage.getItem("jukboks-guest-venue") || null;
  });

  const setRole = useCallback((newRole: MobileRole) => {
    setRoleState(newRole);
    if (newRole) {
      localStorage.setItem("jukboks-mobile-role", newRole);
    } else {
      localStorage.removeItem("jukboks-mobile-role");
    }
  }, []);

  const setVenueCode = useCallback((code: string | null) => {
    setVenueCodeState(code);
    if (code) {
      localStorage.setItem("jukboks-guest-venue", code);
    } else {
      localStorage.removeItem("jukboks-guest-venue");
    }
  }, []);

  const switchRole = useCallback(() => {
    setRole(null);
    setVenueCode(null);
  }, [setRole, setVenueCode]);

  return { role, setRole, venueCode, setVenueCode, switchRole };
}
