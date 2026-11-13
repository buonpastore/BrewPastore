import { useSearchParams } from "react-router-dom";
import { Tabs } from "../components/Layout";
import { Materials } from "./Materials";
import { Purchases } from "./Purchases";

/** Materie prime: costi medi e acquisti nella stessa pagina. */
export function MaterialsHub() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("vista") === "acquisti" ? "acquisti" : "costi";
  return (
    <div>
      <h1>Materie prime</h1>
      <Tabs full active={tab} onChange={(k) => setSp(k === "acquisti" ? { vista: "acquisti" } : {}, { replace: true })}
        tabs={[["costi", "Costi medi"], ["acquisti", "Acquisti e fatture"]]} />
      {tab === "costi" ? <Materials embedded /> : <Purchases embedded />}
    </div>
  );
}
