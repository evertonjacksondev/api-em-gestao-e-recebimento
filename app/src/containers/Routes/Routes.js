import { Route, BrowserRouter, Routes } from "react-router-dom";
import SaleLabel from "../Pages/Sale/SaleLabel";

const AppRoute = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SaleLabel />} path="/login" exact />
        <Route element={<SaleLabel />} path="*" exact />
      </Routes>
    </BrowserRouter>
  )
}

export default AppRoute;