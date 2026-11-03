import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import { initialClient } from "./api.js";
import "./styles.css";
const recovery = new URLSearchParams(location.hash.slice(1)).get("draft");
const client = initialClient();
createRoot(document.getElementById("root")!).render(
  <App initialApi={client} recovery={recovery} />,
);
