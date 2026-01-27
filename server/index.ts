import express from "express";
import cors from "cors";
import ViteExpress from "vite-express";
import routes from "./routes";

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use(routes);

ViteExpress.listen(app, PORT, () => {
  console.log(`Jukboks server running on port ${PORT}`);
});
