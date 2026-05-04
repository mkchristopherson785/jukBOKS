import { Route, Switch } from "wouter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useIsMobile, isCapacitor } from "./hooks/useCapacitor";
import HomePage from "./pages/HomePage";
import PartyPage from "./pages/PartyPage";
import KioskPage from "./pages/KioskPage";
import AdminPage from "./pages/AdminPage";
import VenuesPage from "./pages/VenuesPage";
import QueuePage from "./pages/QueuePage";
import TeamPage from "./pages/TeamPage";
import BrandingPage from "./pages/BrandingPage";
import SettingsPage from "./pages/SettingsPage";
import SuperAdminPage from "./pages/SuperAdminPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import MobileApp from "./pages/mobile/MobileApp";

function App() {
  const isMobile = useIsMobile();
  const isNative = isCapacitor();

  if (isNative) {
    return (
      <ErrorBoundary>
        <Switch>
          <Route path="/party/:code" component={PartyPage} />
          <Route path="/kiosk/:code" component={KioskPage} />
          <Route>
            <MobileApp />
          </Route>
        </Switch>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/">
          {isMobile ? <MobileApp /> : <HomePage />}
        </Route>
        <Route path="/mobile" component={MobileApp} />
        <Route path="/party/:code" component={PartyPage} />
        <Route path="/kiosk/:code" component={KioskPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/admin/venues" component={VenuesPage} />
        <Route path="/admin/queue" component={QueuePage} />
        <Route path="/admin/team" component={TeamPage} />
        <Route path="/admin/branding" component={BrandingPage} />
        <Route path="/admin/settings" component={SettingsPage} />
        <Route path="/admin/analytics" component={AnalyticsPage} />
        <Route path="/super-admin" component={SuperAdminPage} />
        <Route>
          <div className="min-h-screen flex items-center justify-center text-white">
            <h1 className="text-2xl">Page Not Found</h1>
          </div>
        </Route>
      </Switch>
    </ErrorBoundary>
  );
}

export default App;
