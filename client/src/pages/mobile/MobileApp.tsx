import { useMobileRole } from "../../hooks/useMobileRole";
import MobileWelcome from "./MobileWelcome";
import GuestJoin from "./GuestJoin";
import GuestParty from "./GuestParty";
import HostApp from "./HostApp";

export default function MobileApp() {
  const { role, setRole, venueCode, setVenueCode, switchRole } = useMobileRole();

  if (!role) {
    return <MobileWelcome onSelectRole={setRole} />;
  }

  if (role === "guest") {
    if (!venueCode) {
      return (
        <GuestJoin
          onJoin={(code) => setVenueCode(code)}
          onBack={switchRole}
        />
      );
    }

    return (
      <GuestParty
        venueCode={venueCode}
        onLeave={() => {
          setVenueCode(null);
          switchRole();
        }}
      />
    );
  }

  if (role === "host") {
    return <HostApp onSwitchRole={switchRole} />;
  }

  return null;
}
