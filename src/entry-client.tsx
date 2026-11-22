import { hydrateRoot } from "react-dom/client";
import SpeedRunGame from "./SpeedRunGame.tsx";
import { readConfig } from "./config.ts";

const root = document.getElementById("root");
if (root) hydrateRoot(root, <SpeedRunGame config={readConfig()} />);
