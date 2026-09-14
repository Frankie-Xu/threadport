import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import { initialClient } from "./api.js";
import "./styles.css";
const client = initialClient();
createRoot(document.getElementById("root")!).render(
  <App initialApi={client} />,
);
