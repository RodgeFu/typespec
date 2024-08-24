import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app.js";
//import "./scss/style.scss";

const ele = document.getElementById("root");
if (!ele) throw Error("Root element not found");

const root = createRoot(ele);
root.render((<App />) as React.ReactElement);
