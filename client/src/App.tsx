import { Route, Switch } from "wouter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import HomePage from "./pages/HomePage";
import PartyPage from "./pages/PartyPage";
import KioskPage from "./pages/KioskPage";
import AdminPage from "./pages/AdminPage";
import VenuesPage from "./pages/VenuesPage";
import QueuePage from "./pages/QueuePage";
import SuperAdminPage from "./pages/SuperAdminPage";

function App() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/party/:code" component={PartyPage} />
        <Route path="/kiosk/:code" component={KioskPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/admin/venues" component={VenuesPage} />
        <Route path="/admin/queue" component={QueuePage} />
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
