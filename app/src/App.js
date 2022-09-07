import { Routes, Route } from "react-router-dom";
import Config from "./components/Config";
import SaleLabel from "./components/SaleLabel";

const App = () => {
  return (
    <Routes>
      <Route exact path="/home" element={<SaleLabel />} />
      <Route exact path="/config" element={<Config />} />
    </Routes>
  );
}

export default App;
