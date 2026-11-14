import { BeerCosts } from "./pages/BeerCosts";
import { Utilities } from "./pages/Utilities";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { Recipes } from "./pages/Recipes";
import { RecipeDetail } from "./pages/RecipeDetail";
import { Batches } from "./pages/Batches";
import { BatchDetail } from "./pages/BatchDetail";
import { PurchaseDetail } from "./pages/Purchases";
import { MaterialsHub } from "./pages/MaterialsHub";
import { Expenses } from "./pages/Expenses";
import { Tastings } from "./pages/Tastings";
import { EquipmentProjects, EquipmentProject, EquipmentQuote } from "./pages/Equipment";
import { ChatPage, Dashboard, HistoryPage, Login, Settings } from "./pages/Misc";

export default function App() {
  const { session, loading } = useAuth();
  if (loading) return <div className="center-screen">🍺 Caricamento…</div>;
  if (!session) return <Login />;
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="ricette" element={<Recipes />} />
          <Route path="ricette/:id" element={<RecipeDetail />} />
          <Route path="batch" element={<Batches />} />
          <Route path="batch/:id" element={<BatchDetail />} />
          <Route path="degustazioni" element={<Tastings />} />
          <Route path="acquisti" element={<Navigate to="/materie-prime?vista=acquisti" replace />} />
          <Route path="acquisti/:id" element={<PurchaseDetail />} />
          <Route path="materie-prime" element={<MaterialsHub />} />
          <Route path="spese" element={<Expenses />} />
          <Route path="costi" element={<BeerCosts />} />
          <Route path="impianto" element={<EquipmentProjects />} />
          <Route path="impianto/:id" element={<EquipmentProject />} />
          <Route path="impianto/preventivo/:id" element={<EquipmentQuote />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="storico" element={<HistoryPage />} />
          <Route path="impostazioni" element={<Settings />} />
          <Route path="utilita" element={<Navigate to="/utilita/bottiglie" replace />} />
          <Route path="utilita/:tool" element={<Utilities />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
