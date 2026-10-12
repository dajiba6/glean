import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Keep request effects single-shot in development as well as production.
// StrictMode's development replay can start and abort a billable model request twice.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
