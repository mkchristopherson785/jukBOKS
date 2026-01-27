import { Route, Switch } from "wouter";
import HomePage from "./pages/HomePage";
import PartyPage from "./pages/PartyPage";
import KioskPage from "./pages/KioskPage";
import AdminPage from "./pages/AdminPage";

function App() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/party/:code" component={PartyPage} />
      <Route path="/kiosk/:code" component={KioskPage} />
      <Route path="/admin" component={AdminPage} />
      <Route>
        <div className="min-h-screen flex items-center justify-center text-white">
          <h1 className="text-2xl">Page Not Found</h1>
        </div>
      </Route>
    </Switch>
  );
}

export default App;
