import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { Recipes } from "./pages/Recipes";
import { RecipeDetail } from "./pages/RecipeDetail";
import { Batches } from "./pages/Batches";
import { BatchDetail } from "./pages/BatchDetail";
import { Purchases, PurchaseDetail } from "./pages/Purchases";
import { Materials } from "./pages/Materials";
import { Expenses } from "./pages/Expenses";
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
          <Route path="acquisti" element={<Purchases />} />
          <Route path="acquisti/:id" element={<PurchaseDetail />} />
          <Route path="materie-prime" element={<Materials />} />
          <Route path="spese" element={<Expenses />} />
          <Route path="impianto" element={<EquipmentProjects />} />
          <Route path="impianto/:id" element={<EquipmentProject />} />
          <Route path="impianto/preventivo/:id" element={<EquipmentQuote />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="storico" element={<HistoryPage />} />
          <Route path="impostazioni" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
