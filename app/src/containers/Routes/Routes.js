
import React from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import NavBar from "../Components/NavBar/NavBar";
import Login from "../Pages/Login/Login";

import Register from "../Pages/Register/Register";
import SaleLabel from "../Pages/Sale/SaleLabel";

const AppRoute = () => {
  return (
    <React.Fragment>
      {['/home', 'login'].includes(useLocation().pathname) && <NavBar />}
      <Routes>
        <Route element={<SaleLabel />} path="/home" />
        <Route element={<Login />} path="/login" />
        <Route element={<Login />} path="/*" />
        <Route element={<Register />} path="/register"/>
      </Routes>
    </React.Fragment>
  )
}

export default AppRoute;