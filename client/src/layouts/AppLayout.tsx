import { useState } from "react";
import { Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AppFooter } from "./AppFooter";

/**
 * Application shell: fixed sidebar + sticky header + scrolling content.
 *
 * The sidebar and header animate in once, after the startup screen fades
 * (doc 02 §Transition to Dashboard). Route changes do not replay them —
 * that would be motion for its own sake on every navigation.
 */
export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Phase 3 wires this to the compact synchronization overlay and the
    // real sync pipeline. Deliberately not the full startup screen.
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--color-background)]">
      <motion.div
        initial={{ x: -24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="flex"
      >
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </motion.div>

      <div className="flex min-w-0 flex-1 flex-col">
        <motion.div
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.08, ease: [0.4, 0, 0.2, 1] }}
        >
          <Header
            onRefresh={handleRefresh}
            refreshing={refreshing}
            onOpenSearch={() => {
              /* Global search dialog — Phase 2 */
            }}
          />
        </motion.div>

        {/* Single scroll container; the footer sits at its end so it never
            overlays content or floats above tables. */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto w-full max-w-[var(--max-width-app)] flex-1 p-[var(--spacing-content)]">
            <Outlet />
          </div>
          <AppFooter />
        </main>
      </div>
    </div>
  );
}
