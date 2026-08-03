import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useInitialization } from "./hooks/useInitialization";
import { StartupScreen } from "./components/startup/StartupScreen";
import { AppLayout } from "./layouts/AppLayout";
import { ContainerSearchPage } from "./pages/ContainerSearchPage";
import { CommandPalette } from "./components/CommandPalette";
import {
  AdministrationPage,
  AiAssistantPage,
  AlertsPage,
  CostAnalysisPage,
  DashboardPage,
  DetentionPage,
  PuLfdPage,
  ReportsPage,
  SettingsPage,
  SynchronizationPage,
  VendorsPage,
} from "./pages";

/**
 * Application root.
 *
 * The startup screen covers initialization, then hands over to the shell.
 * Both are mounted together so the dashboard is already composed behind the
 * fade — the transition reveals a ready screen rather than beginning to build
 * one (doc 02 §Transition to Dashboard).
 */
export default function App() {
  const init = useInitialization();
  const [dismissed, setDismissed] = useState(false);

  // Dismiss once initialization is ready AND the 800ms minimum has elapsed.
  // Both conditions live in the hook, so this is a single observation.
  useEffect(() => {
    if (init.phase === "ready" && init.canDismiss) setDismissed(true);
  }, [init.phase, init.canDismiss]);

  return (
    <BrowserRouter>
      <AnimatePresence>
        {!dismissed && (
          <StartupScreen
            key="startup"
            state={init}
            onContinueOffline={() => setDismissed(true)}
          />
        )}
      </AnimatePresence>

      {/* Mounted outside Routes so Ctrl+K works on every screen, including
          while the startup overlay is still up. */}
      <CommandPalette />

      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="containers" element={<ContainerSearchPage />} />
          {/* Container 360 is contextual, so it renders inside Container
              Search rather than as its own route — but stays deep-linkable. */}
          <Route path="containers/:containerNumber" element={<ContainerSearchPage />} />
          <Route path="pu-lfd" element={<PuLfdPage />} />
          <Route path="detention" element={<DetentionPage />} />
          <Route path="cost-analysis" element={<CostAnalysisPage />} />
          <Route path="vendors" element={<VendorsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="ai" element={<AiAssistantPage />} />
          <Route path="sync" element={<SynchronizationPage />} />
          <Route path="administration" element={<AdministrationPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
